-- ============================================================
-- Frighton University LMS: 002_rls_policies.sql
-- ============================================================

ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.borrow_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_fines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view book catalog"
    ON public.books FOR SELECT
    USING (true);

CREATE POLICY "Authenticated users can view own loans"
    ON public.borrow_records FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can view own fines"
    ON public.library_fines FOR SELECT
    TO authenticated
    USING (true);
