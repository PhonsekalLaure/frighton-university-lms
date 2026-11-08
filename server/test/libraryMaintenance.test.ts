import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createClient } from '@supabase/supabase-js';
import { runLibraryMaintenance } from '../src/services/libraryMaintenance.js';

test('an unnumbered SIS profile cannot stop queued debt delivery', async () => {
  let delivered = false;
  const server = createServer(async (req, res) => {
    const u = new URL(req.url ?? '/', 'http://test');
    let raw = '';
    for await (const c of req) raw += c;
    res.setHeader('Content-Type', 'application/json');
    if (u.pathname === '/rest/v1/profiles')
      return res.end(
        JSON.stringify(
          u.searchParams.get('student_number') === 'not.is.null' ? [] : [{ id: 'pending-profile' }],
        ),
      );
    if (u.pathname.endsWith('/refresh_library_debt')) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ code: 'PT404', message: 'Student was not found.' }));
    }
    if (u.pathname.endsWith('/claim_library_debt'))
      return res.end(
        JSON.stringify([
          {
            student_id: 'numbered-student',
            version: 1,
            claim_token: 'claim',
            payload: {
              studentNumber: 'TEST-1',
              qualifyingDebtCount: 0,
              amount: 0,
              currency: 'PHP',
              reason: 'Clear',
            },
          },
        ]),
      );
    res.end('null');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const client = createClient(
      'http://127.0.0.1:' + (server.address() as AddressInfo).port,
      'review-only-key',
      { auth: { persistSession: false } },
    );
    await runLibraryMaintenance(client, async () => {
      delivered = true;
      return { applied: true, version: 1 };
    });
    assert.equal(delivered, true);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
