BEGIN;
DO $$
DECLARE
    v_staff UUID := gen_random_uuid();
    v_student UUID := gen_random_uuid();
    v_number TEXT := upper('TEST-' || gen_random_uuid()::text);
    v_book public.catalog_books;
    v_reservation public.reservations;
    v_count INTEGER;
BEGIN
    INSERT INTO public.users (users_id,first_name,last_name,email,password,role)
    VALUES (v_staff,'Test','Staff',v_staff::text || '@example.test','test-profile-only','Librarian'),
           (v_student,'Test','Student',v_student::text || '@example.test','test-profile-only','Students');
    INSERT INTO public.profiles (id,student_number,first_name,last_name,email)
    VALUES (v_student,v_number,'Test','Student',v_student::text || '@example.test');

    v_book := public.save_catalog_book(NULL,'Reservation test','Author','History',2026,1,'R-1');
    v_reservation := public.create_reservation(v_number,v_book.id,v_staff);
    IF v_reservation.student_id <> v_student OR v_reservation.reserved_by <> v_staff THEN
        RAISE EXCEPTION 'Reservation identity or actor was not persisted.';
    END IF;

    v_reservation := public.cancel_reservation(v_reservation.id,v_staff);
    IF v_reservation.status <> 'cancelled' OR v_reservation.cancelled_at IS NULL THEN
        RAISE EXCEPTION 'Reservation cancellation was not persisted.';
    END IF;

    v_reservation := public.create_reservation(v_number,v_book.id,v_staff);
    UPDATE public.reservations SET expires_at = now() - interval '1 second' WHERE id = v_reservation.id;
    v_count := public.expire_reservations();
    IF v_count < 1 OR (SELECT status FROM public.reservations WHERE id = v_reservation.id) <> 'expired' THEN
        RAISE EXCEPTION 'Expired reservations were not released.';
    END IF;

    IF has_function_privilege('anon','public.expire_reservations()','EXECUTE')
       OR has_function_privilege('authenticated','public.cancel_reservation(uuid,uuid)','EXECUTE')
       OR NOT has_function_privilege('service_role','public.cancel_reservation(uuid,uuid)','EXECUTE') THEN
        RAISE EXCEPTION 'Reservation API function privileges are incorrect.';
    END IF;
END;
$$;
ROLLBACK;
