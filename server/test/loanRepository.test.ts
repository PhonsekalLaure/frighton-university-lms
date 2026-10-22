import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { createLoanRepository } from '../src/repositories/loanRepository.js';

test('repository uses singular RPC responses, validated parameters, and bounded database queries', async () => {
  const requests: Array<{ path: string; accept: string | undefined; body: Record<string, unknown> }> = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({ path: req.url ?? '', accept: req.headers.accept, body: body ? JSON.parse(body) : {} });
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname.endsWith('/rpc/circulation_policy')) {
      res.end(JSON.stringify({ time_zone: 'Asia/Manila', max_active_loans: 3, loan_period_days: 14, daily_penalty_rate: 5, today: '2026-10-22', due_date: '2026-11-05' }));
    } else if (url.pathname.endsWith('/rpc/borrow_book') || url.pathname.endsWith('/rpc/return_book')) {
      res.end(JSON.stringify({ id: 'loan-result', fine_amount: 10 }));
    } else if (url.pathname.endsWith('/profiles')) {
      res.end(JSON.stringify({ id: 'student-result', student_number: 'STU-2026-0001', user: { is_active: true, role: 'Students' } }));
    } else if (url.pathname.endsWith('/books')) {
      res.setHeader('Content-Range', '0-0/1');
      res.end(JSON.stringify([{ books_id: 'book-result', title: 'Dracula', author: 'Bram Stoker', copies: 1 }]));
    } else if (url.pathname.endsWith('/circulation_loans')) {
      if (url.searchParams.has('id')) {
        res.end(JSON.stringify({ id: 'loan-result' }));
      } else {
        res.setHeader('Content-Range', '0-0/1');
        res.end(JSON.stringify([{ id: 'loan-result', overdue_days: 2 }]));
      }
    } else {
      res.statusCode = 404;
      res.end('{}');
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const client = createClient(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, 'test-key', {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const repository = createLoanRepository(() => client);
    assert.equal((await repository.getPolicy()).max_active_loans, 3);
    const input = { frightonId: 'STU-2026-0001', bookId: 'book-id' };
    assert.equal((await repository.borrow(input, 'staff-id')).id, 'loan-result');
    assert.equal((await repository.returnBook('loan-id', 'staff-id', true)).fine_amount, 10);
    assert.equal((await repository.findPatron(input.frightonId))?.id, 'student-result');
    assert.equal((await repository.getActiveLoans('student-id'))[0].overdue_days, 2);
    const books = await repository.listAvailableBooks({ page: 1, pageSize: 10 });
    assert.equal(books.total, 1);
    assert.deepEqual(books.data[0], { id: 'book-result', title: 'Dracula', author: 'Bram Stoker', availableCopies: 1 });
    await repository.listLoans({ status: 'active', studentNumber: input.frightonId, bookId: input.bookId, page: 2, pageSize: 10 });
    assert.equal((await repository.findLoan('loan-id'))?.id, 'loan-result');

    assert.equal(requests[0].accept, 'application/vnd.pgrst.object+json');
    assert.deepEqual(requests[1].body, { p_student_number: input.frightonId, p_book_id: input.bookId, p_issued_by: 'staff-id' });
    assert.equal(requests[1].accept, 'application/vnd.pgrst.object+json');
    assert.deepEqual(requests[2].body, { p_borrow_id: 'loan-id', p_returned_to: 'staff-id', p_fine_collected: true });
    const loanQuery = new URL(requests[6].path, 'http://localhost');
    assert.equal(loanQuery.searchParams.get('return_date'), 'is.null');
    assert.equal(loanQuery.searchParams.get('student_number'), 'eq.STU-2026-0001');
    assert.equal(loanQuery.searchParams.get('offset'), '10');
    assert.equal(loanQuery.searchParams.get('limit'), '10');
    assert.equal(loanQuery.searchParams.get('book_id'), 'eq.book-id');
    assert.match(requests[3].path, /profiles/);
    assert.doesNotMatch(requests[3].path, /password/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
