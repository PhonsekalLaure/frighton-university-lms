import type { LoanRepository } from '../interfaces/loanRepository.js';
import { serializeLoan, serializeLoanDetails, serializePolicy } from '../models/loan.js';
import { loanRepository } from '../repositories/loanRepository.js';
import { sisService, type SISStudentStatus } from './sisService.js';
import type { BorrowInput, LoanFilters, Pagination, ReportOverdueInput } from '../types/loan.js';
import { HttpError } from '../utils/httpError.js';

type CheckStudentStatus = (studentNumber: string) => Promise<SISStudentStatus>;

export class LoanService {
  constructor(
    private readonly repository: LoanRepository = loanRepository,
    private readonly checkStudentStatus: CheckStudentStatus | null = null,
  ) {}

  async getPolicy() {
    return serializePolicy(await this.repository.getPolicy());
  }

  async verifyPatron(studentNumber: string) {
    const student = await this.repository.findPatron(studentNumber);
    if (!student || student.user?.role !== 'Students') throw new HttpError(404, 'Student ID was not found.');

    const [policy, loans] = await Promise.all([
      this.repository.getPolicy(), this.repository.getActiveLoans(student.id),
    ]);
    const overdueLoanCount = loans.filter((loan) => loan.overdue_days > 0).length;
    let blockedReason: string | null = null;
    if (!student.user.is_active || student.academic_status !== 'active') {
      blockedReason = 'This student account is inactive.';
    } else if (loans.length > 0) {
      blockedReason = 'This student already has an active loan. Return all borrowed books before borrowing again.';
    }

    // Shared student profiles and unreturned LMS loans determine eligibility.
    // A separate SIS check is used only when explicitly supplied by an integration.
    let sisStatus: SISStudentStatus | null = null;
    if (!blockedReason && this.checkStudentStatus) {
      try {
        sisStatus = await this.checkStudentStatus(studentNumber);
      } catch (cause) {
        throw new HttpError(502, 'Student standing could not be verified with SIS. Please try again.', { cause });
      }
      if (sisStatus.frightonId !== studentNumber || sisStatus.canBorrow !== true) {
        blockedReason = 'This student cannot borrow due to their SIS standing or active holds.';
      }
    }

    return {
      frightonId: student.student_number,
      name: [student.first_name, student.last_name].join(' '),
      email: student.email,
      role: student.role,
      academicStatus: student.academic_status,
      department: student.department,
      program: student.program,
      canBorrow: blockedReason === null,
      blockedReason,
      activeHolds: sisStatus?.activeHolds ?? [],
      activeLoanCount: loans.length,
      overdueLoanCount,
      policy: serializePolicy(policy),
    };
  }

  async listAvailableBooks(pagination: Pagination) {
    return this.repository.listAvailableBooks(pagination);
  }

  async listLoans(filters: LoanFilters) {
    const result = await this.repository.listLoans(filters);
    return { ...result, data: result.data.map(serializeLoanDetails) };
  }

  async getLoan(id: string) {
    const loan = await this.repository.findLoan(id);
    if (!loan) throw new HttpError(404, 'Loan was not found.');
    return serializeLoanDetails(loan);
  }

  async borrow(input: BorrowInput, issuedBy: string) {
    const patron = await this.verifyPatron(input.frightonId);
    if (!patron.canBorrow) throw new HttpError(403, patron.blockedReason ?? 'This student cannot borrow.');
    // The database repeats local checks under locks, since the preview can become stale.
    return serializeLoan(await this.repository.borrow(input, issuedBy));
  }

  async returnBook(id: string, returnedTo: string, fineCollected: boolean) {
    // Returns remain available when SIS is offline; the database owns fines and stock.
    return serializeLoan(await this.repository.returnBook(id, returnedTo, fineCollected));
  }

  async reportOverdue(input: ReportOverdueInput) {
    try {
      return await sisService.placeHold(input.frightonId, `Overdue Library Book: "${input.bookTitle}"`, input.fineAmount);
    } catch (cause) {
      throw new HttpError(502, 'The overdue hold could not be registered with SIS.', { cause });
    }
  }
}
