import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../config/supabase.js';
import type { LoanRepository } from '../interfaces/loanRepository.js';
import type { CirculationPolicy, LoanDetailsRecord, LoanRecord, PatronRecord } from '../models/loan.js';
import { databaseError } from '../utils/databaseError.js';
import { HttpError } from '../utils/httpError.js';

const loanColumns = 'id,student_id,book_id,issued_by,borrow_date,due_date,return_date,returned_to,daily_penalty_rate,overdue_days,fine_amount,fine_paid_at,receipt_number,student_number,student_name,book_title,book_author';

export function createLoanRepository(getClient: () => SupabaseClient = getSupabaseAdmin): LoanRepository {
  return {
    async getPolicy() {
      const { data, error } = await getClient().rpc('circulation_policy').single<CirculationPolicy>();
      if (error) throw databaseError(error);
      if (!data) throw new HttpError(503, 'Circulation policy is unavailable.');
      return data;
    },

    async findPatron(studentNumber) {
      const { data, error } = await getClient()
        .from('profiles')
        .select('id,student_number,first_name,last_name,email,program,department,academic_status,role,user:users!profiles_id_fkey(is_active,role)')
        .eq('student_number', studentNumber)
        .eq('role', 'student')
        .maybeSingle<PatronRecord>();
      if (error) throw databaseError(error);
      return data;
    },

    async getActiveLoans(studentId) {
      const { data, error } = await getClient()
        .from('circulation_loans')
        .select('overdue_days')
        .eq('student_id', studentId)
        .is('return_date', null);
      if (error) throw databaseError(error);
      return data ?? [];
    },

    async listAvailableBooks({ page, pageSize }) {
      const { data, error, count } = await getClient()
        .from('books')
        .select('books_id,title,author,copies', { count: 'exact' })
        .eq('is_active', true)
        .gt('copies', 0)
        .order('title')
        .order('books_id')
        .range((page - 1) * pageSize, page * pageSize - 1);
      if (error) throw databaseError(error);
      return {
        data: (data ?? []).map((book) => ({
          id: book.books_id, title: book.title, author: book.author, availableCopies: book.copies,
        })),
        total: count ?? 0, page, pageSize,
      };
    },

    async listLoans({ status, studentNumber, bookId, page, pageSize }) {
      let query = getClient().from('circulation_loans').select(loanColumns, { count: 'exact' });
      if (status === 'active') query = query.is('return_date', null);
      if (status === 'returned') query = query.not('return_date', 'is', null);
      if (studentNumber) query = query.eq('student_number', studentNumber);
      if (bookId) query = query.eq('book_id', bookId);
      const { data, error, count } = await query
        .order('borrow_date', { ascending: false })
        .order('id')
        .range((page - 1) * pageSize, page * pageSize - 1)
        .returns<LoanDetailsRecord[]>();
      if (error) throw databaseError(error);
      return { data: data ?? [], total: count ?? 0, page, pageSize };
    },

    async findLoan(id) {
      const { data, error } = await getClient()
        .from('circulation_loans')
        .select(loanColumns)
        .eq('id', id)
        .maybeSingle<LoanDetailsRecord>();
      if (error) throw databaseError(error);
      return data;
    },

    async borrow(input, issuedBy) {
      const { data, error } = await getClient().rpc('borrow_book', {
        p_student_number: input.frightonId, p_book_id: input.bookId, p_issued_by: issuedBy,
      }).single<LoanRecord>();
      if (error) throw databaseError(error);
      if (!data) throw new HttpError(503, 'The checkout result is unavailable. Check active loans before retrying.');
      return data;
    },

    async returnBook(id, returnedTo, fineCollected) {
      const { data, error } = await getClient().rpc('return_book', {
        p_borrow_id: id, p_returned_to: returnedTo, p_fine_collected: fineCollected,
      }).single<LoanRecord>();
      if (error) throw databaseError(error);
      if (!data) throw new HttpError(503, 'The return result is unavailable. Check loan history before retrying.');
      return data;
    },
  };
}

export const loanRepository = createLoanRepository();
