-- Requires the production schema in schema.md and 003_reservations.sql.
-- Migrations 001/002 describe an older schema and cannot bootstrap that schema.
BEGIN;

-- Business constants live here so previews and checkout use the same rules.
CREATE OR REPLACE FUNCTION public.circulation_policy()
RETURNS TABLE (
    time_zone TEXT,
    loan_period_days INTEGER,
    max_active_loans INTEGER,
    daily_penalty_rate NUMERIC,
    today DATE,
    due_date DATE
)
LANGUAGE sql STABLE SET search_path = '' AS $$
    WITH settings AS (
        SELECT 'Asia/Manila'::text AS time_zone, 14 AS loan_period_days,
               3 AS max_active_loans, 5.00::numeric AS daily_penalty_rate
    ), dated AS (
        SELECT settings.*, (now() AT TIME ZONE settings.time_zone)::date AS today
        FROM settings
    )
    SELECT dated.*, dated.today + dated.loan_period_days FROM dated;
$$;

CREATE INDEX IF NOT EXISTS idx_borrow_student_active_circulation
    ON public.borrow_records (student_id, due_date) WHERE return_date IS NULL;
CREATE INDEX IF NOT EXISTS idx_borrow_circulation_history
    ON public.borrow_records (borrow_date DESC, id);

-- security_invoker requires PostgreSQL 15+, as used by current Supabase projects.
CREATE OR REPLACE VIEW public.circulation_loans WITH (security_invoker = true) AS
SELECT loan.id, loan.student_id, loan.book_id, loan.issued_by,
       loan.borrow_date, loan.due_date, loan.return_date, loan.returned_to,
       loan.daily_penalty_rate,
       CASE WHEN loan.return_date IS NULL
            THEN GREATEST(0, policy.today - loan.due_date)
            ELSE loan.overdue_days END AS overdue_days,
       CASE WHEN loan.return_date IS NULL
            THEN GREATEST(0, policy.today - loan.due_date) * loan.daily_penalty_rate
            ELSE loan.fine_amount END AS fine_amount,
       loan.fine_paid_at, loan.receipt_number, profile.student_number,
       concat_ws(' ', student.first_name, student.middle_name, student.last_name) AS student_name,
       book.title AS book_title, book.author AS book_author
FROM public.borrow_records loan
JOIN public.users student ON student.users_id = loan.student_id
LEFT JOIN public.profiles profile ON profile.id = loan.student_id
LEFT JOIN public.books book ON book.books_id = loan.book_id
CROSS JOIN public.circulation_policy() policy;

CREATE OR REPLACE FUNCTION public.borrow_book(
    p_student_number TEXT,
    p_book_id UUID,
    p_issued_by UUID
)
RETURNS public.borrow_records
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_student_id UUID;
    v_is_active BOOLEAN;
    v_academic_status TEXT;
    v_book public.books;
    v_loan public.borrow_records;
    v_reservation public.reservations;
    v_policy RECORD;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.users
        WHERE users_id = p_issued_by AND is_active AND role IN ('Librarian', 'Admin')
    ) THEN
        RAISE SQLSTATE 'PT403' USING MESSAGE = 'An active staff account is required.';
    END IF;

    -- Serializes checkouts of different titles for the same student.
    SELECT student.users_id, student.is_active, profile.academic_status::text
    INTO v_student_id, v_is_active, v_academic_status
    FROM public.users student
    JOIN public.profiles profile ON profile.id = student.users_id
    WHERE profile.student_number = upper(trim(p_student_number))
      AND profile.role::text = 'student' AND student.role = 'Students'
    FOR UPDATE OF student, profile;

    IF NOT FOUND THEN
        RAISE SQLSTATE 'PT404' USING MESSAGE = 'Student ID was not found.';
    END IF;
    IF NOT v_is_active OR v_academic_status <> 'active' THEN
        RAISE SQLSTATE 'PT403' USING MESSAGE = 'This student account is inactive.';
    END IF;

    SELECT * INTO v_policy FROM public.circulation_policy();
    IF EXISTS (
        SELECT 1 FROM public.borrow_records
        WHERE student_id = v_student_id AND return_date IS NULL AND due_date < v_policy.today
    ) THEN
        RAISE SQLSTATE 'PT409' USING MESSAGE = 'Resolve overdue items before borrowing.';
    END IF;
    IF (SELECT count(*) FROM public.borrow_records
        WHERE student_id = v_student_id AND return_date IS NULL) >= v_policy.max_active_loans THEN
        RAISE SQLSTATE 'PT409' USING MESSAGE = 'This student has reached the active loan limit.';
    END IF;

    SELECT * INTO v_book FROM public.books
    WHERE books_id = p_book_id AND is_active FOR UPDATE;
    IF NOT FOUND THEN
        RAISE SQLSTATE 'PT404' USING MESSAGE = 'Book was not found or has been archived.';
    END IF;
    IF v_book.copies < 1 THEN
        RAISE SQLSTATE 'PT409' USING MESSAGE = 'No copies are available. Create a reservation instead.';
    END IF;

    -- Ignore expired holds without taking locks on unrelated reservations.
    SELECT * INTO v_reservation FROM public.reservations
    WHERE book_id = p_book_id AND status = 'active' AND expires_at > now()
    ORDER BY reserved_at, id LIMIT 1 FOR UPDATE;
    IF v_reservation.id IS NOT NULL AND v_reservation.student_id <> v_student_id THEN
        RAISE SQLSTATE 'PT409' USING MESSAGE = 'This copy is reserved for another student.';
    END IF;

    INSERT INTO public.borrow_records (
        student_id, book_id, issued_by, due_date, daily_penalty_rate
    ) VALUES (
        v_student_id, p_book_id, p_issued_by, v_policy.due_date, v_policy.daily_penalty_rate
    ) RETURNING * INTO v_loan;

    UPDATE public.books SET copies = copies - 1 WHERE books_id = p_book_id;
    IF v_reservation.id IS NOT NULL THEN
        UPDATE public.reservations SET status = 'fulfilled', fulfilled_at = now()
        WHERE id = v_reservation.id;
    END IF;
    RETURN v_loan;
END;
$$;

-- Replace the legacy receipt-number overload: collection must be explicit and
-- receipt numbers must be generated inside the transaction.
DROP FUNCTION IF EXISTS public.return_book(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.return_book(
    p_borrow_id UUID,
    p_returned_to UUID,
    p_fine_collected BOOLEAN DEFAULT false
)
RETURNS public.borrow_records
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_student_id UUID;
    v_loan public.borrow_records;
    v_policy RECORD;
    v_now TIMESTAMPTZ := now();
    v_overdue_days INTEGER;
    v_fine NUMERIC(10, 2);
    v_receipt TEXT;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.users
        WHERE users_id = p_returned_to AND is_active AND role IN ('Librarian', 'Admin')
    ) THEN
        RAISE SQLSTATE 'PT403' USING MESSAGE = 'An active staff account is required.';
    END IF;

    SELECT student_id INTO v_student_id FROM public.borrow_records WHERE id = p_borrow_id;
    IF NOT FOUND THEN
        RAISE SQLSTATE 'PT404' USING MESSAGE = 'Loan was not found.';
    END IF;

    -- Match checkout's student-first lock order before updating loans or stock.
    PERFORM 1 FROM public.users WHERE users_id = v_student_id FOR UPDATE;
    SELECT * INTO v_loan FROM public.borrow_records WHERE id = p_borrow_id FOR UPDATE;
    IF v_loan.return_date IS NOT NULL THEN
        RAISE SQLSTATE 'PT409' USING MESSAGE = 'This loan has already been returned.';
    END IF;

    SELECT * INTO v_policy FROM public.circulation_policy();
    v_overdue_days := GREATEST(0, v_policy.today - v_loan.due_date);
    v_fine := v_overdue_days * v_loan.daily_penalty_rate;
    IF v_fine > 0 AND p_fine_collected IS DISTINCT FROM true THEN
        RAISE SQLSTATE 'PT409' USING MESSAGE = 'Confirm fine collection before returning this overdue book.';
    END IF;
    IF v_fine > 0 THEN
        v_receipt := 'RCP-' || to_char(v_policy.today, 'YYYYMMDD') || '-' ||
                     upper(substr(gen_random_uuid()::text, 1, 8));
    END IF;

    UPDATE public.borrow_records
    SET return_date = v_now, returned_to = p_returned_to,
        overdue_days = v_overdue_days, fine_amount = v_fine,
        fine_paid_at = CASE WHEN v_fine > 0 THEN v_now ELSE NULL END,
        receipt_number = v_receipt
    WHERE id = p_borrow_id RETURNING * INTO v_loan;

    IF v_loan.book_id IS NOT NULL THEN
        UPDATE public.books SET copies = copies + 1 WHERE books_id = v_loan.book_id;
    END IF;
    RETURN v_loan;
END;
$$;

-- Browser roles cannot call privileged circulation operations or spoof staff IDs.
REVOKE ALL ON FUNCTION public.borrow_book(TEXT, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.return_book(UUID, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.circulation_policy() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.circulation_loans FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.borrow_book(TEXT, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.return_book(UUID, UUID, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.circulation_policy() TO service_role;
GRANT SELECT ON public.circulation_loans TO service_role;

COMMIT;
