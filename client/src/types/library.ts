export type Page = 'dashboard' | 'books' | 'circulation' | 'borrowed' | 'reservations' | 'librarians' | 'audit' | 'fines' | 'profile';
export type StaffRole = 'Librarian' | 'Admin';
export type BookRecord = { hasImage?: boolean; id: string; title: string; author: string; category: string; publisher?: string | null; description?: string | null; year: number | null; available: number; total: number; shelf: string; active: boolean };
export type Loan = {
  id: string; studentId: string; student: string; bookId: string; bookTitle: string; bookAuthor: string;
  borrowed: string; due: string; returned?: string; finePaid?: number; finePaidAt?: string; receipt?: string;
  dailyPenaltyRate: number; overdueDays: number; fineAmount: number;
};
export type Reservation = { id: string; studentId: string; student: string; bookId: string; reserved: string; expires: string; status: 'Active' | 'Fulfilled' | 'Cancelled' | 'Expired' };
export type Staff = {
  id: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  name: string;
  email: string;
  active: boolean;
  since: string;
  updatedAt?: string;
};
export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';
export interface StaffInvitation {
  id: string;
  email: string;
  token: string;
  role: 'Librarian' | 'Admin';
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  invitedBy?: string | null;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string | null;
  status: InvitationStatus;
  inviteLink?: string;
}
export type StudentRecord = { name: string; major: string; status: string };
export interface CirculationPolicy {
  timeZone: string; loanPeriodDays: number; maxActiveLoans: number;
  dailyPenaltyRate: number; today: string; dueDate: string;
}
export interface Patron {
  studentNumber: string; name: string; program: string | null; department: string | null;
  academicStatus: string; canBorrow: boolean; blockedReason: string | null;
  activeLoanCount: number; overdueLoanCount: number; policy: CirculationPolicy;
}
