-- ============================================================
-- Frighton University LMS: 001_initial_schema.sql
-- Library catalog, checkout loans, and fine tracking
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Books Catalog
CREATE TABLE IF NOT EXISTS public.books (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    isbn VARCHAR(20) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    author VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    description TEXT,
    total_copies INT NOT NULL DEFAULT 1,
    available_copies INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_books_isbn ON public.books(isbn);
CREATE INDEX IF NOT EXISTS idx_books_category ON public.books(category);

-- Borrow Records (linked by student frighton_id)
CREATE TABLE IF NOT EXISTS public.borrow_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
    frighton_id VARCHAR(50) NOT NULL,
    borrow_date TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    due_date TIMESTAMPTZ NOT NULL,
    return_date TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'returned', 'overdue'
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_borrow_frighton_id ON public.borrow_records(frighton_id);
CREATE INDEX IF NOT EXISTS idx_borrow_status ON public.borrow_records(status);

-- Library Fines
CREATE TABLE IF NOT EXISTS public.library_fines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    borrow_id UUID NOT NULL REFERENCES public.borrow_records(id) ON DELETE CASCADE,
    frighton_id VARCHAR(50) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    reason TEXT NOT NULL,
    sis_hold_id UUID,
    is_paid BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
