-- Requires the production schema and migrations 003/004.
BEGIN;

ALTER TABLE public.books ADD COLUMN IF NOT EXISTS shelf_location TEXT NOT NULL DEFAULT '';

CREATE OR REPLACE VIEW public.catalog_books WITH (security_invoker = true) AS
SELECT book.books_id AS id, book.title, book.author, coalesce(book.category, '') AS category,
       book.publication_year AS year, book.copies AS available,
       book.copies + (SELECT count(*) FROM public.borrow_records loan
                      WHERE loan.book_id = book.books_id AND loan.return_date IS NULL) AS total,
       book.shelf_location AS shelf, book.is_active AS active
FROM public.books book;

CREATE OR REPLACE FUNCTION public.save_catalog_book(
    p_book_id UUID, p_title TEXT, p_author TEXT, p_category TEXT,
    p_publication_year INTEGER, p_total_copies INTEGER, p_shelf_location TEXT
)
RETURNS public.catalog_books
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_id UUID;
    v_checked_out INTEGER;
    v_book public.catalog_books;
BEGIN
    IF p_title IS NULL OR length(trim(p_title)) NOT BETWEEN 1 AND 500
       OR p_author IS NULL OR length(trim(p_author)) NOT BETWEEN 1 AND 500
       OR p_total_copies IS NULL OR p_total_copies NOT BETWEEN 0 AND 1000000
       OR (p_publication_year IS NOT NULL AND p_publication_year NOT BETWEEN 1 AND 9999)
       OR length(coalesce(p_category, '')) > 200 OR length(coalesce(p_shelf_location, '')) > 200 THEN
        RAISE SQLSTATE 'PT400' USING MESSAGE = 'Book fields are invalid.';
    END IF;
    IF p_book_id IS NULL THEN
        INSERT INTO public.books (title, author, category, publication_year, copies, shelf_location)
        VALUES (trim(p_title), trim(p_author), nullif(trim(p_category), ''), p_publication_year,
                p_total_copies, coalesce(trim(p_shelf_location), ''))
        RETURNING books_id INTO v_id;
    ELSE
        -- Checkout also locks this row before inserting a loan; returns restore
        -- their stock after updating the loan, so adjustments remain consistent.
        PERFORM 1 FROM public.books WHERE books_id = p_book_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE SQLSTATE 'PT404' USING MESSAGE = 'Book was not found.';
        END IF;
        SELECT count(*) INTO v_checked_out FROM public.borrow_records
        WHERE book_id = p_book_id AND return_date IS NULL;
        IF p_total_copies < v_checked_out THEN
            RAISE SQLSTATE 'PT409' USING MESSAGE = 'Total copies cannot be less than copies currently checked out.';
        END IF;
        UPDATE public.books
        SET title = trim(p_title), author = trim(p_author), category = nullif(trim(p_category), ''),
            publication_year = p_publication_year, copies = p_total_copies - v_checked_out,
            shelf_location = coalesce(trim(p_shelf_location), '')
        WHERE books_id = p_book_id;
        v_id := p_book_id;
    END IF;
    SELECT * INTO v_book FROM public.catalog_books WHERE id = v_id;
    RETURN v_book;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_catalog_book(p_book_id UUID)
RETURNS public.catalog_books
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_book public.catalog_books;
BEGIN
    UPDATE public.books SET is_active = false WHERE books_id = p_book_id;
    IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE = 'Book was not found.'; END IF;
    SELECT * INTO v_book FROM public.catalog_books WHERE id = p_book_id;
    RETURN v_book;
END;
$$;

-- Keep reservation reads aligned with profiles.student_number.
CREATE OR REPLACE VIEW public.circulation_reservations WITH (security_invoker = true) AS
SELECT reservation.id, reservation.status, reservation.reserved_at, reservation.expires_at,
       profile.student_number,
       concat_ws(' ', student.first_name, student.middle_name, student.last_name) AS student_name,
       book.books_id AS book_id, book.title AS book_title, book.author AS book_author,
       book.copies AS available_copies
FROM public.reservations reservation
JOIN public.users student ON student.users_id = reservation.student_id
JOIN public.profiles profile ON profile.id = reservation.student_id
JOIN public.books book ON book.books_id = reservation.book_id;

CREATE OR REPLACE FUNCTION public.create_reservation(
    p_student_number TEXT, p_book_id UUID, p_reserved_by UUID
)
RETURNS public.reservations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_student_id UUID;
    v_result public.reservations;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE users_id = p_reserved_by
                   AND is_active AND role IN ('Librarian', 'Admin')) THEN
        RAISE SQLSTATE 'PT403' USING MESSAGE = 'An active staff account is required.';
    END IF;
    SELECT student.users_id INTO v_student_id
    FROM public.users student JOIN public.profiles profile ON profile.id = student.users_id
    WHERE profile.student_number = upper(trim(p_student_number)) AND student.role = 'Students'
      AND student.is_active AND profile.role::text = 'student' AND profile.academic_status::text = 'active';
    IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE = 'Active student was not found.'; END IF;
    PERFORM 1 FROM public.books WHERE books_id = p_book_id AND is_active FOR UPDATE;
    IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE = 'Book was not found or has been archived.'; END IF;
    UPDATE public.reservations SET status = 'expired'
    WHERE student_id = v_student_id AND book_id = p_book_id AND status = 'active' AND expires_at <= now();
    INSERT INTO public.reservations (student_id, book_id, reserved_by)
    VALUES (v_student_id, p_book_id, p_reserved_by) RETURNING * INTO v_result;
    RETURN v_result;
END;
$$;

REVOKE ALL ON public.catalog_books, public.circulation_reservations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.catalog_books, public.circulation_reservations TO service_role;
REVOKE ALL ON FUNCTION public.save_catalog_book(UUID,TEXT,TEXT,TEXT,INTEGER,INTEGER,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.archive_catalog_book(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_reservation(TEXT,UUID,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_catalog_book(UUID,TEXT,TEXT,TEXT,INTEGER,INTEGER,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.archive_catalog_book(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_reservation(TEXT,UUID,UUID) TO service_role;

COMMIT;
