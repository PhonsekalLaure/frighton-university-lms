import type { CreateReservationInput, ReservationRecord, ReservationStatus, ReservationStudentRecord } from '../models/reservation.js';
import type { Pagination } from '../types/loan.js';

export interface ReservationFilters extends Pagination {
  status: ReservationStatus | 'all';
}

export interface ReservationRepository {
  searchStudents(query: string): Promise<ReservationStudentRecord[]>;
  list(filters: ReservationFilters): Promise<{ data: ReservationRecord[]; total: number; page: number; pageSize: number }>;
  create(input: CreateReservationInput, reservedBy: string): Promise<ReservationRecord>;
  cancel(id: string, cancelledBy: string): Promise<ReservationRecord>;
}
