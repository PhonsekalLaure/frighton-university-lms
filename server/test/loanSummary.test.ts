import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Loan } from '../../client/src/types/library.js';
import { toLoan } from '../../client/src/services/library.js';
import { daysRemaining, finesCollectedToday, groupLoansByStudent, paidFines, pendingFines } from '../../client/src/utils/loanSummary.js';

const loan: Loan = { id: '1', studentId: 'STU-1', student: 'Student One', bookId: 'book-1',
  bookTitle: 'History', bookAuthor: 'Author', borrowed: '2026-10-01T00:00:00Z', due: '2026-10-15',
  dailyPenaltyRate: 5, overdueDays: 2, fineAmount: 10 };

test('fine totals use payment dates in Manila and keep unpaid returns pending', () => {
  const loans = [loan,
    { ...loan, id: '2', returned: '2026-11-12T15:00:00Z', finePaidAt: '2026-11-12T16:30:00Z', fineAmount: 15 },
    { ...loan, id: '3', finePaidAt: '2026-11-13T16:00:00Z', fineAmount: 20 },
    { ...loan, id: '4', returned: '2026-11-13T00:00:00Z' },
    { ...loan, id: '5', fineAmount: 0 },
  ];
  assert.equal(finesCollectedToday(loans, '2026-11-13'), 15);
  assert.deepEqual(pendingFines(loans).map(item => item.id), ['1', '4']);
  assert.deepEqual(paidFines(loans).map(item => item.id), ['2', '3']);
});

test('remaining days handle month boundaries and groups use student IDs', () => {
  assert.equal(daysRemaining('2027-01-02', '2026-12-31'), 2);
  assert.equal(daysRemaining('2026-12-30', '2026-12-31'), 0);
  const groups = groupLoansByStudent([loan, { ...loan, id: '2' }, { ...loan, id: '3', studentId: 'STU-2' }]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map(group => group.loans.length), [2, 1]);
});

test('an unpaid return is never mapped as collected money', () => {
  const record = { id: '1', studentId: 'STU-1', bookId: 'book-1', borrowedAt: loan.borrowed,
    dueDate: loan.due, returnedAt: '2026-11-13T00:00:00Z', dailyPenaltyRate: 5,
    overdueDays: 2, fineAmount: 10, finePaidAt: null, receiptNumber: null };
  assert.equal(toLoan(record).finePaid, undefined);
  assert.equal(toLoan({ ...record, finePaidAt: '2026-11-13T00:00:00Z' }).finePaid, 10);
});
