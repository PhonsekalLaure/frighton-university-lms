import { ApiError } from './auth';

const apiBase = (import.meta.env?.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export type ReservationBook = {
  id: string;
  title: string;
  author: string;
  availableCopies: number;
};

export type Reservation = {
  id: string;
  studentNumber: string;
  studentName: string;
  status: 'active' | 'fulfilled' | 'cancelled' | 'expired';
  reservedAt: string;
  expiresAt: string;
  book: ReservationBook | null;
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    credentials: 'include',
    cache: 'no-store',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, data.error || 'Unable to complete the request.');
  return data as T;
}

export async function getReservationBooks(): Promise<ReservationBook[]> {
  const data = await request<Array<Record<string, unknown>>>('/v1/books');
  return data.map((book) => ({
    id: String(book.books_id ?? book.id),
    title: String(book.title),
    author: String(book.author),
    availableCopies: Number(book.copies ?? book.available_copies ?? book.availableCopies ?? 0),
  }));
}

export function getReservations(status = 'all'): Promise<Reservation[]> {
  return request(`/v1/reservations?status=${encodeURIComponent(status)}`);
}

export function createReservation(frightonId: string, bookId: string): Promise<Reservation> {
  return request('/v1/reservations', { method: 'POST', body: JSON.stringify({ frightonId, bookId }) });
}

export function cancelReservation(id: string): Promise<void> {
  return request(`/v1/reservations/${id}/cancel`, { method: 'POST', body: '{}' });
}

export function borrowReservation(id: string): Promise<void> {
  return request(`/v1/reservations/${id}/borrow`, { method: 'POST', body: '{}' });
}
