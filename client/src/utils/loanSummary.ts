import type { Loan } from '../types/library';
import { dateISO, todayISO } from './library';

export function pendingFines(loans: Loan[]): Loan[] {
  return loans.filter((loan) => loan.fineAmount > 0 && !loan.finePaidAt);
}

export function paidFines(loans: Loan[]): Loan[] {
  return loans.filter((loan) => loan.fineAmount > 0 && Boolean(loan.finePaidAt));
}

export function finesCollectedToday(loans: Loan[], today = todayISO()): number {
  return paidFines(loans).reduce((total, loan) =>
    total + (dateISO(loan.finePaidAt!) === today ? loan.fineAmount : 0), 0);
}

export function daysRemaining(due: string, today = todayISO()): number {
  return Math.max(0, Math.round((Date.parse(due) - Date.parse(today)) / 86400000));
}

export function groupLoansByStudent(loans: Loan[]) {
  const students = new Map<string, { studentId: string; student: string; loans: Loan[] }>();
  for (const loan of loans) {
    const group = students.get(loan.studentId);
    if (group) group.loans.push(loan);
    else students.set(loan.studentId, { studentId: loan.studentId, student: loan.student, loans: [loan] });
  }
  return [...students.values()];
}
