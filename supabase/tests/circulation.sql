-- Run as the database owner on an isolated database after migration 004.
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/circulation.sql
BEGIN;

DO $$
DECLARE
    v_staff UUID := gen_random_uuid();
    v_student UUID := gen_random_uuid();
    v_other UUID := gen_random_uuid();
    v_book UUID := gen_random_uuid();
    v_other_book UUID := gen_random_uuid();
    v_reservation UUID := gen_random_uuid();
    v_number TEXT := upper('TEST-' || gen_random_uuid()::text);
    v_other_number TEXT := upper('TEST-' || gen_random_uuid()::text);
    v_loan public.borrow_records;
    v_return public.borrow_records;
    v_policy RECORD;
    v_count INTEGER;
BEGIN
    SELECT * INTO v_policy FROM public.circulation_policy();
    INSERT INTO public.users (users_id, first_name, last_name, email, password, role)
    VALUES
        (v_staff, 'Test', 'Staff', v_staff::text || '@example.test', 'test-profile-only', 'Admin'),
        (v_student, 'Test', 'Student', v_student::text || '@example.test', 'test-profile-only', 'Students'),
        (v_other, 'Other', 'Student', v_other::text || '@example.test', 'test-profile-only', 'Students');
    INSERT INTO public.profiles (id, student_number, first_name, last_name, email)
    VALUES
        (v_student, v_number, 'Test', 'Student', v_student::text || '@example.test'),
        (v_other, v_other_number, 'Other', 'Student', v_other::text || '@example.test');
    INSERT INTO public.books (books_id, title, author, copies)
    VALUES (v_book, 'Circulation test', 'Test author', 1),
           (v_other_book, 'Second circulation test', 'Test author', 1);

    -- Profiles are the authoritative student-number source.
    v_loan := public.borrow_book(v_number, v_book, v_staff);
    IF v_loan.student_id <> v_student OR v_loan.issued_by <> v_staff
       OR v_loan.due_date <> v_policy.due_date OR v_loan.daily_penalty_rate <> 5 THEN
        RAISE EXCEPTION 'Checkout did not preserve identity, staff, policy date, and rate.';
    END IF;
    IF (SELECT copies FROM public.books WHERE books_id = v_book) <> 0 THEN
        RAISE EXCEPTION 'Checkout did not decrement stock.';
    END IF;

    BEGIN
        PERFORM public.borrow_book(v_other_number, v_book, v_staff);
        RAISE EXCEPTION 'Out-of-stock checkout was accepted.';
    EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
    END;

    v_return := public.return_book(v_loan.id, v_staff, false);
    IF v_return.return_date IS NULL OR v_return.returned_to <> v_staff
       OR v_return.fine_amount <> 0 OR v_return.fine_paid_at IS NOT NULL
       OR v_return.receipt_number IS NOT NULL THEN
        RAISE EXCEPTION 'On-time return recorded incorrect payment details.';
    END IF;
    BEGIN
        PERFORM public.return_book(v_loan.id, v_staff, false);
        RAISE EXCEPTION 'Duplicate return was accepted.';
    EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
    END;
    IF (SELECT copies FROM public.books WHERE books_id = v_book) <> 1 THEN
        RAISE EXCEPTION 'Return restored stock more than once.';
    END IF;

    -- Honor the loan's saved rate and preserve stock when collection is declined.
    v_loan := public.borrow_book(v_number, v_book, v_staff);
    UPDATE public.borrow_records SET due_date = v_policy.today - 2, daily_penalty_rate = 7.50
    WHERE id = v_loan.id;
    IF (SELECT fine_amount FROM public.circulation_loans WHERE id = v_loan.id) <> 15 THEN
        RAISE EXCEPTION 'Fine quote ignored the per-loan rate.';
    END IF;
    BEGIN
        PERFORM public.return_book(v_loan.id, v_staff, false);
        RAISE EXCEPTION 'Uncollected fine was accepted.';
    EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
    END;
    IF (SELECT return_date FROM public.borrow_records WHERE id = v_loan.id) IS NOT NULL
       OR (SELECT copies FROM public.books WHERE books_id = v_book) <> 0 THEN
        RAISE EXCEPTION 'Rejected return changed loan or stock.';
    END IF;
    BEGIN
        PERFORM public.borrow_book(v_number, v_other_book, v_staff);
        RAISE EXCEPTION 'Overdue student was allowed to borrow.';
    EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
    END;
    v_return := public.return_book(v_loan.id, v_staff, true);
    IF v_return.overdue_days <> 2 OR v_return.fine_amount <> 15
       OR v_return.fine_paid_at IS NULL
       OR v_return.receipt_number IS NULL OR v_return.receipt_number !~ ('^RCP-' || to_char(v_policy.today, 'YYYYMMDD') || '-[A-F0-9]{8}$') THEN
        RAISE EXCEPTION 'Overdue return fine, payment, or receipt is incorrect.';
    END IF;

    UPDATE public.users SET is_active = false WHERE users_id = v_student;
    BEGIN
        PERFORM public.borrow_book(v_number, v_book, v_staff);
        RAISE EXCEPTION 'Inactive student was allowed to borrow.';
    EXCEPTION WHEN SQLSTATE 'PT403' THEN NULL;
    END;
    UPDATE public.users SET is_active = true WHERE users_id = v_student;

    UPDATE public.books SET is_active = false WHERE books_id = v_book;
    BEGIN
        PERFORM public.borrow_book(v_number, v_book, v_staff);
        RAISE EXCEPTION 'Archived title was allowed to circulate.';
    EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL;
    END;
    UPDATE public.books SET is_active = true WHERE books_id = v_book;

    BEGIN
        PERFORM public.borrow_book(v_number, v_book, v_student);
        RAISE EXCEPTION 'Student was allowed to impersonate staff.';
    EXCEPTION WHEN SQLSTATE 'PT403' THEN NULL;
    END;

    INSERT INTO public.borrow_records (student_id, book_id, issued_by, due_date)
    SELECT v_student, v_other_book, v_staff, v_policy.due_date FROM generate_series(1, 3);
    BEGIN
        PERFORM public.borrow_book(v_number, v_book, v_staff);
        RAISE EXCEPTION 'Loan limit was exceeded.';
    EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
    END;
    DELETE FROM public.borrow_records WHERE student_id = v_student AND return_date IS NULL;

    -- Another student's active hold has priority; expired holds do not.
    INSERT INTO public.reservations (id, student_id, book_id, reserved_by)
    VALUES (v_reservation, v_other, v_book, v_staff);
    BEGIN
        PERFORM public.borrow_book(v_number, v_book, v_staff);
        RAISE EXCEPTION 'Another student reservation was ignored.';
    EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
    END;
    UPDATE public.reservations SET expires_at = now() - interval '1 second' WHERE id = v_reservation;
    v_loan := public.borrow_book(v_number, v_book, v_staff);
    PERFORM public.return_book(v_loan.id, v_staff, false);
    UPDATE public.reservations SET status = 'expired' WHERE id = v_reservation;
    INSERT INTO public.reservations (student_id, book_id, reserved_by)
    VALUES (v_student, v_book, v_staff);
    v_loan := public.borrow_book(v_number, v_book, v_staff);
    SELECT count(*) INTO v_count FROM public.reservations
    WHERE student_id = v_student AND book_id = v_book AND status = 'fulfilled' AND fulfilled_at IS NOT NULL;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Matching reservation was not fulfilled.';
    END IF;

    -- Inactive borrowers can still return their existing items.
    UPDATE public.users SET is_active = false WHERE users_id = v_student;
    PERFORM public.return_book(v_loan.id, v_staff, false);

    IF has_function_privilege('anon', 'public.borrow_book(text,uuid,uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.borrow_book(text,uuid,uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.return_book(uuid,uuid,boolean)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.return_book(uuid,uuid,boolean)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.return_book(uuid,uuid,boolean)', 'EXECUTE')
       OR to_regprocedure('public.return_book(uuid,uuid,text)') IS NOT NULL THEN
        RAISE EXCEPTION 'Circulation RPC privileges are incorrect.';
    END IF;

    RAISE NOTICE 'Circulation database tests passed; all fixtures will be rolled back.';
END;
$$;

ROLLBACK;
