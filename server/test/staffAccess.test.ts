import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { config } from '../src/config/env.js';

test('circulation allows verified active Librarians and Admins while denying students and inactive staff', async () => {
  let role = 'Librarian';
  let active = true;
  const upstream = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    const body = req.headers['content-type']?.includes('application/json') && bytes.length ? JSON.parse(bytes.toString()) : {};
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/auth/v1/user') {
      res.end(JSON.stringify({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'staff@example.test',
        email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: {}, user_metadata: {},
        aud: 'authenticated', created_at: '2026-01-01T00:00:00Z',
      }));
    } else if (req.url?.startsWith('/rest/v1/users?') && req.url.includes('role=eq.Librarian')) {
      res.setHeader('Content-Range', '0-0/0');
      res.end('[]');
    } else if (req.url?.startsWith('/rest/v1/users?')) {
      res.end(JSON.stringify({
        users_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: 'staff@example.test',
        first_name: 'Test', middle_name: null, last_name: 'Staff', role, is_active: active,
      }));
    } else if (req.url?.startsWith('/rest/v1/books?')) {
      res.end(JSON.stringify(req.method === 'GET'
        ? [{ cover_image_path: 'staff-test/cover.png' }]
        : { id: body.books_id, title: 'Title', author: 'Author', category: 'Literature', year: 1897, available: 1, shelf: 'A-1', active: true, cover_image_path: body.cover_image_path }));
    } else if (req.url?.startsWith('/storage/v1/object/book-covers/')) {
      if (req.method === 'POST') res.end(JSON.stringify({ Id: 'object-id', Key: req.url.slice('/storage/v1/object/'.length) }));
      else { res.setHeader('Content-Type', 'image/png'); res.end('cover'); }
    } else if (req.url === '/rest/v1/rpc/circulation_policy') {
      res.end(JSON.stringify({
        time_zone: 'Asia/Manila', loan_period_days: 14, max_active_loans: 3,
        daily_penalty_rate: 5, today: '2026-10-22', due_date: '2026-11-05',
      }));
    } else {
      res.statusCode = 404;
      res.end('{}');
    }
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const original = { ...config.supabase };
  config.supabase.url = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  config.supabase.serviceRoleKey = 'test-service-key';
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    for (const scenario of [
      { role: 'Librarian', active: true, status: 200 },
      { role: 'Admin', active: true, status: 200 },
      { role: 'Students', active: true, status: 403 },
      { role: 'Librarian', active: false, status: 403 },
      { role: 'Admin', active: false, status: 403 },
    ]) {
      role = scenario.role;
      active = scenario.active;
      const response = await fetch(base + '/api/v1/loans/policy', {
        headers: { Authorization: 'Bearer test-staff-token' },
      });
      assert.equal(response.status, scenario.status, `${role}, active=${active}`);
      const image = await fetch(base + '/api/v1/books/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/image', { headers: { Authorization: 'Bearer test-staff-token' } });
      assert.equal(image.status, scenario.status);
      if (image.ok) { assert.equal(image.headers.get('content-type'), 'image/png'); assert.equal(await image.text(), 'cover'); }
      const directory = await fetch(base + '/api/v1/staff', { headers: { Authorization: 'Bearer test-staff-token' } });
      assert.equal(directory.status, scenario.role === 'Admin' && scenario.active ? 200 : 403);
    }
    role = 'Librarian'; active = true;
    const headers = { Authorization: 'Bearer test-staff-token', 'Content-Type': 'application/json' };
    const largeBook = await fetch(base + '/api/v1/books', { method: 'POST', headers,
      body: JSON.stringify({ title: 'Title', author: 'Author', total: 1, image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jHfkAAAAASUVORK5CYII=', category: 'Literature', year: 1897, shelf: 'A-1', extra: 'x'.repeat(3 * 1024 * 1024) }) });
    assert.equal(largeBook.status, 201, 'book JSON accepts upload-sized bodies above the previous 3 MB limit');
    const oversized = await fetch(base + '/api/v1/books', { method: 'POST', headers,
      body: JSON.stringify({ image: 'x'.repeat(14 * 1024 * 1024) }) });
    assert.equal(oversized.status, 413);
    assert.match((await oversized.json()).error, /up to 10 MB/);
    const unauthenticated = await fetch(base + '/api/v1/books/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/image');
    assert.equal(unauthenticated.status, 401);
  } finally {
    Object.assign(config.supabase, original);
    await Promise.all([server, upstream].map((running) =>
      new Promise<void>((resolve, reject) => running.close((error) => error ? reject(error) : resolve())),
    ));
  }
});
