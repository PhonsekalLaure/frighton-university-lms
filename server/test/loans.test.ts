import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import express from 'express';
import { createApp } from '../src/app.js';
import { config } from '../src/config/env.js';
import { createLoanController } from '../src/controllers/loanController.js';
import type { LoanRepository } from '../src/interfaces/loanRepository.js';
import { errorHandler } from '../src/middlewares/errorHandler.js';
import type { LoanDetailsRecord, LoanRecord } from '../src/models/loan.js';
import { createLoanRouter } from '../src/routes/loanRoutes.js';
import { LoanService } from '../src/services/loanService.js';
import { databaseError } from '../src/utils/databaseError.js';
import { HttpError } from '../src/utils/httpError.js';
import { parseBorrowBody, parseLoanFilters, parseReturnBody } from '../src/validators/loanValidators.js';

const staffId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const bookId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const loanId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const studentId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const studentNumber = 'STU-2026-0001';
const loan: LoanRecord = {
  id: loanId, student_id: studentId, book_id: bookId, issued_by: staffId,
  borrow_date: '2026-10-22T00:00:00Z', due_date: '2026-11-05',
  return_date: null, returned_to: null, daily_penalty_rate: 5,
  overdue_days: 0, fine_amount: 0, fine_paid_at: null, receipt_number: null,
};
const details: LoanDetailsRecord = {
  ...loan, student_number: studentNumber, student_name: 'Mina Harker',
  book_title: 'Dracula', book_author: 'Bram Stoker',
};
const policy = {
  time_zone: 'Asia/Manila', loan_period_days: 14, max_active_loans: 3,
  daily_penalty_rate: 5, today: '2026-10-22', due_date: '2026-11-05',
};
const patron = {
  id: studentId, student_number: studentNumber, first_name: 'Mina', last_name: 'Harker',
  email: 'mina@example.test', program: 'Literature', department: 'Arts',
  academic_status: 'active', role: 'student', user: { is_active: true, role: 'Students' },
};
const sisStatus = {
  frightonId: studentNumber, name: 'Mina Harker', email: patron.email,
  role: 'student', academicStatus: 'active', department: 'Arts', canBorrow: true, activeHolds: [],
};

function repository(overrides: Partial<LoanRepository> = {}): LoanRepository {
  return {
    getPolicy: async () => policy,
    findPatron: async () => patron,
    getActiveLoans: async () => [],
    listAvailableBooks: async ({ page, pageSize }) => ({
      data: [{ id: bookId, title: 'Dracula', author: 'Bram Stoker', availableCopies: 1 }],
      total: 1, page, pageSize,
    }),
    listLoans: async ({ page, pageSize }) => ({ data: [details], total: 1, page, pageSize }),
    findLoan: async () => details,
    borrow: async () => loan,
    returnBook: async () => ({ ...loan, return_date: '2026-10-22T10:00:00Z', returned_to: staffId }),
    ...overrides,
  };
}

async function withServer(app: express.Express, run: (base: string) => Promise<void>) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await run(base);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function testApp(service: LoanService) {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.locals.librarian = { id: staffId };
    next();
  });
  app.use('/loans', createLoanRouter(createLoanController(service)));
  app.use(errorHandler);
  return app;
}

test('validates bodies and query values without coercing untrusted input', () => {
  assert.deepEqual(parseBorrowBody({ frightonId: ' stu-2026-0001 ', bookId }), { frightonId: studentNumber, bookId });
  for (const body of [null, [], {}, { frightonId: {}, bookId }, { frightonId: studentNumber, bookId: 1 }, { frightonId: '../admin', bookId }]) {
    assert.throws(() => parseBorrowBody(body), (error) => error instanceof HttpError && error.status === 400);
  }
  assert.deepEqual(parseReturnBody({}), { fineCollected: false });
  assert.deepEqual(parseReturnBody({ fineCollected: true }), { fineCollected: true });
  assert.throws(() => parseReturnBody({ fineCollected: 'true' }), HttpError);
  assert.deepEqual(parseLoanFilters({}), { status: 'active', page: 1, pageSize: 25 });
  for (const query of [{ pageSize: '101' }, { page: '0' }, { page: ['1', '2'] }, { status: 'overdue' }, { bookId: '1' }]) {
    assert.throws(() => parseLoanFilters(query), HttpError);
  }
});

test('eligibility blocks inactive, overdue, and max-loan students before checkout', async () => {
  for (const overrides of [
    { findPatron: async () => ({ ...patron, user: { ...patron.user, is_active: false } }) },
    { findPatron: async () => ({ ...patron, academic_status: 'suspended' }) },
    { getActiveLoans: async () => [{ overdue_days: 1 }] },
    { getActiveLoans: async () => Array.from({ length: 3 }, () => ({ overdue_days: 0 })) },
  ]) {
    let borrowed = false;
    const service = new LoanService(repository({
      ...overrides,
      borrow: async () => { borrowed = true; return loan; },
    }), async () => { throw new Error('SIS must not be called for a locally blocked patron'); });
    const result = await service.verifyPatron(studentNumber);
    assert.equal(result.canBorrow, false);
    assert.ok(result.blockedReason);
    await assert.rejects(service.borrow({ frightonId: studentNumber, bookId }, staffId), { status: 403 });
    assert.equal(borrowed, false);
  }
});

test('SIS holds, mismatched students, and SIS failures fail closed', async () => {
  for (const status of [{ ...sisStatus, canBorrow: false }, { ...sisStatus, frightonId: 'ANOTHER-STUDENT' }]) {
    const service = new LoanService(repository(), async () => status);
    await assert.rejects(service.borrow({ frightonId: studentNumber, bookId }, staffId), { status: 403 });
  }
  const service = new LoanService(repository(), async () => { throw new Error('upstream private details'); });
  await assert.rejects(service.verifyPatron(studentNumber), { status: 502 });
  assert.equal((await service.returnBook(loanId, staffId, false)).returnedTo, staffId);
});

test('missing local students and loans return 404', async () => {
  const service = new LoanService(repository({ findPatron: async () => null, findLoan: async () => null }));
  await assert.rejects(service.verifyPatron(studentNumber), { status: 404 });
  await assert.rejects(service.getLoan(loanId), { status: 404 });
});

test('HTTP checkout uses authenticated staff and database-owned dates and amounts', async () => {
  let actor = '';
  const service = new LoanService(repository({
    borrow: async (input, issuedBy) => {
      assert.deepEqual(input, { frightonId: studentNumber, bookId });
      actor = issuedBy;
      return loan;
    },
  }), async () => sisStatus);
  await withServer(testApp(service), async (base) => {
    const response = await fetch(base + '/loans/borrow', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frightonId: studentNumber, bookId, issuedBy: studentId, dueDate: '2099-01-01', fineAmount: 0 }),
    });
    assert.equal(response.status, 201);
    const data = await response.json();
    assert.equal(actor, staffId);
    assert.equal(data.loan.dueDate, policy.due_date);
    assert.equal(data.loan.issuedBy, staffId);
  });
});

test('HTTP reads expose database fine quotes, paginated loans, and available books', async () => {
  const overdue = { ...details, overdue_days: 2, fine_amount: 10 };
  const service = new LoanService(repository({ findLoan: async () => overdue }), async () => sisStatus);
  await withServer(testApp(service), async (base) => {
    const quote = await fetch(base + '/loans/' + loanId);
    assert.equal(quote.status, 200);
    const quoted = await quote.json();
    assert.equal(quoted.overdueDays, 2);
    assert.equal(quoted.fineAmount, 10);
    assert.equal(quoted.studentNumber, studentNumber);
    const books = await fetch(base + '/loans/available-books?pageSize=10');
    assert.equal(books.status, 200);
    assert.equal((await books.json()).data[0].id, bookId);
    const loans = await fetch(base + '/loans?status=returned&page=2');
    assert.equal(loans.status, 200);
    assert.equal((await loans.json()).page, 2);
    const rules = await fetch(base + '/loans/policy');
    assert.equal((await rules.json()).timeZone, 'Asia/Manila');
  });
});

test('HTTP returns require fine confirmation and preserve database receipts', async () => {
  let returnedTo = '';
  const service = new LoanService(repository({
    returnBook: async (_id, actor, collected) => {
      if (!collected) throw new HttpError(409, 'Confirm fine collection before returning this overdue book.');
      returnedTo = actor;
      return {
        ...loan, return_date: '2026-10-22T10:00:00Z', returned_to: actor,
        overdue_days: 2, fine_amount: 10, fine_paid_at: '2026-10-22T10:00:00Z',
        receipt_number: 'RCP-20261022-1234ABCD',
      };
    },
  }));
  await withServer(testApp(service), async (base) => {
    for (const [body, expected] of [[{}, 409], [{ fineCollected: 'true' }, 400], [{ fineCollected: true, returnedTo: studentId }, 200]] as const) {
      const response = await fetch(base + '/loans/' + loanId + '/return', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      assert.equal(response.status, expected);
      if (expected === 200) {
        const data = await response.json();
        assert.equal(returnedTo, staffId);
        assert.equal(data.loan.receiptNumber, 'RCP-20261022-1234ABCD');
        assert.equal(data.loan.fineAmount, 10);
      }
    }
  });
});

test('database conflicts are mapped and internal database messages are hidden', () => {
  assert.equal(databaseError({ code: 'PT409', message: 'No copies are available.' }).status, 409);
  assert.equal(databaseError({ code: 'PT404', message: 'Loan was not found.' }).status, 404);
  assert.equal(databaseError({ code: '23505', message: 'private constraint details' }).status, 409);
  assert.equal(databaseError({ code: '40P01', message: 'deadlock detected' }).status, 409);
  const unavailable = databaseError({ code: '42703', message: 'private schema details' });
  assert.equal(unavailable.status, 503);
  assert.doesNotMatch(unavailable.message, /private schema/);
});

test('HTTP rejects invalid identifiers and malformed JSON', async () => {
  await withServer(testApp(new LoanService(repository())), async (base) => {
    assert.equal((await fetch(base + '/loans/LN-1000')).status, 400);
    assert.equal((await fetch(base + '/loans?pageSize=999')).status, 400);
    const response = await fetch(base + '/loans/borrow', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
    });
    assert.equal(response.status, 400);
  });
});

test('application guards all circulation endpoints and rejects untrusted mutation origins', async () => {
  await withServer(createApp(), async (base) => {
    for (const path of ['', '/policy', '/available-books', '/verify-patron/' + studentNumber, '/' + loanId]) {
      assert.equal((await fetch(base + '/api/v1/loans' + path)).status, 401);
    }
    for (const path of ['/borrow', '/' + loanId + '/return']) {
      const response = await fetch(base + '/api/v1/loans' + path, {
        method: 'POST', headers: { Origin: config.clientUrl, 'Content-Type': 'application/json' }, body: '{}',
      });
      assert.equal(response.status, 401);
    }
    const rejected = await fetch(base + '/api/v1/loans/borrow', {
      method: 'POST', headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' }, body: '{}',
    });
    assert.equal(rejected.status, 403);
  });
});
