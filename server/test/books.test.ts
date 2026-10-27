import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import express from 'express';
import { createBookController } from '../src/controllers/bookController.js';
import { errorHandler } from '../src/middlewares/errorHandler.js';
import { createBookRouter } from '../src/routes/bookRoutes.js';
import { BookService } from '../src/services/bookService.js';
import { crc32 } from 'node:zlib';
import { MAX_COVER_BYTES, parseBookBody, parseBookImage } from '../src/validators/bookValidators.js';
import { HttpError, ValidationError } from '../src/utils/httpError.js';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jHfkAAAAASUVORK5CYII=';
const upload = 'data:image/png;base64,' + png;
const input = { title: 'Dracula', author: 'Bram Stoker', category: 'Literature', year: 1897, total: 2, shelf: 'A-1' };
const book = { ...input, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', available: 1, active: true, hasImage: true };
test('book validation rejects malformed input and fractional or negative copy counts', () => {
  assert.deepEqual(parseBookBody(input, false), input);
  for (const value of [null, [], {}, { ...input, title: '' }, { ...input, total: -1 }, { ...input, total: 1.5 }, { ...input, year: 0 }]) {
    assert.throws(() => parseBookBody(value), HttpError);
  }
  assert.throws(() => parseBookBody({ ...input, year: null }, false), ValidationError);
});
test('catalog endpoints persist add/edit/archive and return empty database results without mock books', async () => {
  let empty = false;
  let hasImage = true;
  const app = express();
  app.use(express.json());
  app.use('/books', createBookRouter(createBookController(new BookService({
    hasImage: async () => hasImage,
    image: async () => ({ bytes: Buffer.from('test-image'), contentType: 'image/png' }),
    list: async ({ page, pageSize }) => ({ data: empty ? [] : [book], total: empty ? 0 : 1, page, pageSize }),
    save: async (id, value) => { const { image, ...fields } = value; assert.deepEqual(fields, input); if (!id) assert.deepEqual(image, { data: png, contentType: 'image/png' }); return { ...book, id: id ?? book.id, hasImage: true }; },
    archive: async (id) => { assert.equal(id, book.id); return { ...book, active: false }; },
  }))));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/books`;
  try {
    for (const [path, method, expected] of [['', 'POST', 201], ['/' + book.id, 'PUT', 200]] as const) {
      const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, available: 1000, ...(method === 'POST' && { image: upload }) }) });
      assert.equal(response.status, expected);
      assert.equal((await response.json()).available, 1);
    }
    const missing = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    assert.equal(missing.status, 400);
    assert.match((await missing.json()).fields.image, /Upload a cover image/);
    hasImage = false;
    const legacyEdit = await fetch(base + '/' + book.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    assert.equal(legacyEdit.status, 400);
    assert.match((await legacyEdit.json()).fields.image, /Upload a cover image/);
    const repair = await fetch(base + '/' + book.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, image: upload }) });
    assert.equal(repair.status, 200);
    hasImage = true;
    const removal = await fetch(base + '/' + book.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, image: null }) });
    assert.equal(removal.status, 400);
    const imageResponse = await fetch(base + '/' + book.id + '/image');
    assert.equal(imageResponse.headers.get('content-type'), 'image/png');
    assert.equal(await imageResponse.text(), 'test-image');
    const bad = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, title: ' ', total: -1, image: 'data:image/png;base64,ZmFrZQ==' }) });
    assert.equal(bad.status, 400);
    const invalidBody = await bad.json();
    assert.deepEqual(Object.keys(invalidBody.fields).sort(), ['image', 'title', 'total']);
    assert.match(invalidBody.fields.title, /Enter the book title/);
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

test('cover validation accepts uploads and preserves existing images on metadata edits', () => {
  assert.deepEqual(parseBookBody({ ...input, image: 'data:image/png;base64,' + png }).image,
    { data: png, contentType: 'image/png' });
  assert.equal('image' in parseBookBody(input, false), false);
  assert.throws(() => parseBookBody(input), ValidationError);
  assert.throws(() => parseBookBody({ ...input, image: null }, false), ValidationError);
  assert.equal(parseBookBody({ ...input, title: '  Dracula  ' }, false).title, 'Dracula');
});
test('cover validation rejects empty, oversized, disguised, unsupported, and corrupt image input', () => {
  for (const image of ['', {}, 'https://example.test/cover.png', 'data:image/svg+xml;base64,PHN2Zy8+',
    'data:image/jpeg;base64,' + png, 'data:image/png;base64,ZmFrZQ==',
    'data:image/png;base64,' + Buffer.alloc(MAX_COVER_BYTES + 1).toString('base64')]) {
    assert.throws(() => parseBookBody({ ...input, image }), (error: unknown) =>
      error instanceof ValidationError && Boolean(error.fields.image));
  }
});
test('book validation reports all invalid fields with readable messages', () => {
  assert.throws(() => parseBookBody({ title: ' ', author: '', category: 'a'.repeat(201), shelf: 5, total: '2', year: 3.5 }),
    (error: unknown) => error instanceof ValidationError && Object.keys(error.fields).length === 7);
  for (const total of [NaN, Infinity, null, '', 1000001]) assert.throws(() => parseBookBody({ ...input, total }), ValidationError);
});

function sizedPng(size: number): string {
  const original = Buffer.from(png, 'base64');
  const chunk = Buffer.alloc(size - original.length);
  chunk.writeUInt32BE(chunk.length - 12, 0);
  chunk.write('paDd', 4, 'ascii');
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
  return 'data:image/png;base64,' + Buffer.concat([original.subarray(0, -12), chunk, original.subarray(-12)]).toString('base64');
}
test('image validation accepts images above the old limit and exactly 10 MB, and rejects one byte over', () => {
  for (const size of [3 * 1024 * 1024, 10 * 1024 * 1024]) {
    assert.equal(Buffer.from(parseBookImage(sizedPng(size)).data, 'base64').length, size);
  }
  assert.throws(() => parseBookImage(sizedPng(10 * 1024 * 1024 + 1)),
    (error: unknown) => error instanceof ValidationError && /10 MB/.test(error.fields.image));
});
test('Express validation requires publication year, category and shelf location on every save', () => {
  for (const key of ['year', 'category', 'shelf']) {
    for (const value of [undefined, null, '', '   ']) {
      assert.throws(() => parseBookBody({ ...input, [key]: value }, false),
        (error: unknown) => error instanceof ValidationError && Boolean(error.fields[key]), key + ': ' + String(value));
    }
  }
  assert.deepEqual(parseBookBody({ ...input, category: '  Literature  ', shelf: '  A-1  ' }, false), input);
});
