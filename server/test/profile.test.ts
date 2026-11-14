import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { config } from '../src/config/env.js';

test('profile and password endpoints enforce staff access, confirmation, ownership, and safe failures', async () => {
  const staffId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const authId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  let role = 'Admin';
  let active = true;
  let failProfile = false;
  let failSignIn = false;
  let failPassword = false;
  let profile = { first_name: 'Test', middle_name: null as string | null, last_name: 'Staff' };
  const profileWrites: Array<{ url: URL; body: Record<string, unknown> }> = [];
  const passwordWrites: Array<{ path: string; body: Record<string, unknown> }> = [];
  let signIns = 0;
  let cleanups = 0;
  const user = { id: authId, email: 'staff@example.test', email_confirmed_at: '2026-01-01T00:00:00Z',
    aud: 'authenticated', created_at: '2026-01-01T00:00:00Z', app_metadata: {}, user_metadata: {} };
  const token = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ sub: authId, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
    'signature',
  ].join('.');
  const upstream = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const text = Buffer.concat(chunks).toString();
    const body = text ? JSON.parse(text) : {};
    const url = new URL(req.url!, 'http://upstream');
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/auth/v1/user') return res.end(JSON.stringify(user));
    if (url.pathname === '/rest/v1/users') {
      if (req.method === 'PATCH') {
        if (failProfile) {
          res.statusCode = 400;
          return res.end(JSON.stringify({ code: 'test_error', message: 'Internal database detail' }));
        }
        profileWrites.push({ url, body });
        profile = { first_name: body.first_name, middle_name: body.middle_name, last_name: body.last_name };
      }
      return res.end(JSON.stringify({ users_id: staffId, email: user.email, ...profile, role, is_active: active }));
    }
    if (url.pathname === '/auth/v1/token') {
      signIns++;
      if (failSignIn) {
        res.statusCode = 502;
        return res.end(JSON.stringify({ msg: 'Internal provider failure' }));
      }
      if (body.password !== 'old-password') {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error_code: 'invalid_credentials', msg: 'Invalid credentials' }));
      }
      assert.equal(body.email, user.email);
      return res.end(JSON.stringify({ access_token: token, refresh_token: 'temporary-refresh',
        expires_in: 3600, token_type: 'bearer', user }));
    }
    if (url.pathname.startsWith('/auth/v1/admin/users/')) {
      if (failPassword) {
        res.statusCode = 422;
        return res.end(JSON.stringify({ msg: 'Internal password policy detail' }));
      }
      passwordWrites.push({ path: url.pathname, body });
      return res.end(JSON.stringify({ user }));
    }
    if (url.pathname === '/auth/v1/logout') {
      assert.equal(url.searchParams.get('scope'), 'local');
      cleanups++;
      return res.end('{}');
    }
    res.statusCode = 404;
    res.end('{}');
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const original = { ...config.supabase };
  config.supabase.url = 'http://127.0.0.1:' + (upstream.address() as AddressInfo).port;
  config.supabase.anonKey = 'test-anon-key';
  config.supabase.serviceRoleKey = 'test-service-key';
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/auth';
  const headers = { Authorization: 'Bearer staff-token', 'Content-Type': 'application/json' };
  const names = { firstName: '  Jane ', middleName: ' A. ', lastName: ' Doe ', confirmed: true };
  const passwords = { currentPassword: 'old-password', newPassword: 'new-password', confirmPassword: 'new-password', confirmed: true };
  const send = (path: string, body: unknown, requestHeaders = headers) => fetch(base + path, {
    method: path === '/profile' ? 'PATCH' : 'POST', headers: requestHeaders, body: JSON.stringify(body),
  });
  try {
    for (const path of ['/profile', '/change-password']) {
      assert.equal((await send(path, {}, { Authorization: '', 'Content-Type': 'application/json' })).status, 403);
      // A valid origin passes CSRF protection, but still needs an authenticated account.
      const anonymous = await fetch(base + path, { method: path === '/profile' ? 'PATCH' : 'POST',
        headers: { Origin: config.clientUrl, 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(anonymous.status, 401);
      active = false;
      assert.equal((await send(path, {})).status, 403);
      active = true; role = 'Students';
      assert.equal((await send(path, {})).status, 403);
      role = 'Admin';
    }
    assert.equal(profileWrites.length, 0);
    assert.equal(signIns, 0);
    assert.equal((await send('/profile', { ...names, confirmed: false })).status, 400);
    assert.equal((await send('/profile', { ...names, firstName: ' ' })).status, 400);
    assert.equal(profileWrites.length, 0);

    for (const staffRole of ['Admin', 'Librarian']) {
      role = staffRole;
      const response = await send('/profile', { ...names, id: 'another-account', role: 'Admin', email: 'other@example.test' });
      assert.equal(response.status, 200);
      const saved = (await response.json()).librarian;
      assert.equal(saved.id, staffId);
      assert.equal(saved.fullName, 'Jane A. Doe');
      assert.equal(saved.email, user.email);
      assert.equal(saved.role, staffRole.toLowerCase());
      const write = profileWrites.at(-1)!;
      assert.equal(write.url.searchParams.get('users_id'), 'eq.' + staffId);
      assert.equal(write.url.searchParams.get('is_active'), 'eq.true');
      assert.deepEqual(Object.keys(write.body).sort(), ['first_name', 'last_name', 'middle_name', 'updated_at']);
      const session = await fetch(base + '/me', { headers });
      assert.equal((await session.json()).librarian.fullName, 'Jane A. Doe');

      const passwordResponse = await send('/change-password', passwords);
      assert.equal(passwordResponse.status, 204);
      assert.equal(await passwordResponse.text(), '');
      assert.equal(passwordWrites.at(-1)!.path, '/auth/v1/admin/users/' + authId);
      assert.deepEqual(passwordWrites.at(-1)!.body, { password: 'new-password' });
    }
    assert.equal(cleanups, 2);
    const cleared = await send('/profile', { ...names, middleName: '  ' });
    assert.equal((await cleared.json()).librarian.fullName, 'Jane Doe');
    assert.equal(profile.middle_name, null);

    failProfile = true;
    const failedProfile = await send('/profile', names);
    assert.equal(failedProfile.status, 503);
    assert.doesNotMatch(JSON.stringify(await failedProfile.json()), /Internal database detail/);
    assert.equal(profileWrites.length, 3);

    const wrongPassword = await send('/change-password', { ...passwords, currentPassword: 'wrong-password' });
    assert.equal(wrongPassword.status, 400);
    assert.match((await wrongPassword.json()).error, /current password is incorrect/);
    assert.equal(passwordWrites.length, 2);
    failSignIn = true;
    const unavailable = await send('/change-password', passwords);
    assert.equal(unavailable.status, 503);
    assert.doesNotMatch(JSON.stringify(await unavailable.json()), /Internal provider failure/);
    failSignIn = false; failPassword = true;
    const rejected = await send('/change-password', passwords);
    assert.equal(rejected.status, 400);
    assert.doesNotMatch(JSON.stringify(await rejected.json()), /Internal password policy detail/);
    assert.equal(passwordWrites.length, 2);
    assert.equal(cleanups, 3, 'temporary session is cleaned up after an update failure too');

    const limited = await send('/change-password', passwords);
    assert.equal(limited.status, 429);
    assert.ok(limited.headers.get('retry-after'));
    assert.equal(signIns, 5);
  } finally {
    Object.assign(config.supabase, original);
    await Promise.all([server, upstream].map((running) => new Promise<void>((resolve) => running.close(() => resolve()))));
  }
});
