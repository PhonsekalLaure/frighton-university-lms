import type { AvailableBook, CirculationPolicy, LoanDetailsRecord, LoanRecord, PageResult, PatronRecord } from '../models/loan.js';
import type { BorrowInput, LoanFilters, Pagination } from '../types/loan.js';

export interface LoanRepository {
  getPolicy(): Promise<CirculationPolicy>;
  findPatron(studentNumber: string): Promise<PatronRecord | null>;
  getActiveLoans(studentId: string): Promise<Array<{ overdue_days: number }>>;
  listAvailableBooks(pagination: Pagination): Promise<PageResult<AvailableBook>>;
  listLoans(filters: LoanFilters): Promise<PageResult<LoanDetailsRecord>>;
  findLoan(id: string): Promise<LoanDetailsRecord | null>;
  borrow(input: BorrowInput, issuedBy: string): Promise<LoanRecord>;
  returnBook(id: string, returnedTo: string, fineCollected: boolean): Promise<LoanRecord>;
}
