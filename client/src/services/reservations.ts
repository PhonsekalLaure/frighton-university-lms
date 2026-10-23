import { apiRequest, getAllPages } from './api';

export type ReservationBook = { id: string; title: string; author: string; availableCopies: number };
export type Reservation = {
  id: string; studentNumber: string; studentName: string;
  status: 'active' | 'fulfilled' | 'cancelled' | 'expired';
  reservedAt: string; expiresAt: string; book: ReservationBook;
};

export function getReservations(status = 'all', signal?: AbortSignal): Promise<Reservation[]> {
  return getAllPages<Reservation>(`/v1/reservations?status=${encodeURIComponent(status)}`, signal);
}

export function createReservation(frightonId: string, bookId: string): Promise<Reservation> {
  return apiRequest<Reservation>('/v1/reservations', {
    method: 'POST', body: JSON.stringify({ frightonId, bookId }),
  });
}

export function cancelReservation(id: string): Promise<Reservation> {
  return apiRequest<Reservation>(`/v1/reservations/${encodeURIComponent(id)}/cancel`, {
    method: 'POST', body: '{}',
  });
}
