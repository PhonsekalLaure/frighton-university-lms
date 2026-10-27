export type Page = 'dashboard' | 'books' | 'circulation' | 'borrowed' | 'reservations' | 'librarians';
export type StaffRole = 'Librarian' | 'Admin';
export type BookRecord = { hasImage?: boolean; id: string; title: string; author: string; category: string; year: number | null; available: number; total: number; shelf: string; active: boolean };
export type Loan = {
  id: string; studentId: string; student: string; bookId: string; bookTitle: string; bookAuthor: string;
  borrowed: string; due: string; returned?: string; finePaid?: number; receipt?: string;
  dailyPenaltyRate: number; overdueDays: number; fineAmount: number;
};
export type Reservation = { id: string; studentId: string; student: string; bookId: string; reserved: string; expires: string; status: 'Active' | 'Fulfilled' | 'Cancelled' | 'Expired' };
export type Staff = { name: string; email: string; active: boolean; since: string };
export type StudentRecord = { name: string; major: string; status: string };
export interface CirculationPolicy {
  timeZone: string; loanPeriodDays: number; maxActiveLoans: number;
  dailyPenaltyRate: number; today: string; dueDate: string;
}
export interface Patron {
  frightonId: string; name: string; program: string | null; department: string | null;
  academicStatus: string; canBorrow: boolean; blockedReason: string | null;
  activeLoanCount: number; overdueLoanCount: number; policy: CirculationPolicy;
}
