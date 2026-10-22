import assert from 'node:assert/strict';
import { test } from 'node:test';
import { databaseError } from '../src/utils/databaseError.js';

test('missing database migrations produce a setup error without exposing database internals', () => {
  for (const code of ['PGRST202', 'PGRST205', '42P01', '42703', '42883']) {
    const error = databaseError({ code, message: 'private database object details' });
    assert.equal(error.status, 503);
    assert.match(error.message, /setup is incomplete/i);
    assert.match(error.message, /apply the library migrations/i);
    assert.doesNotMatch(error.message, /private database object details/);
  }
});
test('transient database failures remain retryable rather than reporting missing setup', () => {
  const error = databaseError({ code: '08006', message: 'private connection details' });
  assert.equal(error.status, 503);
  assert.match(error.message, /temporarily unavailable/i);
  assert.doesNotMatch(error.message, /private connection details/);
});
