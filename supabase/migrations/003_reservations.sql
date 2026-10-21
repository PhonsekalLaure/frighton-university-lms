-- ============================================================
-- Frighton University LMS: 003_reservations.sql
-- Applies to the production schema documented in schema.md.
-- ============================================================

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS student_number TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_student_number
    ON public.users (student_number)
    WHERE student_number IS NOT NULL;

ALTER TABLE public.reservations
    ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_reservations_student_active
    ON public.reservations (student_id, reserved_at)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_reservations_book_active
    ON public.reservations (book_id, reserved_at)
    WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS one_active_reservation_per_student_book
    ON public.reservations (student_id, book_id)
    WHERE status = 'active';

CREATE OR REPLACE FUNCTION public.expire_reservations()
RETURNS INTEGER AS $$
DECLARE
    v_expired_count INTEGER;
BEGIN
    UPDATE public.reservations
    SET status = 'expired'
    WHERE status = 'active'
      AND expires_at <= now();

    GET DIAGNOSTICS v_expired_count = ROW_COUNT;
    RETURN v_expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.create_reservation(
    p_student_number TEXT,
    p_book_id UUID,
    p_reserved_by UUID
)
RETURNS public.reservations AS $$
DECLARE
    v_student_id UUID;
    v_reservation public.reservations;
BEGIN
    PERFORM public.expire_reservations();

    SELECT users_id INTO v_student_id
    FROM public.users
    WHERE student_number = trim(p_student_number)
      AND role = 'Students'
      AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active student % was not found.', trim(p_student_number);
    END IF;

    PERFORM 1
    FROM public.books
    WHERE books_id = p_book_id
      AND is_active = true
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Book not found or archived.';
    END IF;

    INSERT INTO public.reservations (student_id, book_id, reserved_by)
    VALUES (v_student_id, p_book_id, p_reserved_by)
    RETURNING * INTO v_reservation;

    RETURN v_reservation;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.borrow_book(
    p_student_number TEXT,
    p_book_id UUID,
    p_issued_by UUID
)
RETURNS public.borrow_records AS $$
DECLARE
    v_student_id UUID;
    v_book public.books;
    v_loan public.borrow_records;
    v_first_reservation public.reservations;
    v_active_loans INTEGER;
BEGIN
    PERFORM public.expire_reservations();

    SELECT users_id INTO v_student_id
    FROM public.users
    WHERE student_number = trim(p_student_number)
      AND role = 'Students'
      AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active student % was not found.', trim(p_student_number);
    END IF;

    SELECT * INTO v_book
    FROM public.books
    WHERE books_id = p_book_id
      AND is_active = true
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Book not found or archived.';
    END IF;

    IF v_book.copies < 1 THEN
        RAISE EXCEPTION 'No copies are available for checkout.';
    END IF;

    SELECT * INTO v_first_reservation
    FROM public.reservations
    WHERE book_id = p_book_id
      AND status = 'active'
    ORDER BY reserved_at
    LIMIT 1
    FOR UPDATE;

    IF v_first_reservation.id IS NOT NULL
       AND v_first_reservation.student_id <> v_student_id THEN
        RAISE EXCEPTION 'This copy is reserved for another student until %.',
            v_first_reservation.expires_at AT TIME ZONE 'Asia/Manila';
    END IF;

    SELECT COUNT(*) INTO v_active_loans
    FROM public.borrow_records
    WHERE student_id = v_student_id
      AND return_date IS NULL;

    IF v_active_loans >= 3 THEN
        RAISE EXCEPTION 'This student already has the maximum of 3 active loans.';
    END IF;

    UPDATE public.books
    SET copies = copies - 1
    WHERE books_id = p_book_id;

    INSERT INTO public.borrow_records (student_id, book_id, issued_by, due_date)
    VALUES (
        v_student_id,
        p_book_id,
        p_issued_by,
        (now() AT TIME ZONE 'Asia/Manila')::date + 14
    )
    RETURNING * INTO v_loan;

    IF v_first_reservation.id IS NOT NULL THEN
        UPDATE public.reservations
        SET status = 'fulfilled', fulfilled_at = now()
        WHERE id = v_first_reservation.id;
    END IF;

    RETURN v_loan;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
