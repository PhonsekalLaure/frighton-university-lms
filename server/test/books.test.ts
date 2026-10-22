import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import express from 'express';
import { createBookController } from '../src/controllers/bookController.js';
import { errorHandler } from '../src/middlewares/errorHandler.js';
import { createBookRouter } from '../src/routes/bookRoutes.js';
import { BookService } from '../src/services/bookService.js';
import { parseBookBody } from '../src/validators/bookValidators.js';
import { HttpError } from '../src/utils/httpError.js';

const input = { title: 'Dracula', author: 'Bram Stoker', category: 'Literature', year: 1897, total: 2, shelf: 'A-1' };
const book = { ...input, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', available: 1, active: true };
test('book validation rejects malformed input and fractional or negative copy counts', () => {
  assert.deepEqual(parseBookBody(input), input);
  for (const value of [null, [], {}, { ...input, title: '' }, { ...input, total: -1 }, { ...input, total: 1.5 }, { ...input, year: 0 }]) {
    assert.throws(() => parseBookBody(value), HttpError);
  }
  assert.equal(parseBookBody({ ...input, year: null }).year, null);
});
test('catalog endpoints persist add/edit/archive and return empty database results without mock books', async () => {
  let empty = false;
  const app = express();
  app.use(express.json());
  app.use('/books', createBookRouter(createBookController(new BookService({
    list: async ({ page, pageSize }) => ({ data: empty ? [] : [book], total: empty ? 0 : 1, page, pageSize }),
    save: async (id, value) => { assert.deepEqual(value, input); return { ...book, id: id ?? book.id }; },
    archive: async (id) => { assert.equal(id, book.id); return { ...book, active: false }; },
  }))));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/books`;
  try {
    for (const [path, method, expected] of [['', 'POST', 201], ['/' + book.id, 'PUT', 200]] as const) {
      const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, available: 1000 }) });
      assert.equal(response.status, expected);
      assert.equal((await response.json()).available, 1);
    }
    const archive = await fetch(base + '/' + book.id + '/archive', { method: 'POST' });
    assert.equal((await archive.json()).active, false);
    empty = true;
    assert.deepEqual((await (await fetch(base)).json()).data, []);
    const invalid = await fetch(base + '/1/archive', { method: 'POST' });
    assert.equal(invalid.status, 400);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
