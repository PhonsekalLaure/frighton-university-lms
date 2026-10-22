import type { Loan } from '../types/library';

export const initialLoans: Loan[] = [
  { id: 'LN-1048', studentId: 'STU-2026-0004', student: 'Noah Santiago', bookId: 2, borrowed: '2026-10-01', due: '2026-10-15' },
  { id: 'LN-1052', studentId: 'STU-2026-0002', student: 'Elias Navarro', bookId: 7, borrowed: '2026-10-08', due: '2026-10-22' },
  { id: 'LN-1057', studentId: 'STU-2026-0001', student: 'Maya Chen', bookId: 4, borrowed: '2026-10-12', due: '2026-10-26' },
  { id: 'LN-1061', studentId: 'STU-2026-0003', student: 'Sofia Reyes', bookId: 1, borrowed: '2026-10-15', due: '2026-10-29' },
];
