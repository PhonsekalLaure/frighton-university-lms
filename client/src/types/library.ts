export type Page = 'dashboard' | 'books' | 'circulation' | 'borrowed' | 'reservations' | 'librarians';
export type StaffRole = 'Librarian' | 'Admin';
export type BookRecord = { id: number; title: string; author: string; category: string; year: number; available: number; total: number; shelf: string; active: boolean };
export type Loan = { id: string; studentId: string; student: string; bookId: number; borrowed: string; due: string; returned?: string; finePaid?: number; receipt?: string };
export type Reservation = { id: string; studentId: string; student: string; bookId: number; reserved: string; expires: string; status: 'Active' | 'Fulfilled' | 'Cancelled' | 'Expired' };
export type Staff = { name: string; email: string; active: boolean; since: string };
export type StudentRecord = { name: string; major: string; status: string };
