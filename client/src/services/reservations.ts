import {
  borrowDemoReservation, cancelDemoReservation, createDemoReservation,
  demoBooks, getDemoReservations,
} from '../data/libraryDemo';

export type ReservationBook = { id: string; title: string; author: string; availableCopies: number };
export type Reservation = {
  id: string; studentNumber: string; studentName: string;
  status: 'active' | 'fulfilled' | 'cancelled' | 'expired';
  reservedAt: string; expiresAt: string; book: ReservationBook | null;
};
// Frontend demo adapter, shared by both reservation views. No network requests.
export async function getReservationBooks(): Promise<ReservationBook[]> {
  return demoBooks.filter((book) => book.active).map((book) => ({
    id: book.id, title: book.title, author: book.author, availableCopies: book.available,
  }));
}
export async function getReservations(status = 'all', _signal?: AbortSignal): Promise<Reservation[]> {
  const books = await getReservationBooks();
  return getDemoReservations().map((item): Reservation => ({
    id: item.id, studentNumber: item.studentId, studentName: item.student,
    status: item.status.toLowerCase() as Reservation['status'],
    reservedAt: item.reserved, expiresAt: item.expires,
    book: books.find((book) => book.id === item.bookId) ?? null,
  })).filter((item) => status === 'all' || item.status === status);
}
export async function createReservation(studentId: string, bookId: string): Promise<void> {
  createDemoReservation(studentId, bookId);
}
export async function cancelReservation(id: string): Promise<void> {
  cancelDemoReservation(id);
}
export async function borrowReservation(id: string): Promise<void> {
  borrowDemoReservation(id);
}
