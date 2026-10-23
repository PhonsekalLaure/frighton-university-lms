import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import express from 'express';
import { createApp } from '../src/app.js';
import { config } from '../src/config/env.js';
import { createReservationController } from '../src/controllers/reservationController.js';
import type { ReservationRepository } from '../src/interfaces/reservationRepository.js';
import { errorHandler } from '../src/middlewares/errorHandler.js';
import type { ReservationRecord, ReservationStudentRecord } from '../src/models/reservation.js';
import { createReservationRouter } from '../src/routes/reservationRoutes.js';
import { ReservationService } from '../src/services/reservationService.js';
import { HttpError } from '../src/utils/httpError.js';
import { parseCreateReservationBody, parseReservationFilters, parseReservationStudentSearch } from '../src/validators/reservationValidators.js';

const staffId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const bookId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const reservationId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const studentNumber = 'STU-2026-0001';
const reservation: ReservationRecord = {
  id: reservationId, status: 'active', reserved_at: '2026-10-23T01:00:00Z', expires_at: '2026-10-26T01:00:00Z',
  student_number: studentNumber, student_name: 'Mina Harker', book_id: bookId,
  book_title: 'Dracula', book_author: 'Bram Stoker', available_copies: 1,
};
const student: ReservationStudentRecord = {
  student_number: studentNumber, student_name: 'Mina Harker', program: 'Literature',
};

function repository(overrides: Partial<ReservationRepository> = {}): ReservationRepository {
  return {
    searchStudents: async () => [student],
    list: async ({ page, pageSize }) => ({ data: [reservation], total: 1, page, pageSize }),
    create: async () => reservation,
    cancel: async () => ({ ...reservation, status: 'cancelled' }),
    ...overrides,
  };
}

async function withServer(app: express.Express, run: (base: string) => Promise<void>) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function testApp(service: ReservationService) {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => { res.locals.librarian = { id: staffId }; next(); });
  app.use('/reservations', createReservationRouter(createReservationController(service)));
  app.use(errorHandler);
  return app;
}

test('reservation validation accepts supported filters and rejects malformed input', () => {
  assert.equal(parseReservationStudentSearch({ q: '  Mina  ' }), 'Mina');
  assert.deepEqual(parseReservationFilters({}), { status: 'all', page: 1, pageSize: 25 });
  assert.deepEqual(parseReservationFilters({ status: 'active', page: '2' }), { status: 'active', page: 2, pageSize: 25 });
  assert.deepEqual(parseCreateReservationBody({ frightonId: ' stu-2026-0001 ', bookId }), { frightonId: studentNumber, bookId });
  for (const query of [{ status: 'pending' }, { status: ['active'] }, { pageSize: '101' }]) {
    assert.throws(() => parseReservationFilters(query), HttpError);
  }
  for (const query of [{}, { q: 'a' }, { q: ['Mina'] }, { q: '%_' }, { q: 'x'.repeat(51) }]) {
    assert.throws(() => parseReservationStudentSearch(query), HttpError);
  }
  for (const body of [null, [], {}, { frightonId: '../admin', bookId }, { frightonId: studentNumber, bookId: '1' }]) {
    assert.throws(() => parseCreateReservationBody(body), HttpError);
  }
});

test('reservation creation fails closed when patron eligibility is blocked or unavailable', async () => {
  let created = false;
  const blocked = new ReservationService(repository({ create: async () => { created = true; return reservation; } }), async () => ({
    canBorrow: false, blockedReason: 'This student has overdue items.',
  }));
  await assert.rejects(blocked.create({ frightonId: studentNumber, bookId }, staffId), { status: 403 });
  assert.equal(created, false);

  const unavailable = new ReservationService(repository(), async () => { throw new HttpError(502, 'Student standing could not be verified.'); });
  await assert.rejects(unavailable.create({ frightonId: studentNumber, bookId }, staffId), { status: 502 });
});

test('reservation HTTP endpoints use authenticated staff and serialize database records', async () => {
  let createActor = '';
  let cancelActor = '';
  const service = new ReservationService(repository({
    searchStudents: async (query) => { assert.equal(query, 'Mina'); return [student]; },
    create: async (input, actor) => { assert.deepEqual(input, { frightonId: studentNumber, bookId }); createActor = actor; return reservation; },
    cancel: async (id, actor) => { assert.equal(id, reservationId); cancelActor = actor; return { ...reservation, status: 'cancelled' }; },
  }), async () => ({ canBorrow: true, blockedReason: null }));

  await withServer(testApp(service), async (base) => {
    const students = await fetch(base + '/reservations/students?q=Mina');
    assert.equal(students.status, 200);
    assert.deepEqual(await students.json(), [{ studentNumber, name: 'Mina Harker', program: 'Literature' }]);
    assert.equal((await fetch(base + '/reservations/students?q=%25_')).status, 400);

    const list = await fetch(base + '/reservations?status=active&pageSize=10');
    assert.equal(list.status, 200);
    assert.equal((await list.json()).data[0].studentNumber, studentNumber);

    const created = await fetch(base + '/reservations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frightonId: studentNumber, bookId, reservedBy: reservationId }),
    });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).book.id, bookId);
    assert.equal(createActor, staffId);

    const cancelled = await fetch(base + '/reservations/' + reservationId + '/cancel', { method: 'POST' });
    assert.equal(cancelled.status, 200);
    assert.equal((await cancelled.json()).status, 'cancelled');
    assert.equal(cancelActor, staffId);
  });
});

test('application guards every reservation endpoint and rejects untrusted mutation origins', async () => {
  await withServer(createApp(), async (base) => {
    assert.equal((await fetch(base + '/api/v1/reservations')).status, 401);
    assert.equal((await fetch(base + '/api/v1/reservations/students?q=Mina')).status, 401);
    for (const path of ['', '/' + reservationId + '/cancel']) {
      const response = await fetch(base + '/api/v1/reservations' + path, {
        method: 'POST', headers: { Origin: config.clientUrl, 'Content-Type': 'application/json' }, body: '{}',
      });
      assert.equal(response.status, 401);
    }
    const rejected = await fetch(base + '/api/v1/reservations', {
      method: 'POST', headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' }, body: '{}',
    });
    assert.equal(rejected.status, 403);
  });
});
