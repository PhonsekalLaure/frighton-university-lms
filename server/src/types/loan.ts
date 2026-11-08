export type LoanStatus = 'active' | 'returned' | 'all';

export interface Pagination {
  page: number;
  pageSize: number;
}

export interface LoanFilters extends Pagination {
  status: LoanStatus;
  studentNumber?: string;
  bookId?: string;
}

export interface BorrowInput {
  studentNumber: string;
  bookId: string;
}

export interface ReturnInput {
  fineCollected: boolean;
}

export interface ReportOverdueInput {
  studentNumber: string;
  bookTitle: string;
  fineAmount: number;
}
