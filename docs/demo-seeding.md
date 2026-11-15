# Demo seeding and cleanup

"Unseeding" (or seed rollback) means removing the data created by a seeder.

Apply [012_demo_seed.sql](../supabase/migrations/012_demo_seed.sql) in the Supabase SQL Editor after the existing production schema and migrations through 011. This migration adds an ownership registry and two service-role-only functions; it does not populate or erase existing data. Migrations 001/002 describe an older schema; use the production schema in schema.md as directed by the later migrations.

Then apply [013_demo_auth_lookup.sql](../supabase/migrations/013_demo_auth_lookup.sql). This adds a read-only, service-role-only lookup for the three demo emails and identities tracked by this seed. It reads only identity IDs, emails, confirmation timestamps, and seed ownership markers; it does not expose passwords or change Auth records.

Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env to the intended project. Keep the service key on the server. From the repository root:

```sh
npm run db:seed
```

This creates one active Admin and two active Librarians:

| Role | Email | Initial password |
| --- | --- | --- |
| Admin | admin@frighton.com | Password123! |
| Librarian | librarian1@frighton.com | Password123! |
| Librarian | librarian2@frighton.com | Password123! |

The Auth Admin API creates these accounts with email_confirm: true. They can sign in immediately without an email confirmation link. The corresponding public.users rows use the same IDs, the correct roles, and the legacy password placeholder managed-by-supabase-auth. The actual passwords are managed by Supabase Auth. Existing seeded accounts retain their current passwords and profile edits on reruns.

The catalog receives 10 books spanning fiction, literature, computer science, mathematics, science, history, business, arts, philosophy, and engineering. Each has copies, a shelf location, a description, and a distinct bundled PNG cover in server/seed-assets. Sample textbooks are fictional demo titles. Covers are original generated designs; seeding requires no external image host. They upload to the private book-covers bucket and display through the normal authenticated image endpoint. The command creates that bucket if missing and leaves an existing private bucket's settings alone.

To remove only this seeder's data:

```sh
npm run db:unseed
```

Cleanup removes tracked catalog rows, staff profiles, their Supabase Auth accounts, and their original cover files. Other books, accounts, students, and bucket contents are untouched. The bucket itself and audit history remain. Records edited after seeding are still owned seed records and will be removed.

Cleanup refuses to delete records referenced by public database foreign keys, including reservations, loans, staff invitations, charges, SIS records, and references to Auth identities. This protects real circulation history from cascading deletion or nulling. It also refuses to delete an original cover used by another book. Keep used demo records when you need to preserve their history.

Both commands can be repeated. Seeding never adopts an existing account by email or overwrites an existing book ID. An existing non-seeded demo email causes an error so it cannot accidentally become a cleanup target. Ownership is recorded in the database and trusted Auth app_metadata, rather than a local file. If a network request fails, fix the issue and rerun the command; incomplete Auth/Storage cleanup keeps ownership for retry. Run one seed or cleanup process at a time, with normal application writes paused during cleanup.

These are demo credentials. Use separate credentials for real staff.

## Auth user-list database errors

If an older checkout stops with "Read Auth users: Database error finding users", update the code and apply migration 013, then retry the same command. The previous implementation called auth.admin.listUsers for every account. Supabase can return a database error while loading an unrelated legacy Auth row. The current commands use a scoped SQL lookup and continue to create and delete accounts through the supported Auth Admin API. They never treat a failed lookup as an empty user list.

The registry may be empty when lookup fails before the first write; running cleanup cannot repair this Auth error. No global Auth repair or account deletion is part of either seed command.

Malformed existing Auth rows remain a separate project issue. Check Supabase Dashboard > Logs > Auth and Postgres for the underlying failure. If logs report a NULL-to-string conversion, follow [Supabase's Auth troubleshooting guide](https://supabase.com/kb/troubleshooting/auth-error-500-database-error-querying-schema-eb6b44) for the specific affected column. Do not bulk-delete users or reset their passwords to make listing succeed. Existing non-seeded accounts with a demo email are still rejected, so they cannot become cleanup targets.
