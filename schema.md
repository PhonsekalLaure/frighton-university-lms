# Frighton University LMS - Database Schema

> **File Location:** Mirrored at [`supabase/schema.md`](file:///c:/Users/Veluz/Documents/LMS/frighton-university-lms/supabase/schema.md).

A clean, direct, and production-ready Supabase PostgreSQL schema with **Indexing** and **Row Level Security (RLS)**.

---

## 1. Table Definitions

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. USERS TABLE
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
-- 2. BOOKS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.books (
    books_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title            TEXT NOT NULL,
    author           TEXT NOT NULL,
    category         TEXT,
    publisher        TEXT,
    publication_year INT,
    copies           INT NOT NULL DEFAULT 1 CHECK (copies >= 0),
    description      TEXT,
    is_active        BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. BORROW_RECORDS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.borrow_records (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id         UUID NOT NULL REFERENCES public.users(users_id) ON DELETE CASCADE,
    book_copy_id       UUID, -- optional copy identifier or references books(books_id)
    book_id            UUID REFERENCES public.books(books_id) ON DELETE CASCADE,
    issued_by          UUID REFERENCES public.users(users_id),
    borrow_date        TIMESTAMPTZ NOT NULL DEFAULT now(),
    due_date           DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Manila')::date + 14),
    daily_penalty_rate NUMERIC(10, 2) NOT NULL DEFAULT 5.00,

    -- Filled in during book return:
    return_date        TIMESTAMPTZ,
    returned_to        UUID REFERENCES public.users(users_id),
    overdue_days       INT NOT NULL DEFAULT 0,
    fine_amount        NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    fine_paid_at       TIMESTAMPTZ,
    receipt_number     TEXT UNIQUE,

    idempotency_key    UUID UNIQUE DEFAULT gen_random_uuid()
);

-- ============================================================
-- 4. RESERVATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reservations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id  UUID NOT NULL REFERENCES public.users(users_id) ON DELETE CASCADE,
    book_id     UUID NOT NULL REFERENCES public.books(books_id) ON DELETE CASCADE,
    status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'fulfilled', 'cancelled', 'expired')),
    reserved_by UUID NOT NULL REFERENCES public.users(users_id), -- librarian who took it
    reserved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '3 days')
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
INSERT INTO public.books (title, author, category, publisher, publication_year, copies, description)
VALUES
    ('Frankenstein; or, The Modern Prometheus', 'Mary Shelley', 'Gothic Literature', 'Lackington, Hughes, Harding, Mavor, & Jones', 1818, 5, 'Classic tale of scientific creation and consequence.'),
    ('Dracula', 'Bram Stoker', 'Classic Horror', 'Archibald Constable and Company', 1897, 4, 'Epistolary Gothic horror novel.'),
    ('Introduction to Algorithms', 'Thomas H. Cormen et al.', 'Computer Science', 'MIT Press', 2022, 8, 'Comprehensive algorithms textbook.'),
    ('Clean Code', 'Robert C. Martin', 'Software Engineering', 'Prentice Hall', 2008, 6, 'A handbook of agile software craftsmanship.')
ON CONFLICT DO NOTHING;
```
