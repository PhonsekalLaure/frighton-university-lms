-- Apply after 011_staff_invitations.sql against the production schema in schema.md.
-- Ownership survives local checkout changes and partial Auth/Storage failures.
BEGIN;

CREATE TABLE public.lms_demo_seed_records (
  kind text NOT NULL CHECK (kind IN ('book', 'staff')),
  seed_key text NOT NULL,
  record_id uuid NOT NULL,
  cover_path text,
  PRIMARY KEY (kind, seed_key),
  UNIQUE (kind, record_id)
);
ALTER TABLE public.lms_demo_seed_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lms_demo_seed_records FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.lms_demo_seed_records TO service_role;

CREATE FUNCTION public.seed_lms_demo(p_staff jsonb, p_books jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE item jsonb; tracked public.lms_demo_seed_records; v_id uuid;
BEGIN
  -- Serializes database seeding and cleanup. Run one CLI command at a time:
  -- the surrounding Auth and Storage requests cannot share this transaction.
  PERFORM pg_advisory_xact_lock(1172026);
  FOR item IN SELECT value FROM jsonb_array_elements(p_staff) LOOP
    v_id := (item->>'users_id')::uuid;
    SELECT * INTO tracked FROM public.lms_demo_seed_records
      WHERE kind = 'staff' AND seed_key = item->>'key';
    IF FOUND THEN
      IF tracked.record_id <> v_id THEN
        RAISE EXCEPTION 'Seed staff identity changed; run cleanup before reseeding.';
      END IF;
    ELSE
      IF EXISTS (SELECT 1 FROM public.users WHERE users_id = v_id OR lower(email) = lower(item->>'email')) THEN
        RAISE EXCEPTION 'A non-seeded staff profile already uses this identity or email.';
      END IF;
      INSERT INTO public.lms_demo_seed_records VALUES ('staff', item->>'key', v_id, NULL);
    END IF;
    INSERT INTO public.users (users_id, first_name, last_name, email, password, role, is_active)
    VALUES (v_id, item->>'first_name', item->>'last_name', item->>'email',
      'managed-by-supabase-auth', item->>'role', true)
    ON CONFLICT (users_id) DO NOTHING;
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(p_books) LOOP
    v_id := (item->>'books_id')::uuid;
    SELECT * INTO tracked FROM public.lms_demo_seed_records
      WHERE kind = 'book' AND seed_key = item->>'key';
    IF FOUND THEN
      IF tracked.record_id <> v_id OR tracked.cover_path IS DISTINCT FROM item->>'cover_image_path' THEN
        RAISE EXCEPTION 'Seed book identity changed; run cleanup before reseeding.';
      END IF;
    ELSE
      IF EXISTS (SELECT 1 FROM public.books WHERE books_id = v_id) THEN
        RAISE EXCEPTION 'A non-seeded book already uses this ID.';
      END IF;
      -- Reserve the path before uploading so even interrupted uploads are tracked.
      IF EXISTS (SELECT 1 FROM public.books WHERE cover_image_path = item->>'cover_image_path') THEN
        RAISE EXCEPTION 'A non-seeded book already uses this cover path.';
      END IF;
      INSERT INTO public.lms_demo_seed_records VALUES ('book', item->>'key', v_id, item->>'cover_image_path');
    END IF;
    INSERT INTO public.books (books_id, title, author, category, publisher, publication_year,
      copies, shelf_location, description, cover_image_path, is_active)
    VALUES (v_id, item->>'title', item->>'author', item->>'category', item->>'publisher',
      (item->>'publication_year')::int, (item->>'copies')::int, item->>'shelf_location',
      item->>'description', item->>'cover_image_path', true)
    ON CONFLICT (books_id) DO NOTHING;
  END LOOP;
END $$;

CREATE FUNCTION public.unseed_lms_demo(p_auth_ids uuid[] DEFAULT '{}')
RETURNS SETOF public.lms_demo_seed_records
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE ref record; used boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(1172026);
  LOCK TABLE public.books, public.users IN SHARE ROW EXCLUSIVE MODE;

  -- Guard every public FK to books, staff profiles, and Auth identities.
  -- This also catches future tables and ON DELETE CASCADE / SET NULL references.
  FOR ref IN
    SELECT c.conrelid::regclass AS relation, a.attname AS column_name,
      CASE WHEN c.confrelid = 'public.books'::regclass THEN 'book' ELSE 'staff' END AS kind
    FROM pg_constraint c
    JOIN LATERAL unnest(c.conkey) WITH ORDINALITY fk(attnum, pos) ON true
    JOIN LATERAL unnest(c.confkey) WITH ORDINALITY pk(attnum, pos) ON pk.pos = fk.pos
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = fk.attnum
    JOIN pg_attribute target ON target.attrelid = c.confrelid AND target.attnum = pk.attnum
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace ns ON ns.oid = t.relnamespace
    WHERE c.contype = 'f' AND ns.nspname = 'public'
      AND c.confrelid IN ('public.books'::regclass, 'public.users'::regclass, to_regclass('auth.users'))
      AND target.attname IN ('books_id', 'users_id', 'id')
  LOOP
    EXECUTE format('LOCK TABLE %s IN SHARE ROW EXCLUSIVE MODE', ref.relation);
    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM %s child WHERE child.%I IN
       (SELECT record_id FROM public.lms_demo_seed_records WHERE kind = $1)
       OR ($1 = ''staff'' AND child.%I = ANY($2)))',
      ref.relation, ref.column_name, ref.column_name)
      INTO used USING ref.kind, p_auth_ids;
    IF used THEN
      RAISE EXCEPTION 'Cleanup refused: seeded data is referenced by %. Keep the related library history.', ref.relation;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.books b JOIN public.lms_demo_seed_records r
      ON r.kind = 'book' AND b.cover_image_path = r.cover_path
    WHERE b.books_id <> r.record_id
  ) THEN
    RAISE EXCEPTION 'Cleanup refused: a seeded cover is used by another book.';
  END IF;

  DELETE FROM public.books WHERE books_id IN
    (SELECT record_id FROM public.lms_demo_seed_records WHERE kind = 'book');
  DELETE FROM public.users WHERE users_id IN
    (SELECT record_id FROM public.lms_demo_seed_records WHERE kind = 'staff');
  -- Keep ownership until the CLI confirms each Storage/Auth deletion.
  RETURN QUERY SELECT * FROM public.lms_demo_seed_records ORDER BY kind, seed_key;
END $$;

REVOKE ALL ON FUNCTION public.seed_lms_demo(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unseed_lms_demo(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_lms_demo(jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.unseed_lms_demo(uuid[]) TO service_role;
COMMIT;
