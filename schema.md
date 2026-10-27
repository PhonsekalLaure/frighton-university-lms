# Frighton University LMS - Database Schema

A clean, direct, and production-ready Supabase PostgreSQL schema with **Indexing** and **Row Level Security (RLS)**.

---

## 1. Table Definitions

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS (auth identity for students and staff)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
    users_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name  TEXT NOT NULL,
    middle_name TEXT,
    last_name   TEXT NOT NULL,
    email       TEXT NOT NULL UNIQUE,
    password    TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'Students'
                CHECK (role IN ('Students', 'Librarian', 'Admin')),
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- PROFILES (SIS student record; student_number lives here only)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id              UUID PRIMARY KEY REFERENCES public.users(users_id),
    student_number  VARCHAR UNIQUE,
    first_name      VARCHAR NOT NULL,
    last_name       VARCHAR NOT NULL,
    email           VARCHAR NOT NULL UNIQUE,
    role            public.sis_user_role NOT NULL DEFAULT 'student',
    academic_status public.academic_status NOT NULL DEFAULT 'active',
    department      VARCHAR,
    program         VARCHAR,
    year_level      SMALLINT CHECK (year_level >= 1 AND year_level <= 4),
    avatar_url      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ============================================================
-- BOOKS
-- ============================================================
CREATE TABLE public.books (
    books_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title            TEXT NOT NULL,
    author           TEXT NOT NULL,
    category         TEXT,
    publisher        TEXT,
    publication_year INT,
    copies           INT NOT NULL DEFAULT 1 CHECK (copies >= 0),
    description      TEXT,
    cover_image_path TEXT, -- Object path in the private book-covers bucket
    is_active        BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- BORROW_RECORDS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.borrow_records (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id         UUID NOT NULL REFERENCES public.users(users_id) ON DELETE RESTRICT,
    book_copy_id       UUID,
    book_id            UUID REFERENCES public.books(books_id) ON DELETE CASCADE,
    issued_by          UUID REFERENCES public.users(users_id),
    borrow_date        TIMESTAMPTZ NOT NULL DEFAULT now(),
    due_date           DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Manila')::date + 14),
    daily_penalty_rate NUMERIC(10, 2) NOT NULL DEFAULT 5.00,

    -- Filled in on return:
    return_date        TIMESTAMPTZ,
    returned_to        UUID REFERENCES public.users(users_id),
    overdue_days       INT NOT NULL DEFAULT 0,
    fine_amount        NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    fine_paid_at       TIMESTAMPTZ,
    receipt_number     TEXT UNIQUE,

    idempotency_key    UUID UNIQUE DEFAULT gen_random_uuid()
);

-- ============================================================
-- RESERVATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reservations (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id   UUID NOT NULL REFERENCES public.users(users_id) ON DELETE RESTRICT,
    book_id      UUID NOT NULL REFERENCES public.books(books_id) ON DELETE CASCADE,
    status       TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'fulfilled', 'cancelled', 'expired')),
    reserved_by  UUID NOT NULL REFERENCES public.users(users_id), -- librarian who took it
    reserved_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '3 days'),
    fulfilled_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ
);

-- ============================================================
-- SIS: ACADEMIC TERMS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.academic_terms (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code       VARCHAR NOT NULL UNIQUE,
    name       VARCHAR NOT NULL,
    start_date DATE NOT NULL,
    end_date   DATE NOT NULL,
    is_active  BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ============================================================
-- SIS: COURSES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.courses (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_code VARCHAR NOT NULL UNIQUE,
    title       VARCHAR NOT NULL,
    description TEXT,
    credits     SMALLINT NOT NULL CHECK (credits > 0),
    department  VARCHAR NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ============================================================
-- SIS: COURSE SECTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.course_sections (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id        UUID NOT NULL REFERENCES public.courses(id),
    term_id          UUID NOT NULL REFERENCES public.academic_terms(id),
    section_number   VARCHAR NOT NULL DEFAULT '01',
    instructor_name  VARCHAR,
    instructor_email VARCHAR,
    schedule         VARCHAR,
    room             VARCHAR,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ============================================================
-- SIS: ACADEMIC RECORDS (enrollment + grades)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.academic_records (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id  UUID NOT NULL REFERENCES public.profiles(id),
    section_id  UUID NOT NULL REFERENCES public.course_sections(id),
    grade       VARCHAR CHECK (grade IS NULL OR grade IN
                    ('A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F', 'IP', 'W')),
    is_current  BOOLEAN NOT NULL DEFAULT false,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ============================================================
-- SIS: STUDENT HOLDS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.student_holds (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id        UUID NOT NULL REFERENCES public.profiles(id),
    hold_type         public.hold_type NOT NULL,
    reason            TEXT NOT NULL,
    placed_by_system  VARCHAR NOT NULL DEFAULT 'Frighton SIS',
    placed_at         TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    resolved_at       TIMESTAMPTZ
);

-- ============================================================
-- SIS: STUDENT ACCOUNTS (per-term billing)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.student_accounts (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id     UUID NOT NULL REFERENCES public.profiles(id),
    term_id        UUID NOT NULL REFERENCES public.academic_terms(id),
    base_tuition   NUMERIC NOT NULL DEFAULT 0 CHECK (base_tuition >= 0),
    mandatory_fees NUMERIC NOT NULL DEFAULT 0 CHECK (mandatory_fees >= 0),
    scholarships   NUMERIC NOT NULL DEFAULT 0 CHECK (scholarships >= 0),
    status         public.account_status NOT NULL DEFAULT 'open',
    due_date       DATE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ============================================================
-- SIS: STUDENT PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.student_payments (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id       UUID NOT NULL REFERENCES public.student_accounts(id),
    amount           NUMERIC NOT NULL CHECK (amount > 0),
    reference_number VARCHAR NOT NULL UNIQUE,
    receipt_status   VARCHAR NOT NULL DEFAULT 'completed'
                     CHECK (receipt_status IN ('pending', 'completed', 'void')),
    paid_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
```

---

## 2. Indexing

Optimized indexes for fast lookups, joins, authentication, and circulation tracking:

```sql
-- 1. Users Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON public.users(is_active);

-- 2. Books Indexes
CREATE INDEX IF NOT EXISTS idx_books_title ON public.books(title);
CREATE INDEX IF NOT EXISTS idx_books_author ON public.books(author);
CREATE INDEX IF NOT EXISTS idx_books_category ON public.books(category);
CREATE INDEX IF NOT EXISTS idx_books_is_active ON public.books(is_active);

-- 3. Borrow Records Indexes
CREATE INDEX IF NOT EXISTS idx_borrow_student_id ON public.borrow_records(student_id);
CREATE INDEX IF NOT EXISTS idx_borrow_book_id ON public.borrow_records(book_id);
CREATE INDEX IF NOT EXISTS idx_borrow_due_date ON public.borrow_records(due_date);
CREATE INDEX IF NOT EXISTS idx_borrow_return_date ON public.borrow_records(return_date);
CREATE INDEX IF NOT EXISTS idx_borrow_receipt_number ON public.borrow_records(receipt_number);
-- Partial index to quickly query currently borrowed / unreturned loans:
CREATE INDEX IF NOT EXISTS idx_borrow_active_loans ON public.borrow_records(student_id) WHERE return_date IS NULL;

-- 4. Reservations Indexes
CREATE INDEX IF NOT EXISTS idx_reservations_student_id ON public.reservations(student_id);
CREATE INDEX IF NOT EXISTS idx_reservations_book_id ON public.reservations(book_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON public.reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_expires_at ON public.reservations(expires_at);
```

---

## 3. Return Book Procedure (Fine Paid During Return)

When an overdue book is returned, this function calculates the overdue days, computes the fine at **₱5.00/day**, records the payment (`fine_paid_at`), and issues the `receipt_number` in a single atomic transaction:

```sql
CREATE OR REPLACE FUNCTION public.return_book(
    p_borrow_id    UUID,
    p_returned_to  UUID,
    p_receipt_no   TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_loan         RECORD;
    v_now          TIMESTAMPTZ := now();
    v_today        DATE := (v_now AT TIME ZONE 'Asia/Manila')::date;
    v_overdue_days INT := 0;
    v_fine_amount  NUMERIC(10, 2) := 0.00;
    v_receipt      TEXT := NULL;
BEGIN
    -- 1. Fetch loan
    SELECT * INTO v_loan
    FROM public.borrow_records
    WHERE id = p_borrow_id AND return_date IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active loan % not found or already returned.', p_borrow_id;
    END IF;

    -- 2. Calculate overdue days in Manila timezone
    IF v_today > v_loan.due_date THEN
        v_overdue_days := (v_today - v_loan.due_date);
        v_fine_amount  := v_overdue_days * v_loan.daily_penalty_rate;
    END IF;

    -- 3. If overdue, receipt number is generated and fine is recorded as paid
    IF v_fine_amount > 0 THEN
        v_receipt := COALESCE(p_receipt_no, 'RCP-' || TO_CHAR(v_now, 'YYYYMMDD') || '-' || SUBSTRING(gen_random_uuid()::text, 1, 8));
    END IF;

    -- 4. Update the borrow record directly
    UPDATE public.borrow_records
    SET return_date    = v_now,
        returned_to    = p_returned_to,
        overdue_days   = v_overdue_days,
        fine_amount    = v_fine_amount,
        fine_paid_at   = CASE WHEN v_fine_amount > 0 THEN v_now ELSE NULL END,
        receipt_number = v_receipt
    WHERE id = v_loan.id;

    -- 5. Restore book copy stock
    IF v_loan.book_id IS NOT NULL THEN
        UPDATE public.books
        SET copies = copies + 1
        WHERE books_id = v_loan.book_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'borrow_id', v_loan.id,
        'overdue_days', v_overdue_days,
        'fine_amount', v_fine_amount,
        'fine_paid_at', CASE WHEN v_fine_amount > 0 THEN v_now ELSE NULL END,
        'receipt_number', v_receipt,
        'return_date', v_now
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 4. Row Level Security (RLS) & Policies

Simple, secure access policies based on the user's role:

```sql
-- 1. Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.borrow_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

-- Helper function: Get the current user's role from public.users
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
    SELECT role FROM public.users WHERE users_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- USERS POLICIES
-- ============================================================
-- Users can view their own profile
CREATE POLICY "Users can view own profile"
    ON public.users FOR SELECT
    USING (users_id = auth.uid() OR public.current_user_role() IN ('Librarian', 'Admin'));

-- Admins and Librarians can manage users
CREATE POLICY "Staff can manage users"
    ON public.users FOR ALL
    USING (public.current_user_role() IN ('Librarian', 'Admin'));

-- ============================================================
-- BOOKS POLICIES
-- ============================================================
-- Anyone can view active books
CREATE POLICY "Anyone can view active books"
    ON public.books FOR SELECT
    USING (is_active = true OR public.current_user_role() IN ('Librarian', 'Admin'));

-- Librarians and Admins can insert/update/delete books
CREATE POLICY "Staff can manage books"
    ON public.books FOR ALL
    USING (public.current_user_role() IN ('Librarian', 'Admin'));

-- ============================================================
-- BORROW_RECORDS POLICIES
-- ============================================================
-- Students can view their own borrow records
CREATE POLICY "Students can view own loans"
    ON public.borrow_records FOR SELECT
    USING (student_id = auth.uid() OR public.current_user_role() IN ('Librarian', 'Admin'));

-- Librarians and Admins can manage borrow records
CREATE POLICY "Staff can manage loans"
    ON public.borrow_records FOR ALL
    USING (public.current_user_role() IN ('Librarian', 'Admin'));

-- ============================================================
-- RESERVATIONS POLICIES
-- ============================================================
-- Students can view their own reservations
CREATE POLICY "Students can view own reservations"
    ON public.reservations FOR SELECT
    USING (student_id = auth.uid() OR public.current_user_role() IN ('Librarian', 'Admin'));

-- Librarians and Admins can manage reservations
CREATE POLICY "Staff can manage reservations"
    ON public.reservations FOR ALL
    USING (public.current_user_role() IN ('Librarian', 'Admin'));
```

---

## 5. Sample Seed Data

```sql
-- 1. Seed Staff & Student Users
INSERT INTO public.users (first_name, middle_name, last_name, email, password, role)
VALUES
    ('Eleanor', 'M.', 'Vance', 'admin@frighton.edu', 'hashed_admin_pass', 'Admin'),
    ('Arthur', 'P.', 'Pendelton', 'librarian@frighton.edu', 'hashed_lib_pass', 'Librarian'),
    ('Victor', 'F.', 'Frankenstein', 'student@frighton.edu', 'hashed_student_pass', 'Students')
ON CONFLICT (email) DO NOTHING;

-- 2. Seed Books
-- Upload the corresponding cover files to book-covers at these paths first.
INSERT INTO public.books (title, author, category, publisher, publication_year, copies, description, cover_image_path)
VALUES
    ('Frankenstein; or, The Modern Prometheus', 'Mary Shelley', 'Gothic Literature', 'Lackington, Hughes, Harding, Mavor, & Jones', 1818, 5, 'Classic tale of scientific creation and consequence.', 'seed/frankenstein.jpg'),
    ('Dracula', 'Bram Stoker', 'Classic Horror', 'Archibald Constable and Company', 1897, 4, 'Epistolary Gothic horror novel.', 'seed/dracula.jpg'),
    ('Introduction to Algorithms', 'Thomas H. Cormen et al.', 'Computer Science', 'MIT Press', 2022, 8, 'Comprehensive algorithms textbook.', 'seed/introduction-to-algorithms.jpg'),
    ('Clean Code', 'Robert C. Martin', 'Software Engineering', 'Prentice Hall', 2008, 6, 'A handbook of agile software craftsmanship.', 'seed/clean-code.jpg')
ON CONFLICT DO NOTHING;
```

## 6. Book Pictures with Supabase Storage

Every book requires an uploaded picture. The `book-covers` bucket stores the image file; `books.cover_image_path` stores only its object path, such as `<book-id>/<image-id>.jpg`. File contents and MIME types are managed by Storage rather than columns on the book record. Required-picture, JPEG/PNG/WebP format, file-signature, and 10 MB size validation belong to Express and the frontend. Publication year (a whole number from 1 to 9999), category, and shelf location are also required on every save. Category uses a dropdown of common library subjects; existing category labels are preserved when editing older records. These are application validations; no new SQL checks or category tables are needed.

### Bucket setup

Create a private bucket named `book-covers` in Supabase Storage, or run this once:

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('book-covers', 'book-covers', false, 10485760);
```

Express authenticates library staff and uses its server-only Supabase service-role client for uploads and downloads. The frontend receives the image through an authenticated Express endpoint or a temporary signed URL. Store the object path in the books table; signed URLs expire and should not be stored there. No browser write policies or additional image SQL functions are needed for this server-mediated flow.

See the official [bucket creation guide](https://supabase.com/docs/guides/storage/buckets/creating-buckets) and [private bucket access documentation](https://supabase.com/docs/guides/storage/buckets/fundamentals).

If the bucket already exists, set its image limit to 10 MB (10,485,760 bytes):

```sql
UPDATE storage.buckets
SET file_size_limit = 10485760
WHERE id = 'book-covers';
```

### Existing books table

Add just the image-path column, once:

```sql
ALTER TABLE public.books
    ADD COLUMN cover_image_path TEXT;
```

Skip either setup statement if its bucket or column already exists. Use the book CREATE TABLE definition only when creating a new books table. Existing book records can receive pictures through the edit form. The column allows NULL for older records; Express requires an uploaded picture before creating a book or saving a book that does not have one.

### Express save flow

1. Validate the staff account, book fields, and required picture.
2. Upload the picture to `book-covers` with a unique object path.
3. Save that path together with the book fields. If saving fails, remove the newly uploaded file.
4. On edit, preserve the current path unless a replacement is uploaded. Save the replacement path successfully before removing the previous file. Reject standalone picture removal.
5. Keep the cover file when archiving a book.

**Implementation status:** Express uploads pictures to the private `book-covers` bucket and saves only `cover_image_path` on the book record. It downloads covers through the existing authenticated image endpoint. The bucket and column must exist in your Supabase project; this code change does not create them remotely. Earlier `cover_image` and `cover_image_type` columns are no longer read or written. Existing binary pictures must be re-uploaded through the edit form (or migrated into Storage) before retiring those old columns; existing data is not deleted.
