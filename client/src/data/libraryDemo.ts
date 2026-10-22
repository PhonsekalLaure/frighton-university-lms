import { books } from './books';
import type { BookRecord, Loan, Reservation } from '../types/library';
import { dateISO, daysLate, todayISO } from '../utils/library';

// Sample records exist only in this browser tab. No API or database calls.
export const demoBooks: BookRecord[] = books.map((book) => ({
  id: 'demo-book-' + book.id, title: book.title, author: book.author,
  category: book.category, year: book.year, available: book.copies,
  total: book.totalCopies, shelf: book.shelf, active: true,
}));
export const demoStudents: Record<string, string> = {
  'STU-2026-0001': 'Maya Chen',
  'STU-2026-0002': 'Elias Navarro',
  'STU-2026-0003': 'Sofia Reyes',
  'STU-2026-0004': 'Noah Santiago',
};
export function demoDate(offset: number): string {
  const date = new Date(todayISO() + 'T12:00:00+08:00');
  date.setUTCDate(date.getUTCDate() + offset);
  return dateISO(date);
}
const makeLoan = (id: string, studentId: string, bookId: string, borrowed: string, due: string): Loan => {
  const book = demoBooks.find((item) => item.id === bookId)!;
  return { id, studentId, student: demoStudents[studentId], bookId,
    bookTitle: book.title, bookAuthor: book.author, borrowed, due,
    dailyPenaltyRate: 5, overdueDays: daysLate(due), fineAmount: daysLate(due) * 5 };
};
const loans: Loan[] = [
  makeLoan('DEMO-LN-1048', 'STU-2026-0004', 'demo-book-2', demoDate(-21), demoDate(-7)),
  makeLoan('DEMO-LN-1052', 'STU-2026-0002', 'demo-book-7', demoDate(-14), demoDate(0)),
  makeLoan('DEMO-LN-1057', 'STU-2026-0001', 'demo-book-4', demoDate(-10), demoDate(4)),
  makeLoan('DEMO-LN-1061', 'STU-2026-0003', 'demo-book-1', demoDate(-7), demoDate(7)),
  { ...makeLoan('DEMO-LN-1040', 'STU-2026-0001', 'demo-book-5', demoDate(-25), demoDate(-11)),
    returned: demoDate(-12), overdueDays: 0, fineAmount: 0, finePaid: 0 },
];
const reservations: Reservation[] = [
  { id: 'DEMO-RS-1', studentId: 'STU-2026-0001', student: 'Maya Chen', bookId: 'demo-book-1',
    reserved: todayISO(), expires: demoDate(3) + 'T12:00:00+08:00', status: 'Active' },
];
export async function getDemoLoans(): Promise<Loan[]> {
  return loans.map((loan) => loan.returned ? { ...loan } : {
    ...loan, overdueDays: daysLate(loan.due), fineAmount: daysLate(loan.due) * loan.dailyPenaltyRate,
  });
}
export async function returnDemoLoan(id: string): Promise<void> {
  const loan = loans.find((item) => item.id === id && !item.returned);
  if (!loan) throw new Error('Choose an active demo loan.');
  loan.overdueDays = daysLate(loan.due);
  loan.fineAmount = loan.overdueDays * loan.dailyPenaltyRate;
  loan.returned = todayISO();
  loan.finePaid = loan.fineAmount;
  if (loan.fineAmount) loan.receipt = 'DEMO-RCP-' + crypto.randomUUID().slice(0, 8);
  const book = demoBooks.find((item) => item.id === loan.bookId);
  if (book) book.available = Math.min(book.total, book.available + 1);
}
export function getDemoReservations(): Reservation[] {
  for (const item of reservations) {
    if (item.status === 'Active' && Date.parse(item.expires) <= Date.now()) item.status = 'Expired';
  }
  return reservations.map((item) => ({ ...item }));
}
export function createDemoReservation(studentId: string, bookId: string): void {
  studentId = studentId.trim().toUpperCase();
  const student = demoStudents[studentId];
  if (!student || !demoBooks.some((book) => book.id === bookId && book.active)) {
    throw new Error('Choose a demo title and a student ID from STU-2026-0001 through STU-2026-0004.');
  }
  if (getDemoReservations().some((item) => item.studentId === studentId && item.bookId === bookId && item.status === 'Active')) {
    throw new Error('This demo student already has an active reservation for that title.');
  }
  reservations.unshift({ id: 'DEMO-RS-' + crypto.randomUUID(), studentId, student, bookId,
    reserved: todayISO(), expires: demoDate(3) + 'T12:00:00+08:00', status: 'Active' });
}
function activeReservation(id: string): Reservation {
  getDemoReservations();
  const item = reservations.find((record) => record.id === id && record.status === 'Active');
  if (!item) throw new Error('Active demo reservation was not found.');
  return item;
}
export function cancelDemoReservation(id: string): void {
  activeReservation(id).status = 'Cancelled';
}
export function borrowDemoReservation(id: string): void {
  const reservation = activeReservation(id);
  const book = demoBooks.find((item) => item.id === reservation.bookId);
  if (!book || book.available < 1) throw new Error('No demo copies are available for this title.');
  loans.unshift(makeLoan('DEMO-LN-' + crypto.randomUUID(), reservation.studentId, book.id, todayISO(), demoDate(14)));
  book.available -= 1;
  reservation.status = 'Fulfilled';
}
