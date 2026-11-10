-- ============================================================
-- Frighton University LMS: 011_staff_invitations.sql
-- Librarian invitation tokens with standard 48-hour expiration
-- ============================================================

CREATE TABLE IF NOT EXISTS public.staff_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    first_name TEXT,
    middle_name TEXT,
    last_name TEXT,
    role TEXT NOT NULL DEFAULT 'Librarian' CHECK (role IN ('Librarian', 'Admin')),
    token TEXT NOT NULL UNIQUE,
    invited_by UUID REFERENCES public.users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '48 hours'),
    accepted_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_staff_invitations_token ON public.staff_invitations(token);
CREATE INDEX IF NOT EXISTS idx_staff_invitations_email ON public.staff_invitations(email);
CREATE INDEX IF NOT EXISTS idx_staff_invitations_status ON public.staff_invitations(status);

-- Enable RLS
ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access on staff_invitations"
    ON public.staff_invitations
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

