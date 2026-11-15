import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient, type User } from '@supabase/supabase-js';
import { DEMO_SEED, demoBooks } from '../src/seeds/demoData.js';
import { seedDemo, unseedDemo } from '../src/seeds/demoSeeder.js';

function setup() {
  const state = {
    users: [] as User[], records: [] as any[], profiles: [] as any[],
    books: [] as any[], files: new Map<string, Buffer>(),
    creates: [] as any[], deletedUsers: [] as string[], deletedFiles: [] as string[],
    refuseCleanup: false, failUpload: false, failAuthDelete: false,
    authListRequests: 0, authLookupRequests: 0, failAuthLookup: false,
  };
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  });
  const client = createClient('https://seed-test.invalid', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, options) => {
      const url = new URL(String(input));
      const path = url.pathname;
      const method = options?.method ?? 'GET';
      const body = typeof options?.body === 'string' ? JSON.parse(options.body) : {};
      if (path === '/auth/v1/admin/users' && method === 'GET') {
        state.authListRequests++;
        return json({ message: 'Database error finding users' }, 500);
      }
      if (path === '/rest/v1/rpc/lms_demo_auth_users') {
        state.authLookupRequests++;
        if (state.failAuthLookup) return json({ code: 'PGRST202', message: 'Function not found' }, 404);
        const emails = ['admin@frighton.com', 'librarian1@frighton.com', 'librarian2@frighton.com'];
        return json(state.users.filter(user => user.app_metadata?.lms_seed === DEMO_SEED
          || emails.includes(user.email?.toLowerCase() ?? '')
          || state.records.some(row => row.kind === 'staff' && row.record_id === user.id)));
      }
      if (path === '/auth/v1/admin/users' && method === 'POST') {
        state.creates.push(body);
        const user = { id: 'a1170000-0000-4000-8000-' + String(state.users.length + 1).padStart(12, '0'),
          email: body.email, app_metadata: body.app_metadata, user_metadata: body.user_metadata,
          email_confirmed_at: body.email_confirm ? new Date().toISOString() : undefined } as User;
        state.users.push(user);
        return json(user);
      }
      if (path.startsWith('/auth/v1/admin/users/') && method === 'DELETE') {
        if (state.failAuthDelete) return json({ message: 'Auth delete unavailable' }, 500);
        const id = path.split('/').at(-1)!;
        state.deletedUsers.push(id);
        state.users = state.users.filter(user => user.id !== id);
        return json({});
      }
      if (path === '/rest/v1/lms_demo_seed_records') {
        if (method === 'DELETE') {
          state.records = state.records.filter(row => 'eq.' + row.kind !== url.searchParams.get('kind')
            || 'eq.' + row.seed_key !== url.searchParams.get('seed_key'));
          return new Response(null, { status: 204 });
        }
        return json(state.records);
      }
      if (path === '/rest/v1/users') {
        const email = url.searchParams.get('email');
        return json(state.profiles.filter(profile => !email || 'ilike.' + profile.email === email));
      }
      if (path === '/rest/v1/rpc/seed_lms_demo') {
        for (const profile of body.p_staff) {
          if (!state.profiles.some(row => row.users_id === profile.users_id)) state.profiles.push(profile);
          if (!state.records.some(row => row.kind === 'staff' && row.seed_key === profile.key))
            state.records.push({ kind: 'staff', seed_key: profile.key, record_id: profile.users_id, cover_path: null });
        }
        for (const book of body.p_books) {
          if (!state.books.some(row => row.books_id === book.books_id)) state.books.push(book);
          if (!state.records.some(row => row.kind === 'book' && row.seed_key === book.key))
            state.records.push({ kind: 'book', seed_key: book.key, record_id: book.books_id, cover_path: book.cover_image_path });
        }
        return json(null);
      }
      if (path === '/rest/v1/rpc/unseed_lms_demo') {
        if (state.refuseCleanup) return json({ message: 'Cleanup refused: library history exists' }, 400);
        state.books = []; state.profiles = [];
        return json([...state.records]);
      }
      if (path === '/storage/v1/bucket/book-covers') return json({ id: 'book-covers', public: false });
      const prefix = '/storage/v1/object/book-covers/';
      if (path.startsWith(prefix)) {
        const key = path.slice(prefix.length);
        if (method === 'POST') {
          if (state.failUpload) return json({ message: 'Upload unavailable' }, 503);
          state.files.set(key, Buffer.from(options?.body as Uint8Array));
          return json({ Key: key });
        }
        const bytes = state.files.get(key);
        return bytes ? new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'image/png' } })
          : json({ message: 'Object not found' }, 404);
      }
      if (path === '/storage/v1/object/book-covers' && method === 'DELETE') {
        for (const key of body.prefixes) { state.deletedFiles.push(key); state.files.delete(key); }
        return json([]);
      }
      throw new Error('Unexpected request: ' + method + ' ' + path);
    } },
  });
  return { state, client };
}

test('Auth accounts are confirmed with requested passwords; PNG covers upload; seed and cleanup repeat safely', async () => {
  const { state, client } = setup();
  await seedDemo(client);
  assert.equal(state.creates.length, 3);
  assert.equal(state.creates.filter(row => row.user_metadata.role === 'Admin').length, 1);
  assert.ok(state.creates.every(row => row.email_confirm === true && row.password === 'Password123!'
    && row.app_metadata.lms_seed === DEMO_SEED));
  assert.deepEqual(state.creates.map(row => row.email), ['admin@frighton.com', 'librarian1@frighton.com', 'librarian2@frighton.com']);
  assert.equal(state.files.size, 10);
  for (const bytes of state.files.values()) assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  await seedDemo(client);
  assert.equal(state.creates.length, 3);
  assert.equal(state.records.length, 13);
  state.files.set('unrelated.png', Buffer.from('keep'));
  await unseedDemo(client);
  assert.equal(state.records.length, 0);
  assert.equal(state.users.length, 0);
  assert.deepEqual([...state.files.keys()], ['unrelated.png']);
  await unseedDemo(client);
  assert.equal(state.deletedUsers.length, 3);
});

test('a preexisting unowned email is never adopted or reset', async () => {
  const { state, client } = setup();
  state.users.push({ id: 'existing', email: 'admin@frighton.com', app_metadata: {} } as User);
  await assert.rejects(() => seedDemo(client), /non-seeded Auth account/);
  assert.equal(state.creates.length, 0);
  assert.equal(state.records.length, 0);
});

test('scoped lookup finds a conflicting demo email among unrelated accounts without listing all users', async () => {
  const { state, client } = setup();
  state.users = Array.from({ length: 100 }, (_, i) => ({ id: 'existing-' + i, email: 'user' + i + '@example.com', app_metadata: {} } as User));
  state.users.push({ id: 'collision', email: 'librarian2@frighton.com', app_metadata: {} } as User);
  await assert.rejects(() => seedDemo(client), /non-seeded Auth account/);
  assert.equal(state.creates.length, 0);
});

test('a refused database cleanup never deletes Auth accounts or Storage files', async () => {
  const { state, client } = setup();
  await seedDemo(client);
  state.refuseCleanup = true;
  await assert.rejects(() => unseedDemo(client), /Cleanup refused/);
  assert.equal(state.deletedUsers.length, 0);
  assert.equal(state.deletedFiles.length, 0);
  assert.equal(state.records.length, 13);
});

test('failed uploads retain ownership and rerunning restores covers without duplicate users', async () => {
  const { state, client } = setup();
  state.failUpload = true;
  await assert.rejects(() => seedDemo(client), /Upload unavailable/);
  assert.equal(state.records.length, 13);
  state.failUpload = false;
  await seedDemo(client);
  assert.equal(state.creates.length, 3);
  assert.equal(state.files.size, demoBooks.length);
});

test('failed Auth deletion retains ownership so cleanup can resume', async () => {
  const { state, client } = setup();
  await seedDemo(client);
  state.failAuthDelete = true;
  await assert.rejects(() => unseedDemo(client), /Auth delete unavailable/);
  assert.equal(state.records.filter(row => row.kind === 'staff').length, 3);
  state.failAuthDelete = false;
  await unseedDemo(client);
  assert.equal(state.records.length, 0);
  assert.equal(state.users.length, 0);
});

test('preexisting files at proposed seed paths are never claimed or deleted', async () => {
  const { state, client } = setup();
  const key = demoBooks[0].cover_image_path;
  state.files.set(key, Buffer.from('existing file'));
  await assert.rejects(() => seedDemo(client), /non-seeded cover/);
  assert.equal(state.creates.length, 0);
  assert.equal(state.records.length, 0);
  await unseedDemo(client);
  assert.equal(state.files.get(key)?.toString(), 'existing file');
});

test('seed never overwrites a changed cover; cleanup protects changed Auth ownership', async () => {
  const { state, client } = setup();
  await seedDemo(client);
  const key = demoBooks[0].cover_image_path;
  state.files.set(key, Buffer.from('replacement'));
  await assert.rejects(() => seedDemo(client), /overwrite a different file/);
  assert.equal(state.files.get(key)?.toString(), 'replacement');
  state.users[0].app_metadata = {};
  await assert.rejects(() => unseedDemo(client), /ownership changed/);
  assert.equal(state.deletedUsers.length, 0);
  assert.equal(state.deletedFiles.length, 0);
});

test('cleanup recovers Auth users created before a failed database seed', async () => {
  const { state, client } = setup();
  state.users.push({ id: 'a1170000-0000-4000-8000-000000000001', email: 'admin@frighton.com',
    app_metadata: { lms_seed: DEMO_SEED, lms_seed_key: 'admin' } } as User);
  await unseedDemo(client);
  assert.equal(state.users.length, 0);
  assert.equal(state.deletedUsers.length, 1);
});

test('seeding and cleanup succeed when global Auth listing is broken', async () => {
  const { state, client } = setup();
  state.users.push({ id: 'unrelated-legacy', email: 'legacy@example.com', app_metadata: {} } as User);
  await seedDemo(client);
  await unseedDemo(client);
  assert.equal(state.authListRequests, 0);
  assert.equal(state.authLookupRequests, 2);
  assert.deepEqual(state.users.map(user => user.id), ['unrelated-legacy']);
});

test('a missing scoped lookup stops both commands before mutations with migration instructions', async () => {
  const { state, client } = setup();
  state.failAuthLookup = true;
  await assert.rejects(() => seedDemo(client), /013_demo_auth_lookup.sql/);
  await assert.rejects(() => unseedDemo(client), /013_demo_auth_lookup.sql/);
  assert.equal(state.creates.length, 0);
  assert.equal(state.deletedUsers.length, 0);
  assert.equal(state.deletedFiles.length, 0);
  assert.equal(state.records.length, 0);
});

test('scoped lookup still catches a tracked identity with a changed email and removed ownership marker', async () => {
  const { state, client } = setup();
  await seedDemo(client);
  state.users[0].email = 'renamed@example.com';
  state.users[0].app_metadata = {};
  await assert.rejects(() => unseedDemo(client), /ownership changed/);
  assert.equal(state.deletedUsers.length, 0);
  assert.equal(state.records.length, 13);
});
