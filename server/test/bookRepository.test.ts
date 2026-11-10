import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { createBookRepository } from '../src/repositories/bookRepository.js';
import { HttpError, ValidationError } from '../src/utils/httpError.js';

const bookId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const originalPath = bookId + '/original.png';
const input = { title: 'Dracula', author: 'Bram Stoker', category: 'Literature', year: 1897, total: 4, shelf: 'A-1' };
const image = { data: Buffer.from('new-image').toString('base64'), contentType: 'image/jpeg' };
type Row = { books_id: string; title: string; author: string; category: string; publication_year: number; copies: number; shelf_location: string; is_active: boolean; cover_image_path: string | null };
async function withStore(run: (state: ReturnType<typeof stateFor>, repository: ReturnType<typeof createBookRepository>) => Promise<void>) {
  const state = stateFor();
  const upstream = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    const body = req.headers['content-type']?.includes('application/json') && bytes.length ? JSON.parse(bytes.toString()) : {};
    const url = new URL(req.url ?? '/', 'http://localhost');
    state.requests.push({ method: req.method ?? '', path: req.url ?? '', body, bytes, contentType: req.headers['content-type'], actor: req.headers['x-lms-actor-id'] });
    res.setHeader('Content-Type', 'application/json');
    const storagePrefix = '/storage/v1/object/book-covers/';
    if (url.pathname.startsWith(storagePrefix)) {
      const path = decodeURIComponent(url.pathname.slice(storagePrefix.length));
      if (state.bucketMissing) {
        res.statusCode = 404; res.end(JSON.stringify({ statusCode: '404', message: 'Bucket not found', error: 'not_found' })); return;
      }
      if (req.method === 'POST') {
        state.files.set(path, { bytes, type: req.headers['content-type'] ?? '' });
        res.end(JSON.stringify({ Id: 'object-id', Key: 'book-covers/' + path })); return;
      }
      const object = state.files.get(path);
      if (!object) { res.statusCode = 404; res.end(JSON.stringify({ statusCode: '404', message: 'Object not found', error: 'not_found' })); return; }
      res.setHeader('Content-Type', object.type); res.end(object.bytes); return;
    }
    if (url.pathname === '/storage/v1/object/book-covers' && req.method === 'DELETE') {
      if (state.cleanupFailed) { res.statusCode = 400; res.end(JSON.stringify({ statusCode: '400', message: 'Cleanup unavailable' })); return; }
      for (const path of body.prefixes) state.files.delete(path);
      res.end('[]'); return;
    }
    const filter = url.searchParams.get('books_id');
    const filtered = [...state.rows.values()].filter(row => !filter || filter === 'eq.' + row.books_id
      || (filter.startsWith('in.(') && filter.slice(4, -1).split(',').includes(row.books_id)));
    const toCatalog = (row: Row) => ({ id: row.books_id, title: row.title, author: row.author, category: row.category,
      year: row.publication_year, available: row.copies, total: row.copies + (row.books_id === bookId ? 1 : 0), shelf: row.shelf_location, active: row.is_active });
    if (url.pathname === '/rest/v1/catalog_books') {
      if (state.catalogReadFailsAfterSave && state.requests.some(r=>r.method==='PATCH')) { res.statusCode=400;res.end(JSON.stringify({message:'Refresh unavailable'}));return; }
      const rows = [...state.rows.values()].filter(row => !url.searchParams.has('id') || url.searchParams.get('id') === 'eq.' + row.books_id).map(toCatalog);
      res.setHeader('Content-Range', '0-' + Math.max(0, rows.length - 1) + '/' + rows.length); res.end(JSON.stringify(rows)); return;
    }
    if (url.pathname === '/rest/v1/books' && req.method === 'GET') {
      res.end(JSON.stringify(filtered.map(row => ({ books_id: row.books_id, cover_image_path: row.cover_image_path })))); return;
    }
    if (url.pathname === '/rest/v1/books' && (req.method === 'POST' || req.method === 'PATCH')) {
      if (state.saveFailed) { res.statusCode = 400; res.end(JSON.stringify({ code: '23514', message: 'simulated database failure' })); return; }
      const guarded = url.searchParams.has('copies');
      if (guarded && (state.stockConflict || (state.coverConflict && url.searchParams.has('cover_image_path')))) { res.end('[]'); return; }
      const current = req.method === 'POST' ? { is_active: true } : filtered[0];
      const row = { ...current, ...body } as Row;
      state.rows.set(row.books_id, row);
      if(state.commitResponseLost){res.statusCode=500;res.end(JSON.stringify({code:'08007',message:'Commit outcome unknown'}));return;}
      const result = { ...toCatalog(row), cover_image_path: row.cover_image_path };
      res.end(JSON.stringify(req.method === 'POST' ? result : [result])); return;
    }
    res.statusCode = 404; res.end('{}');
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const client = createClient('http://127.0.0.1:' + (upstream.address() as AddressInfo).port, 'test-service-key', { auth: { persistSession: false, autoRefreshToken: false } });
  try { await run(state, createBookRepository(() => client)); }
  finally { await new Promise<void>((resolve, reject) => upstream.close(error => error ? reject(error) : resolve())); }
}
function stateFor() {
  return {
    rows: new Map<string, Row>([[bookId, { books_id: bookId, title: 'Dracula', author: 'Bram Stoker', category: 'Literature', publication_year: 1897, copies: 1, shelf_location: 'A-1', is_active: true, cover_image_path: originalPath }]]),
    files: new Map([[originalPath, { bytes: Buffer.from('image-bytes'), type: 'image/png' }]]),
    requests: [] as Array<{ method: string; path: string; body: Record<string, unknown>; bytes: Buffer; contentType: string | undefined; actor?: string | string[] }>,
    saveFailed: false, stockConflict: false, coverConflict: false, bucketMissing: false, cleanupFailed: false, catalogReadFailsAfterSave:false,commitResponseLost:false,
  };
}

test('books upload to the private bucket and persist only cover_image_path; edits and archive preserve images', async () => {
  await withStore(async (state, repository) => {
    const list = await repository.list({ page: 1, pageSize: 10 });
    assert.equal(list.data[0].hasImage, true);
    assert.equal(state.requests.some(request => request.path.startsWith('/storage/')), false, 'listing does not download images');
    const downloaded = await repository.image(bookId);
    assert.equal(downloaded.bytes.toString(), 'image-bytes'); assert.equal(downloaded.contentType, 'image/png');
    const created = await repository.save(null, { ...input, image });
    const creation = state.requests.find(request => request.method === 'POST' && request.path.startsWith('/rest/v1/books'))!;
    const newPath = String(creation.body.cover_image_path);
    assert.ok(newPath.startsWith(created.id + '/')); assert.ok(newPath.endsWith('.jpg'));
    assert.equal('cover_image' in creation.body, false); assert.equal('cover_image_type' in creation.body, false);
    assert.equal(state.files.get(newPath)?.bytes.toString(), 'new-image');
    const uploads = state.requests.filter(request => request.method === 'POST' && request.path.startsWith('/storage/')).length;
    const updated = await repository.save(bookId, input);
    assert.equal(updated.available, 3); assert.equal(updated.total, 4);
    assert.equal(state.rows.get(bookId)?.cover_image_path, originalPath);
    assert.equal(state.requests.filter(request => request.method === 'POST' && request.path.startsWith('/storage/')).length, uploads);
    assert.equal((await repository.archive(bookId)).active, false);
    assert.ok(state.files.has(originalPath));
    assert.ok(state.requests.every(request => !request.path.includes('/rpc/')));
    for (const request of state.requests.filter(request => request.path.startsWith('/rest/'))) {
      assert.doesNotMatch(new URL(request.path, 'http://localhost').searchParams.get('select') ?? '', /cover_image_type|cover_image(?:,|$)/);
    }
  });
});
test('replacing a cover saves the new path before deleting the old file', async () => {
  await withStore(async (state, repository) => {
    await repository.save(bookId, { ...input, image });
    const newPath = state.rows.get(bookId)!.cover_image_path!;
    assert.notEqual(newPath, originalPath); assert.ok(state.files.has(newPath)); assert.equal(state.files.has(originalPath), false);
    const saveIndex = state.requests.findIndex(request => request.method === 'PATCH');
    const deleteIndex = state.requests.findIndex(request => request.method === 'DELETE');
    assert.ok(deleteIndex > saveIndex);
    const guard = new URL(state.requests[saveIndex].path, 'http://localhost').searchParams;
    assert.equal(guard.get('copies'), 'eq.1'); assert.equal(guard.get('cover_image_path'), 'eq.' + originalPath);
    assert.equal((await repository.image(bookId)).contentType, 'image/jpeg');
  });
});
test('a post-save availability refresh failure preserves the committed cover',async()=>{
 await withStore(async(state,repository)=>{
  state.catalogReadFailsAfterSave=true;
  const result=await repository.save(bookId,{...input,image});
  assert.equal(result.total,4);const newPath=state.rows.get(bookId)!.cover_image_path!;
  assert.notEqual(newPath,originalPath);assert.ok(state.files.has(newPath));
 });
});
test('an uncertain book save never deletes a cover that may already be committed',async()=>{
 await withStore(async(state,repository)=>{
  state.commitResponseLost=true;
  await assert.rejects(repository.save(bookId,{...input,image}),{status:503});
  const newPath=state.rows.get(bookId)!.cover_image_path!;
  assert.notEqual(newPath,originalPath);assert.ok(state.files.has(newPath));
  assert.equal(state.requests.filter(r=>r.method==='PATCH').length,1);
 });
});
test('failed create/edit and conflicting stock or cover changes clean up the new upload and preserve the original', async () => {
  await withStore(async (state, repository) => {
    state.saveFailed = true;
    for (const id of [null, bookId]) {
      await assert.rejects(repository.save(id, { ...input, image }), HttpError);
      assert.equal(state.files.size, 1); assert.ok(state.files.has(originalPath));
    }
    state.saveFailed = false;
    for (const flag of ['stockConflict', 'coverConflict'] as const) {
      state[flag] = true;
      await assert.rejects(repository.save(bookId, { ...input, image }), (error: unknown) => error instanceof HttpError && error.status === 409);
      assert.equal(state.files.size, 1); assert.equal(state.rows.get(bookId)?.cover_image_path, originalPath);
      state[flag] = false;
    }
    const count = state.requests.length;
    await assert.rejects(repository.save(bookId, { ...input, total: 0, image }), ValidationError);
    assert.equal(state.requests.slice(count).some(request => request.path.startsWith('/storage/')), false);
  });
});
test('missing buckets produce a readable setup error without saving a book', async () => {
  await withStore(async (state, repository) => {
    state.bucketMissing = true;
    await assert.rejects(repository.save(null, { ...input, image }), (error: unknown) => error instanceof HttpError && error.status === 503 && /book-covers bucket/.test(error.message));
    assert.equal(state.requests.some(request => request.path.startsWith('/rest/v1/books') && request.method === 'POST'), false);
  });
});
test('legacy books require uploads and missing bucket objects return a readable 404', async () => {
  await withStore(async (state, repository) => {
    state.files.delete(originalPath);
    await assert.rejects(repository.image(bookId), (error: unknown) => error instanceof HttpError && error.status === 404);
    state.rows.get(bookId)!.cover_image_path = null;
    assert.equal(await repository.hasImage(bookId), false);
    await assert.rejects(repository.image(bookId), (error: unknown) => error instanceof HttpError && error.status === 404);
    await assert.rejects(repository.save(bookId, input), ValidationError);
    await repository.save(bookId, { ...input, image });
    assert.equal(await repository.hasImage(bookId), true);
    const patch = state.requests.find(request => request.method === 'PATCH')!;
    assert.equal(new URL(patch.path, 'http://localhost').searchParams.get('cover_image_path'), 'is.null');
  });
});
test('cleanup errors after a successful replacement do not report the saved book as failed', async (t) => {
  t.mock.method(console, 'error', () => {});
  await withStore(async (state, repository) => {
    state.cleanupFailed = true;
    const saved = await repository.save(bookId, { ...input, image });
    assert.equal(saved.hasImage, true); assert.notEqual(state.rows.get(bookId)?.cover_image_path, originalPath);
    assert.ok(state.files.has(state.rows.get(bookId)!.cover_image_path!));
  });
});


test('catalog writes attribute actions to the authenticated staff member', async () => {
  await withStore(async (state, repository) => {
    const actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await repository.save(bookId, input, actor);
    const update = state.requests.find(request => request.method === 'PATCH' && request.path.startsWith('/rest/v1/books'))!;
    assert.equal(update.actor, actor);
    assert.equal('audit_actor_id' in update.body, false);
    await repository.archive(bookId, actor);
    const archived = state.requests.filter(request => request.method === 'PATCH' && request.path.startsWith('/rest/v1/books')).at(-1)!;
    assert.equal(archived.actor, actor);
    assert.equal('audit_request_id' in archived.body, false);
  });
});
