BEGIN;
DO $$
DECLARE
    v_staff UUID := gen_random_uuid();
    v_student UUID := gen_random_uuid();
    v_number TEXT := upper('TEST-' || gen_random_uuid()::text);
    v_book public.catalog_books;
    v_loan public.borrow_records;
    v_reservation public.reservations;
BEGIN
    INSERT INTO public.users (users_id,first_name,last_name,email,password,role)
    VALUES (v_staff,'Test','Staff',v_staff::text || '@example.test','test-profile-only','Librarian'),
           (v_student,'Test','Student',v_student::text || '@example.test','test-profile-only','Students');
    INSERT INTO public.profiles (id,student_number,first_name,last_name,email)
    VALUES (v_student,v_number,'Test','Student',v_student::text || '@example.test');
    v_book := public.save_catalog_book(NULL,'New title','Author','History',2026,2,'A-1');
    IF v_book.total <> 2 OR v_book.available <> 2 OR v_book.shelf <> 'A-1' THEN
        RAISE EXCEPTION 'Catalog creation did not persist the submitted values.';
    END IF;
    v_reservation := public.create_reservation(v_number,v_book.id,v_staff);
    IF v_reservation.student_id <> v_student THEN RAISE EXCEPTION 'Reservation did not use profiles.'; END IF;
    v_loan := public.borrow_book(v_number,v_book.id,v_staff);
    SELECT * INTO v_book FROM public.catalog_books WHERE id = v_book.id;
    IF v_book.available <> 1 OR v_book.total <> 2 THEN RAISE EXCEPTION 'Checkout changed catalog total.'; END IF;
    v_book := public.save_catalog_book(v_book.id,'Updated title','Author','History',NULL,4,'A-2');
    IF v_book.title <> 'Updated title' OR v_book.total <> 4 OR v_book.available <> 3 OR v_book.year IS NOT NULL THEN
        RAISE EXCEPTION 'Edit did not account for the active loan.';
    END IF;
    BEGIN
        PERFORM public.save_catalog_book(v_book.id,'Updated title','Author','',NULL,0,'');
        RAISE EXCEPTION 'Invalid copy reduction was accepted.';
    EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
    END;
    v_book := public.archive_catalog_book(v_book.id);
    IF v_book.active OR NOT EXISTS (SELECT 1 FROM public.borrow_records WHERE id = v_loan.id) THEN
        RAISE EXCEPTION 'Archive removed history or failed to archive.';
    END IF;
    PERFORM public.return_book(v_loan.id,v_staff,false);
    SELECT * INTO v_book FROM public.catalog_books WHERE id = v_book.id;
    IF v_book.available <> 4 OR v_book.total <> 4 THEN RAISE EXCEPTION 'Archived return stock was incorrect.'; END IF;
    IF has_function_privilege('anon','public.save_catalog_book(uuid,text,text,text,integer,integer,text)','EXECUTE')
       OR has_function_privilege('authenticated','public.archive_catalog_book(uuid)','EXECUTE') THEN
        RAISE EXCEPTION 'Catalog write functions are exposed.';
    END IF;
END;
$$;
ROLLBACK;
