import type { ReservationRepository } from '../interfaces/reservationRepository.js';
import type { CreateReservationInput } from '../models/reservation.js';
import { serializeReservation, serializeReservationStudent } from '../models/reservation.js';
import { reservationRepository } from '../repositories/reservationRepository.js';
import { HttpError } from '../utils/httpError.js';
import { LoanService } from './loanService.js';

type VerifyPatron = (studentNumber: string) => Promise<{ canBorrow: boolean; blockedReason: string | null }>;

export class ReservationService {
  constructor(
    private readonly repository: ReservationRepository = reservationRepository,
    private readonly verifyPatron: VerifyPatron = (studentNumber) => new LoanService(undefined, null).verifyPatron(studentNumber),
  ) {}

  async searchStudents(query: string) {
    return (await this.repository.searchStudents(query)).map(serializeReservationStudent);
  }

  async list(filters: Parameters<ReservationRepository['list']>[0]) {
    const result = await this.repository.list(filters);
    return { ...result, data: result.data.map(serializeReservation) };
  }

  async create(input: CreateReservationInput, reservedBy: string) {
    const patron = await this.verifyPatron(input.frightonId);
    if (!patron.canBorrow) throw new HttpError(403, patron.blockedReason ?? 'This student cannot reserve books.');
    return serializeReservation(await this.repository.create(input, reservedBy));
  }

  async cancel(id: string, cancelledBy: string) {
    return serializeReservation(await this.repository.cancel(id, cancelledBy));
  }
}
