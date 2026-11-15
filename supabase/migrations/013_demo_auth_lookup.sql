-- Run after 012_demo_seed.sql.
-- Read only the Auth identities relevant to this seed. A project-wide Admin
-- list may fail to deserialize a malformed, unrelated legacy Auth row.
BEGIN;

CREATE FUNCTION public.lms_demo_auth_users()
RETURNS TABLE (id uuid, email text, app_metadata jsonb, email_confirmed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT u.id, u.email::text,
    jsonb_build_object(
      'lms_seed', u.raw_app_meta_data->'lms_seed',
      'lms_seed_key', u.raw_app_meta_data->'lms_seed_key'
    ),
    u.email_confirmed_at
  FROM auth.users u
  WHERE u.raw_app_meta_data->>'lms_seed' = 'frighton-demo-v1'
     OR u.id IN (SELECT r.record_id FROM public.lms_demo_seed_records r WHERE r.kind = 'staff')
     OR lower(u.email) IN ('admin@frighton.com', 'librarian1@frighton.com', 'librarian2@frighton.com');
$$;

REVOKE ALL ON FUNCTION public.lms_demo_auth_users() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lms_demo_auth_users() TO service_role;
COMMIT;
