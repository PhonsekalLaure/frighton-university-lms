import { readFile } from 'node:fs/promises';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { DEMO_PASSWORD, DEMO_SEED, demoBooks, demoStaff } from './demoData.js';
import { BOOK_COVER_BUCKET } from '../repositories/bookCoverStorage.js';

interface SeedRecord { kind: 'book' | 'staff'; seed_key: string; record_id: string; cover_path: string | null }
function check(error: { message: string } | null, action: string): void {
  if (error) throw new Error(action + ': ' + error.message);
}
type DemoAuthUser = Pick<User, 'id' | 'email' | 'app_metadata' | 'email_confirmed_at'>;
export function isDemoUser(user: Pick<User, 'app_metadata'>): boolean {
  return user.app_metadata?.lms_seed === DEMO_SEED;
}
async function authUsers(client: SupabaseClient): Promise<DemoAuthUser[]> {
  // Do not load all project users through GoTrue: a malformed legacy row can
  // make listUsers fail even when all demo accounts are healthy.
  const { data, error } = await client.rpc('lms_demo_auth_users');
  check(error, 'Read demo Auth identities (apply migration 013_demo_auth_lookup.sql after 012)');
  return data ?? [];
}
async function records(client: SupabaseClient): Promise<SeedRecord[]> {
  const { data, error } = await client.from('lms_demo_seed_records').select('*');
  check(error, 'Read seed ownership (apply migration 012_demo_seed.sql first)');
  return data ?? [];
}
async function ensureBucket(client: SupabaseClient): Promise<void> {
  const { data, error } = await client.storage.getBucket(BOOK_COVER_BUCKET);
  if (error && (Number(error.status) === 404 || /not found/i.test(error.message))) {
    const created = await client.storage.createBucket(BOOK_COVER_BUCKET, {
      public: false, fileSizeLimit: 10485760, allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    });
    check(created.error, 'Create private cover bucket');
  } else {
    check(error, 'Read cover bucket');
    if (data?.public) throw new Error('The book-covers bucket must be private.');
  }
}
export async function seedDemo(client: SupabaseClient): Promise<void> {
  const tracked = await records(client);
  const users = await authUsers(client);
  // Read assets before any mutations, including when running from another cwd.
  const covers = await Promise.all(demoBooks.map(book =>
    readFile(new URL('../../seed-assets/' + book.key + '.png', import.meta.url))));
  const planned = demoStaff.map(staff => {
    const owned = tracked.find(row => row.kind === 'staff' && row.seed_key === staff.key);
    const user = users.find(candidate => owned ? candidate.id === owned.record_id
      : candidate.email?.toLowerCase() === staff.email);
    if (user && (!isDemoUser(user) || user.app_metadata.lms_seed_key !== staff.key)) {
      throw new Error('Refusing to change an existing non-seeded Auth account: ' + staff.email);
    }
    if (owned && !user) throw new Error('A seeded Auth identity is missing. Run db:unseed before reseeding.');
    if (user && user.email?.toLowerCase() !== staff.email) {
      throw new Error('A seeded email was changed. Run db:unseed before reseeding.');
    }
    return { staff, user };
  });
  // Reject existing profiles before creating any accounts. Never adopt by email.
  for (const { staff, user } of planned) {
    const result = await client.from('users').select('users_id').ilike('email', staff.email).maybeSingle();
    check(result.error, 'Check staff profile');
    const profile = result.data;
    if (profile && !tracked.some(row => row.kind === 'staff'
      && row.seed_key === staff.key && row.record_id === profile.users_id && row.record_id === user?.id)) {
      throw new Error('Refusing to change an existing non-seeded staff profile: ' + staff.email);
    }
  }
  await ensureBucket(client);
  // Never claim a file that existed before this seed reserved its path.
  for (const book of demoBooks) {
    if (tracked.some(row => row.kind === 'book' && row.seed_key === book.key)) continue;
    const existing = await client.storage.from(BOOK_COVER_BUCKET).download(book.cover_image_path);
    if (existing.data) throw new Error('Refusing to claim an existing non-seeded cover: ' + book.cover_image_path);
    if (existing.error && Number(existing.error.status) !== 404
      && !/not found/i.test(existing.error.message)) check(existing.error, 'Check cover ownership');
  }
  const profiles = [];
  for (const { staff, user } of planned) {
    let id = user?.id;
    if (!id) {
      const created = await client.auth.admin.createUser({
        email: staff.email, password: DEMO_PASSWORD, email_confirm: true,
        app_metadata: { lms_seed: DEMO_SEED, lms_seed_key: staff.key },
        user_metadata: { first_name: staff.first_name, last_name: staff.last_name, role: staff.role },
      });
      check(created.error, 'Create confirmed Auth account ' + staff.email);
      if (!created.data.user) throw new Error('Auth did not return the new account.');
      id = created.data.user.id;
    }
    profiles.push({ ...staff, users_id: id });
  }
  const saved = await client.rpc('seed_lms_demo', { p_staff: profiles, p_books: demoBooks });
  check(saved.error, 'Create demo records');
  // Never overwrite covers. Recover an interrupted upload by verifying its bytes.
  for (const [index, book] of demoBooks.entries()) {
    const existing = await client.storage.from(BOOK_COVER_BUCKET).download(book.cover_image_path);
    if (existing.data) {
      if (!covers[index].equals(Buffer.from(await existing.data.arrayBuffer()))) {
        throw new Error('Refusing to overwrite a different file at ' + book.cover_image_path);
      }
      continue;
    }
    if (existing.error && Number(existing.error.status) !== 404
      && !/not found/i.test(existing.error.message)) check(existing.error, 'Read seeded cover');
    const uploaded = await client.storage.from(BOOK_COVER_BUCKET).upload(book.cover_image_path, covers[index], {
      contentType: 'image/png', upsert: false,
    });
    check(uploaded.error, 'Upload cover for ' + book.title);
  }
}
export async function unseedDemo(client: SupabaseClient): Promise<void> {
  const tracked = await records(client);
  const users = await authUsers(client);
  const ownedUsers = users.filter(isDemoUser);
  // Validate ownership before deleting any database rows.
  for (const row of tracked.filter(row => row.kind === 'staff')) {
    const user = users.find(candidate => candidate.id === row.record_id);
    if (user && (!isDemoUser(user) || user.app_metadata.lms_seed_key !== row.seed_key)) {
      throw new Error('Refusing to delete an Auth identity whose seed ownership changed.');
    }
  }
  // Recover accounts created before a failed database transaction, without adopting profiles.
  for (const user of ownedUsers.filter(candidate => !tracked.some(row => row.kind === 'staff' && row.record_id === candidate.id))) {
    const result = await client.from('users').select('users_id').or(
      'users_id.eq.' + user.id + (user.email ? ',email.ilike.' + user.email.replace(/[\\%_]/g, '\\$&') : ''),
    );
    check(result.error, 'Check interrupted Auth seed');
    if (result.data?.length) throw new Error('An interrupted seed account is linked to an untracked profile; cleanup refused.');
  }
  const removed = await client.rpc('unseed_lms_demo', { p_auth_ids: ownedUsers.map(user => user.id) });
  check(removed.error, 'Remove demo database records');
  // The RPC is atomic and refuses all referenced records before deleting anything.
  for (const row of (removed.data ?? []) as SeedRecord[]) {
    if (row.kind === 'book' && row.cover_path) {
      const result = await client.storage.from(BOOK_COVER_BUCKET).remove([row.cover_path]);
      check(result.error, 'Remove seeded cover');
    }
    if (row.kind === 'staff' && users.some(user => user.id === row.record_id)) {
      const result = await client.auth.admin.deleteUser(row.record_id);
      check(result.error, 'Remove seeded Auth account');
    }
    const result = await client.from('lms_demo_seed_records').delete().eq('kind', row.kind).eq('seed_key', row.seed_key);
    check(result.error, 'Complete seed cleanup');
  }
  for (const user of ownedUsers.filter(candidate => !tracked.some(row => row.kind === 'staff' && row.record_id === candidate.id))) {
    const result = await client.auth.admin.deleteUser(user.id);
    check(result.error, 'Remove interrupted seeded Auth account');
  }
}
