import type { CreateReservationInput, ReservationStatus } from '../models/reservation.js';
import type { ReservationFilters } from '../interfaces/reservationRepository.js';
import { HttpError } from '../utils/httpError.js';
import { parsePagination, parseStudentNumber, parseUuid } from './loanValidators.js';

const statuses = new Set<ReservationStatus | 'all'>(['all', 'active', 'fulfilled', 'cancelled', 'expired']);

export function parseReservationStudentSearch(query: Record<string, unknown>): string {
  const value = query.q;
  if (typeof value !== 'string' || value.trim().length < 2 || value.trim().length > 50
      || !/^[\p{L}\p{M}0-9 .'-]+$/u.test(value.trim())) {
    throw new HttpError(400, 'Student search must contain 2 to 50 letters, numbers, spaces, periods, apostrophes, or hyphens.');
  }
  return value.trim();
}

export function parseReservationFilters(query: Record<string, unknown>): ReservationFilters {
  const status = query.status ?? 'all';
  if (typeof status !== 'string' || !statuses.has(status as ReservationStatus | 'all')) {
    throw new HttpError(400, 'Status must be all, active, fulfilled, cancelled, or expired.');
  }
  return { status: status as ReservationStatus | 'all', ...parsePagination(query) };
}

export function parseCreateReservationBody(value: unknown): CreateReservationInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'A reservation object is required.');
  }
  const input = value as Record<string, unknown>;
  return {
    frightonId: parseStudentNumber(input.frightonId),
    bookId: parseUuid(input.bookId, 'bookId'),
  };
}
