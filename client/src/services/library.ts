import { apiRequest, getAllPages } from './api';
import type { BookRecord, CirculationPolicy, Loan, Patron } from '../types/library';

export interface LoanResponse {
  id: string; studentId: string; studentNumber?: string | null; studentName?: string;
  bookId: string | null; bookTitle?: string | null; bookAuthor?: string | null;
  borrowedAt: string; dueDate: string; returnedAt: string | null;
  dailyPenaltyRate: number; overdueDays: number; fineAmount: number;
  finePaidAt: string | null; receiptNumber: string | null;
}

export function toLoan(record: LoanResponse): Loan {
  return {
    id: record.id, studentId: record.studentNumber ?? record.studentId,
    student: record.studentName ?? '', bookId: record.bookId ?? '',
    bookTitle: record.bookTitle ?? '', bookAuthor: record.bookAuthor ?? '',
    borrowed: record.borrowedAt, due: record.dueDate, returned: record.returnedAt ?? undefined,
    finePaid: record.returnedAt ? record.fineAmount : undefined, receipt: record.receiptNumber ?? undefined,
    dailyPenaltyRate: record.dailyPenaltyRate, overdueDays: record.overdueDays, fineAmount: record.fineAmount,
  };
}

export const getBooks = (signal?: AbortSignal) => getAllPages<BookRecord>('/v1/books', signal);
export async function getLoans(signal?: AbortSignal): Promise<Loan[]> {
  return (await getAllPages<LoanResponse>('/v1/loans?status=all', signal)).map(toLoan);
}
export const getPolicy = (signal?: AbortSignal) => apiRequest<CirculationPolicy>('/v1/loans/policy', { signal });
export const verifyPatron = (id: string, signal?: AbortSignal) =>
  apiRequest<Patron>('/v1/loans/verify-patron/' + encodeURIComponent(id.trim().toUpperCase()), { signal });
export type BookInput = Pick<BookRecord, 'title' | 'author' | 'category' | 'total' | 'shelf'> & { year: number; image?: string };
export const saveBook = (id: string | null, book: BookInput) => apiRequest<BookRecord>(
  id ? '/v1/books/' + encodeURIComponent(id) : '/v1/books',
  { method: id ? 'PUT' : 'POST', body: JSON.stringify(book) },
);
export const archiveBook = (id: string) =>
  apiRequest<BookRecord>('/v1/books/' + encodeURIComponent(id) + '/archive', { method: 'POST', body: '{}' });
export async function borrowBook(frightonId: string, bookId: string): Promise<{ loan: LoanResponse }> {
  const response = await apiRequest<{ loan: LoanResponse }>('/v1/loans/borrow', {
    method: 'POST', body: JSON.stringify({ frightonId, bookId }),
  });
  if (!response?.loan?.id || response.loan.bookId !== bookId || !response.loan.dueDate || !response.loan.borrowedAt) {
    throw new Error('Checkout could not be confirmed. Check active borrowers before trying again.');
  }
  return response;
}
export const getLoan = (id: string, signal?: AbortSignal) =>
  apiRequest<LoanResponse>('/v1/loans/' + encodeURIComponent(id), { signal });
export const returnBook = (id: string, fineCollected: boolean) =>
  apiRequest<{ loan: LoanResponse }>('/v1/loans/' + encodeURIComponent(id) + '/return', {
    method: 'POST', body: JSON.stringify({ fineCollected }),
  });

