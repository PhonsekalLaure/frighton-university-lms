import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { config } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { createServiceRouter } from '../src/routes/serviceRoutes.js';
import { errorHandler } from '../src/middlewares/errorHandler.js';
import type { LibraryService } from '../src/services/libraryService.js';
import { sisService } from '../src/services/sisService.js';
import { createClient } from '@supabase/supabase-js';
import { LibraryService as RealLibraryService } from '../src/services/libraryService.js';
const bookId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
test('database SDK does not retry a failed reservation mutation', async () => {
  let calls = 0;
  const app = express();
  app.post('/rest/v1/rpc/create_self_service_reservation', (_req, res) => {
    calls++;
    res.status(503).json({ message: 'Uncertain database outcome' });
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const client = createClient('http://127.0.0.1:' + (server.address() as AddressInfo).port, 'test-key', {
      auth: { persistSession: false },
    });
    const service = new RealLibraryService(
      () => client,
      async () => ({ canBorrow: true, blockedReason: null }) as any,
    );
    await assert.rejects(service.reserve('TEST-A', bookId), { status: 503 });
    assert.equal(calls, 1);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
test('private API rejects browser credentials, invalid scopes and spoofed actor fields', async () => {
  const old = config.service.apiKey;
  config.service.apiKey = 'test-private-key';
  const calls: any[] = [];
  const service = {
    books: async (...args: any[]) => {
      calls.push(args);
      return { items: [], page: 1, pageSize: 25, total: 0 };
    },
    reserve: async (...args: any[]) => {
      calls.push(args);
      return { id: bookId };
    },
    cancel: async (...args: any[]) => {
      calls.push(args);
    },
    account: async () => ({ reservations: [], loans: [], unpaidFines: [] }),
  } as unknown as LibraryService;
  const app = express();
  app.use(express.json());
  app.use('/service/v1', createServiceRouter(service));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  const headers = { 'Content-Type': 'application/json', 'x-sis-api-key': config.service.apiKey };
  try {
    assert.equal((await fetch(base + '/service/v1/books')).status, 401);
    assert.equal(
      (await fetch(base + '/service/v1/books', { headers: { ...headers, Origin: 'http://browser' } })).status,
      403,
    );
    assert.equal((await fetch(base + '/service/v1/books?q=%2Cadmin', { headers })).status, 400);
    assert.equal((await fetch(base + '/service/v1/books?pageSize=101', { headers })).status, 400);
    assert.equal((await fetch(base + '/service/v1/books?q=Dracula', { headers })).status, 200);
    assert.equal(
      (
        await fetch(base + '/service/v1/reservations', {
          method: 'POST',
          headers,
          body: JSON.stringify({ studentNumber: 'TEST-A', bookId, reservedBy: 'spoofed' }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(base + '/service/v1/reservations', {
          method: 'POST',
          headers,
          body: JSON.stringify({ studentNumber: 'TEST-A', bookId }),
        })
      ).status,
      201,
    );
    assert.deepEqual(calls[1], ['TEST-A', bookId]);
    assert.equal(
      (
        await fetch(base + '/service/v1/reservations/' + bookId, {
          method: 'DELETE',
          headers,
          body: JSON.stringify({ studentNumber: 'TEST-A' }),
        })
      ).status,
      204,
    );
    config.service.apiKey = config.sis.apiKey;
    assert.equal((await fetch(base + '/service/v1/books', { headers })).status, 401);
  } finally {
    config.service.apiKey = old;
    await new Promise<void>((r) => server.close(() => r()));
  }
});
test('production mounts guard replacement charge writes and student reads', async () => {
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  try {
    for (const method of ['GET', 'POST'])
      assert.equal(
        (await fetch(base + '/api/v1/replacement-charges', { method, headers: { Origin: config.clientUrl } }))
          .status,
        401,
      );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
test('SIS adapter rejects mismatched or malformed eligibility and sends studentNumber for debt', async (t) => {
  const old = config.sis.apiKey;
  config.sis.apiKey = 'test-inbound';
  try {
    const fetch = t.mock.method(
      globalThis,
      'fetch',
      async () =>
        new Response(JSON.stringify({ studentNumber: 'OTHER', canBorrow: true, activeHolds: [] }), {
          status: 200,
        }),
    );
    await assert.rejects(sisService.checkStudentStatus('TEST-A'), { status: 503 });
    fetch.mock.mockImplementation(async (_url: any, init: any) => {
      assert.deepEqual(JSON.parse(init.body), { studentNumber: 'TEST-A' });
      return new Response('{}', { status: 200 });
    });
    await sisService.placeHold('TEST-A', 'Ignored legacy amount', 999);
  } finally {
    config.sis.apiKey = old;
  }
});
