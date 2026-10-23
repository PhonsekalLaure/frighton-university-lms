export type ReservationStatus = 'active' | 'fulfilled' | 'cancelled' | 'expired';

export interface ReservationRecord {
  id: string;
  status: ReservationStatus;
  reserved_at: string;
  expires_at: string;
  student_number: string;
  student_name: string;
  book_id: string;
  book_title: string;
  book_author: string;
  available_copies: number;
}

export interface CreateReservationInput {
  frightonId: string;
  bookId: string;
}

export function serializeReservation(record: ReservationRecord) {
  return {
    id: record.id,
    status: record.status,
    reservedAt: record.reserved_at,
    expiresAt: record.expires_at,
    studentNumber: record.student_number,
    studentName: record.student_name,
    book: {
      id: record.book_id,
      title: record.book_title,
      author: record.book_author,
      availableCopies: record.available_copies,
    },
  };
}
