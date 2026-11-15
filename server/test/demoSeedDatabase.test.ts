import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { demoBooks, demoStaff } from '../src/seeds/demoData.js';

let db: PGlite;
const staff = demoStaff.map((person, i) => ({
  ...person, users_id: 'a1170000-0000-4000-8000-' + String(i + 1).padStart(12, '0'),
}));
const other = 'b1170000-0000-4000-8000-000000000001';
before(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users (
      id uuid PRIMARY KEY, email text, raw_app_meta_data jsonb, email_confirmed_at timestamptz, confirmation_token text
    );
    CREATE TABLE public.users (
      users_id uuid PRIMARY KEY, first_name text, last_name text, email text UNIQUE,
      password text, role text, is_active boolean
    );
    CREATE TABLE public.books (
      books_id uuid PRIMARY KEY, title text, author text, category text, publisher text,
      publication_year int, copies int, shelf_location text, description text, cover_image_path text, is_active boolean
    );
    CREATE TABLE public.borrow_records (
      id uuid PRIMARY KEY, book_id uuid REFERENCES public.books(books_id) ON DELETE CASCADE,
      issued_by uuid REFERENCES public.users(users_id)
    );
    CREATE TABLE public.staff_invitations (
      id uuid PRIMARY KEY, invited_by uuid REFERENCES public.users(users_id) ON DELETE SET NULL
    );
    CREATE TABLE public.connected_profiles (
      id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
    );
    INSERT INTO public.users (users_id,email,role) VALUES ('${other}', 'existing@frighton.com', 'Admin');
    INSERT INTO public.books (books_id,title,copies) VALUES ('${other}', 'Existing book', 8);
  `);
  await db.exec(await readFile(new URL('../../supabase/migrations/012_demo_seed.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../../supabase/migrations/013_demo_auth_lookup.sql', import.meta.url), 'utf8'));
});
after(async () => { await db.close(); });
async function transaction(run: () => Promise<void>) {
  await db.exec('BEGIN');
  try { await run(); } finally { await db.exec('ROLLBACK'); }
}
async function seed() {
  await db.query('SELECT public.seed_lms_demo($1::jsonb, $2::jsonb)', [JSON.stringify(staff), JSON.stringify(demoBooks)]);
}
async function count(table: string) {
  return (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM ' + table)).rows[0].count;
}

test('seed creates 1 admin, 2 librarians and 10 diverse books; reruns preserve edits and stock', () => transaction(async () => {
  await seed();
  assert.equal(await count('public.lms_demo_seed_records'), 13);
  assert.equal(await count('public.users'), 4);
  assert.equal(await count('public.books'), 11);
  const people = (await db.query<any>('SELECT * FROM public.users WHERE users_id <> $1', [other])).rows;
  assert.equal(people.filter(row => row.role === 'Admin').length, 1);
  assert.equal(people.filter(row => row.role === 'Librarian').length, 2);
  assert.ok(people.every(row => row.is_active && row.password === 'managed-by-supabase-auth'));
  assert.equal(new Set(demoBooks.map(book => book.category)).size, 10);
  await db.query('UPDATE public.books SET title = $1, copies = 2 WHERE books_id = $2', ['Edited', demoBooks[0].books_id]);
  await seed();
  const edited = (await db.query<any>('SELECT title,copies FROM public.books WHERE books_id = $1', [demoBooks[0].books_id])).rows[0];
  assert.deepEqual(edited, { title: 'Edited', copies: 2 });
}));

test('cleanup removes only owned rows and retains retryable ownership', () => transaction(async () => {
  await seed();
  assert.equal((await db.query('SELECT * FROM public.unseed_lms_demo()')).rows.length, 13);
  assert.equal(await count('public.users'), 1);
  assert.equal(await count('public.books'), 1);
  assert.equal(await count('public.lms_demo_seed_records'), 13);
  await db.query('SELECT * FROM public.unseed_lms_demo()');
  assert.equal(await count('public.books'), 1);
}));

test('seed does not claim a preexisting staff email or book ID; failed seed rolls back', () => transaction(async () => {
  await db.query('UPDATE public.users SET email = $1 WHERE users_id = $2', [staff[0].email, other]);
  await db.exec('SAVEPOINT collision');
  await assert.rejects(seed, /non-seeded staff/);
  await db.exec('ROLLBACK TO collision');
  assert.equal(await count('public.lms_demo_seed_records'), 0);
  await db.query('UPDATE public.users SET email = $1 WHERE users_id = $2', ['existing@frighton.com', other]);
  await db.query('UPDATE public.books SET books_id = $1 WHERE books_id = $2', [demoBooks[0].books_id, other]);
  await db.exec('SAVEPOINT book_collision');
  await assert.rejects(seed, /non-seeded book/);
  await db.exec('ROLLBACK TO book_collision');
  assert.equal(await count('public.lms_demo_seed_records'), 0);
  assert.equal(await count('public.users'), 1);
}));

test('cleanup refuses cascaded book history and preserves every seeded row', () => transaction(async () => {
  await seed();
  await db.query('INSERT INTO public.borrow_records VALUES ($1,$2,$3)', [other, demoBooks[0].books_id, other]);
  await db.exec('SAVEPOINT history');
  await assert.rejects(() => db.query('SELECT * FROM public.unseed_lms_demo()'), /Cleanup refused/);
  await db.exec('ROLLBACK TO history');
  assert.equal(await count('public.books'), 11);
  assert.equal(await count('public.users'), 4);
  assert.equal(await count('public.borrow_records'), 1);
}));

test('cleanup refuses ON DELETE SET NULL staff references', () => transaction(async () => {
  await seed();
  await db.query('INSERT INTO public.staff_invitations VALUES ($1,$2)', [other, staff[0].users_id]);
  await db.exec('SAVEPOINT invitation');
  await assert.rejects(() => db.query('SELECT * FROM public.unseed_lms_demo()'), /Cleanup refused/);
  await db.exec('ROLLBACK TO invitation');
  assert.equal((await db.query<any>('SELECT invited_by FROM public.staff_invitations')).rows[0].invited_by, staff[0].users_id);
}));

test('cleanup protects public references to Auth identities, including interrupted accounts', () => transaction(async () => {
  await db.query('INSERT INTO auth.users (id) VALUES ($1)', [staff[0].users_id]);
  await db.query('INSERT INTO public.connected_profiles VALUES ($1)', [staff[0].users_id]);
  await db.exec('SAVEPOINT auth_reference');
  await assert.rejects(() => db.query('SELECT * FROM public.unseed_lms_demo($1::uuid[])', [[staff[0].users_id]]), /Cleanup refused/);
  await db.exec('ROLLBACK TO auth_reference');
  assert.equal(await count('public.connected_profiles'), 1);
}));

test('cleanup preserves seeded covers shared with unseeded books', () => transaction(async () => {
  await seed();
  await db.query('UPDATE public.books SET cover_image_path = $1 WHERE books_id = $2', [demoBooks[0].cover_image_path, other]);
  await db.exec('SAVEPOINT shared_cover');
  await assert.rejects(() => db.query('SELECT * FROM public.unseed_lms_demo()'), /cover is used by another book/);
  await db.exec('ROLLBACK TO shared_cover');
  assert.equal(await count('public.books'), 11);
}));

test('only service_role can call seed helpers or read ownership', async () => {
  for (const role of ['anon', 'authenticated']) {
    const result = await db.query<any>(`SELECT
      has_function_privilege($1, 'public.seed_lms_demo(jsonb,jsonb)', 'EXECUTE') AS seed,
      has_function_privilege($1, 'public.unseed_lms_demo(uuid[])', 'EXECUTE') AS unseed,
      has_table_privilege($1, 'public.lms_demo_seed_records', 'SELECT') AS records,
      has_function_privilege($1, 'public.lms_demo_auth_users()', 'EXECUTE') AS auth_lookup`, [role]);
    assert.deepEqual(result.rows[0], { seed: false, unseed: false, records: false, auth_lookup: false });
  }
});

test('Auth lookup scopes by demo email, tracked ID, or trusted seed marker and omits sensitive Auth fields', () => transaction(async () => {
  await seed();
  const orphan = 'c1170000-0000-4000-8000-000000000001';
  await db.query(`INSERT INTO auth.users (id,email,raw_app_meta_data,email_confirmed_at,confirmation_token) VALUES
    ($1,'admin@frighton.com','{"lms_seed":"frighton-demo-v1","lms_seed_key":"admin","private_setting":"hidden"}',now(),''),
    ($2,'renamed@example.com','{}',now(),''),
    ($3,'librarian2@frighton.com','{}',now(),NULL),
    ($4,'interrupted@example.com','{"lms_seed":"frighton-demo-v1","lms_seed_key":"admin"}',now(),''),
    ($5,'unrelated@example.com','{}',NULL,NULL)`,
    [staff[0].users_id,staff[1].users_id,staff[2].users_id,orphan,other]);
  const rows = (await db.query<any>('SELECT * FROM public.lms_demo_auth_users()')).rows;
  assert.deepEqual(new Set(rows.map(row => row.id)), new Set([...staff.map(row => row.users_id), orphan]));
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), ['app_metadata', 'email', 'email_confirmed_at', 'id']);
    assert.deepEqual(Object.keys(row.app_metadata).sort(), ['lms_seed', 'lms_seed_key']);
  }
}));
