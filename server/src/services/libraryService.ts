import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { bookRepository } from '../repositories/bookRepository.js';
import { databaseError } from '../utils/databaseError.js';
import { HttpError } from '../utils/httpError.js';
import { LoanService } from './loanService.js';

export interface DebtSnapshot {
  studentNumber: string;
  version: number;
  qualifyingDebtCount: number;
  amount: number;
  currency: 'PHP';
  reason: string;
}
export function isDebtSnapshot(value: unknown, number: string): value is DebtSnapshot {
  const d = value as DebtSnapshot | null;
  return (
    !!d &&
    d.studentNumber === number &&
    Number.isSafeInteger(d.version) &&
    d.version > 0 &&
    Number.isSafeInteger(d.qualifyingDebtCount) &&
    d.qualifyingDebtCount >= 0 &&
    Number.isFinite(d.amount) &&
    d.amount >= 0 &&
    (d.qualifyingDebtCount > 0 || d.amount === 0) &&
    d.currency === 'PHP' &&
    typeof d.reason === 'string' &&
    d.reason.length <= 1000
  );
}
function checked<T>(result: { data: T; error: { message: string; code?: string } | null }): T {
  if (result.error) throw databaseError(result.error);
  return result.data;
}
async function allRows(query: () => any) {
  const data: any[] = [];
  for (let offset = 0; ; offset += 500) {
    const rows = checked<any[]>(await query().range(offset, offset + 499)) ?? [];
    data.push(...rows);
    if (rows.length < 500) return { data, error: null };
  }
}
const bookSummary = (r: any) => ({
  id: r.book_id ?? null,
  title: r.book_title ?? 'Unavailable library item',
  authors: r.book_author ? [r.book_author] : [],
  coverUrl: r.book_id ? `/service/v1/books/${r.book_id}/cover` : null,
});
export function publicReservation(r: any) {
  return {
    id: r.id,
    status: r.status === 'active' ? 'ready_for_pickup' : r.status,
    createdAt: r.reserved_at,
    expiresAt: r.expires_at,
    pickupLocation: 'Main Library',
    book: bookSummary(r),
  };
}

export class LibraryService {
  constructor(
    private readonly client: () => SupabaseClient = getSupabaseAdmin,
    private readonly verify = (number: string) => new LoanService().verifyPatron(number),
    private readonly cover = (id: string) => bookRepository.image(id),
  ) {}

  async books(q: string, page: number, pageSize: number) {
    let query = this.client().from('catalog_books').select('*', { count: 'exact' }).eq('active', true);
    if (q) {
      const term = q.replace(/[\\%_]/g, '\\$&');
      query = query.or(`title.ilike.%${term}%,author.ilike.%${term}%`);
    }
    const result = await query
      .order('title')
      .order('id')
      .range((page - 1) * pageSize, page * pageSize - 1);
    const rows = checked(result) ?? [];
    return {
      items: rows.map((b: any) => ({
        id: b.id,
        title: b.title,
        authors: [b.author],
        isbn: null,
        coverUrl: `/service/v1/books/${b.id}/cover`,
        availableCopies: b.available,
        totalCopies: Number(b.total),
        reservable: b.available > 0,
      })),
      page,
      pageSize,
      total: result.count ?? 0,
    };
  }
  async image(id: string) {
    const book = checked(
      await this.client()
        .from('books')
        .select('books_id')
        .eq('books_id', id)
        .eq('is_active', true)
        .maybeSingle(),
    );
    if (!book) throw new HttpError(404, 'Book was not found.');
    return this.cover(id);
  }
  private async student(number: string) {
    const row = checked(
      await this.client()
        .from('profiles')
        .select('id')
        .eq('student_number', number)
        .eq('role', 'student')
        .maybeSingle(),
    );
    if (!row) throw new HttpError(404, 'Student was not found.');
    return row.id as string;
  }
  async debt(number: string): Promise<DebtSnapshot> {
    const student = await this.student(number);
    const snapshot = checked(await this.client().rpc('refresh_library_debt', { p_student_id: student }));
    if (!isDebtSnapshot(snapshot, number))
      throw new HttpError(503, 'Library debt is temporarily unavailable.');
    return snapshot;
  }
  async account(number: string) {
    const id = await this.student(number);
    const [reservations, loans, charges] = await Promise.all([
      allRows(() =>
        this.client()
          .from('circulation_reservations')
          .select('*')
          .eq('student_number', number)
          .eq('status', 'active')
          .gt('expires_at', new Date().toISOString())
          .order('reserved_at')
          .order('id'),
      ),
      allRows(() =>
        this.client()
          .from('circulation_loans')
          .select('*')
          .eq('student_id', id)
          .or('return_date.is.null,and(fine_paid_at.is.null,fine_amount.gt.0)')
          .order('borrow_date')
          .order('id'),
      ),
      allRows(() =>
        this.client()
          .from('library_replacement_charges')
          .select('*')
          .eq('student_id', id)
          .is('settled_at', null)
          .order('assessed_at')
          .order('id'),
      ),
    ]);
    const allLoans = checked(loans) ?? [];
    return {
      reservations: (checked(reservations) ?? []).map(publicReservation),
      loans: allLoans
        .filter((l: any) => !l.return_date)
        .map((l: any) => ({
          id: l.id,
          borrowedAt: l.borrow_date,
          dueAt: `${l.due_date}T23:59:59+08:00`,
          overdueDays: l.overdue_days,
          book: bookSummary(l),
        })),
      unpaidFines: [
        ...allLoans
          .filter((l: any) => Number(l.fine_amount) > 0 && !l.fine_paid_at)
          .map((l: any) => ({
            id: `overdue:${l.id}`,
            amount: Number(l.fine_amount),
            currency: 'PHP',
            reason: l.return_date ? 'Unpaid overdue fine' : 'Accruing overdue fine',
            kind: l.return_date ? 'overdue_assessed' : 'overdue_accrual',
            assessedAt: l.return_date,
            calculatedAt: new Date().toISOString(),
          })),
        ...(checked(charges) ?? []).map((c: any) => ({
          id: c.id,
          amount: Number(c.amount),
          currency: 'PHP',
          reason: c.reason,
          kind: 'replacement',
          assessedAt: c.assessed_at,
        })),
      ],
    };
  }
  async reserve(number: string, bookId: string) {
    const patron = await this.verify(number);
    if (!patron.canBorrow) throw new HttpError(403, patron.blockedReason ?? 'This student cannot reserve.');
    const row = checked(
      await this.client()
        .rpc('create_self_service_reservation', { p_student_number: number, p_book_id: bookId })
        .retry(false)
        .single(),
    );
    if (!row)
      throw new HttpError(503, 'Reservation outcome is unknown. Reload your account before trying again.');
    const result = checked(
      await this.client()
        .from('circulation_reservations')
        .select('*')
        .eq('id', (row as any).id)
        .single(),
    );
    if (!result)
      throw new HttpError(503, 'Reservation outcome is unknown. Reload your account before trying again.');
    return publicReservation(result);
  }
  async cancel(number: string, id: string) {
    checked(
      await this.client()
        .rpc('cancel_self_service_reservation', {
          p_student_number: number,
          p_reservation_id: id,
        })
        .retry(false),
    );
  }
  async charges(number: string) {
    const id = await this.student(number);
    return checked(
      await this.client()
        .from('library_replacement_charges')
        .select('*')
        .eq('student_id', id)
        .order('assessed_at', { ascending: false }),
    );
  }
  async assess(number: string, reason: string, amount: number, loanId: string | null, actor: string) {
    return checked(
      await this.client()
        .rpc('record_library_replacement', {
          p_student_number: number,
          p_reason: reason,
          p_amount: amount,
          p_loan_id: loanId,
          p_actor: actor,
        })
        .retry(false)
        .single(),
    );
  }
  async settle(id: string, reference: string, actor: string) {
    return checked(
      await this.client()
        .rpc('settle_library_replacement', { p_id: id, p_reference: reference, p_actor: actor })
        .retry(false)
        .single(),
    );
  }
}
