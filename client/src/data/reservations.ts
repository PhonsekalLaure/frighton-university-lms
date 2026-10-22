import type { Reservation } from '../types/library';

export const initialReservations: Reservation[] = [
  { id: 'RS-0261', studentId: 'STU-2026-0002', student: 'Elias Navarro', bookId: 2, reserved: '2026-10-20', expires: '2026-10-23', status: 'Active' },
  { id: 'RS-0258', studentId: 'STU-2026-0003', student: 'Sofia Reyes', bookId: 7, reserved: '2026-10-18', expires: '2026-10-21', status: 'Expired' },
  { id: 'RS-0251', studentId: 'STU-2026-0001', student: 'Maya Chen', bookId: 5, reserved: '2026-10-14', expires: '2026-10-17', status: 'Fulfilled' },
];
