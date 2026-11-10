import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { createAuditRouter, parseAuditFilters } from '../src/routes/auditRoutes.js';
import { errorHandler } from '../src/middlewares/errorHandler.js';
import { config } from '../src/config/env.js';
import { auditActions } from '../src/models/audit.js';
import { listAuditEvents } from '../src/repositories/auditRepository.js';
import { createApp } from '../src/app.js';

const event = { id: 1, occurredAt: '2026-11-09T01:00:00Z', action: 'loan.borrowed',
  actorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', actorName: 'Test Staff', actorRole: 'Librarian',
  entityType: 'loan', entityId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', entityLabel: 'Dracula', studentNumber: 'TEST-1', details: {} };

test('audit filters validate actions, bounded pages, repeated inputs and real date ranges', () => {
  assert.equal(parseAuditFilters({ q: '  Dracula ', action: 'loan.borrowed', from: '2026-11-09', to: '2026-11-09' }).query, 'Dracula');
  for (const value of [{ action: 'delete.all' }, ...['page.viewed', 'records.viewed', 'search.performed', 'export.csv', 'auth.signed_in', 'auth.signed_out', 'action.failed'].map(action => ({ action })), { action: ['loan.borrowed'] }, { q: ['secret'] }, { q: 'x'.repeat(101) },
    { from: '2026-02-30' }, { from: '2026-11-10', to: '2026-11-09' }, { page: '0' }, { pageSize: '101' }]) {
    assert.throws(() => parseAuditFilters(value), { status: 400 });
  }
});

test('audit routes deny anonymous and librarian users before querying, and expose no mutation endpoints', async () => {
  let role: string | undefined; let calls = 0;
  const app = express();
  app.use((_req, res, next) => { if (role) res.locals.librarian = { role }; next(); });
  app.use('/audit', createAuditRouter(async (filters) => { calls++; return { data: [event], total: 1, page: filters.page, pageSize: filters.pageSize }; }));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/audit';
  try {
    assert.equal((await fetch(base)).status, 401);
    role = 'librarian'; assert.equal((await fetch(base)).status, 403); assert.equal(calls, 0);
    role = 'admin'; const response = await fetch(base + '?action=loan.borrowed');
    assert.equal(response.status, 200); assert.equal((await response.json()).data[0].actorName, 'Test Staff');
    for (const method of ['POST', 'PUT', 'DELETE']) assert.equal((await fetch(base, { method })).status, 404);
    assert.equal(calls, 1);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('the production audit endpoint verifies active admins and safely filters database reads', async () => {
  let role = 'Admin'; let active = true; let missing = false; let auditWrites = 0; const queries: URL[] = [];
  const upstream = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const url = new URL(req.url!, 'http://upstream');
    if (url.pathname === '/auth/v1/user') return res.end(JSON.stringify({ id: event.actorId, email: 'staff@example.test', email_confirmed_at: '2026-01-01T00:00:00Z' }));
    if (url.pathname === '/rest/v1/users') return res.end(JSON.stringify({ users_id: event.actorId, email: 'staff@example.test', first_name: 'Test', last_name: 'Staff', role, is_active: active }));
    if (url.pathname === '/rest/v1/catalog_books') { res.setHeader('Content-Range', '0-0/0'); return res.end('[]'); }
    if (url.pathname === '/rest/v1/lms_audit_events') {
      if (req.method !== 'GET') { auditWrites++; res.statusCode = 403; return res.end('{}'); }
      queries.push(url);
      if (missing) { res.statusCode = 404; return res.end(JSON.stringify({ code: 'PGRST205', message: 'Internal schema details' })); }
      res.setHeader('Content-Range', '0-0/1'); return res.end(JSON.stringify([event]));
    }
    res.statusCode = 404; res.end('{}');
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const old = { ...config.supabase }; config.supabase.url = 'http://127.0.0.1:' + (upstream.address() as AddressInfo).port; config.supabase.serviceRoleKey = 'test-service-key';
  const server = createApp().listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/v1/audit-trail';
  const headers = { Authorization: 'Bearer test-token' };
  try {
    assert.equal((await fetch(base)).status, 401);
    role = 'Librarian'; assert.equal((await fetch(base, { headers })).status, 403); assert.equal(queries.length, 0);
    role = 'Admin'; active = false; assert.equal((await fetch(base, { headers })).status, 403); assert.equal(queries.length, 0);
    active = true;
    const response = await fetch(base + '?q=100%25_&action=loan.borrowed&from=2026-11-09&to=2026-11-09&page=2&pageSize=25', { headers });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).total, 1);
    const query = queries[0];
    assert.deepEqual(query.searchParams.getAll('action'), ['in.(' + auditActions.join(',') + ')', 'eq.loan.borrowed']);
    assert.equal(query.searchParams.get('search_text'), 'ilike.%100' + String.fromCharCode(92) + '%' + String.fromCharCode(92) + '_%');
    assert.equal(query.searchParams.get('occurred_at'), 'gte.2026-11-08T16:00:00.000Z');
    assert.ok(query.searchParams.getAll('occurred_at').includes('lt.2026-11-09T16:00:00.000Z'));
    assert.equal(query.searchParams.get('offset'), '25'); assert.equal(query.searchParams.get('limit'), '25');
    // Refreshing records, checking a session, and rejected activity requests must not append audit entries.
    const origin = base.replace('/api/v1/audit-trail', '');
    assert.equal((await fetch(origin + '/api/auth/me', { headers })).status, 200);
    assert.equal((await fetch(origin + '/api/v1/books', { headers })).status, 200);
    assert.equal((await fetch(base, { headers })).status, 200);
    assert.equal((await fetch(origin + '/api/v1/activity', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'page.viewed', page: 'books' }) })).status, 404);
    assert.equal(auditWrites, 0, 'reads and navigation must not write audit events');
    missing = true;
    await assert.rejects(listAuditEvents({ page: 1, pageSize: 25 }), { status: 503, message: 'Audit trail is not enabled yet. Apply the audit trail database migration.' });
  } finally { Object.assign(config.supabase, old); await Promise.all([server, upstream].map((s) => new Promise<void>((resolve) => s.close(() => resolve())))); }
});
