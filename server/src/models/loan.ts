export interface LoanRecord {
  id: string;
  student_id: string;
  book_id: string | null;
  issued_by: string | null;
  borrow_date: string;
  due_date: string;
  return_date: string | null;
  returned_to: string | null;
  daily_penalty_rate: number;
  overdue_days: number;
  fine_amount: number;
  fine_paid_at: string | null;
  receipt_number: string | null;
}

export interface LoanDetailsRecord extends LoanRecord {
  student_number: string | null;
  student_name: string;
  book_title: string | null;
  book_author: string | null;
}

export interface PatronRecord {
  id: string;
  student_number: string;
  first_name: string;
  last_name: string;
  email: string;
  program: string | null;
  department: string | null;
  academic_status: string;
  role: string;
  user: { is_active: boolean; role: string };
}

export interface CirculationPolicy {
  time_zone: string;
  loan_period_days: number;
  max_active_loans: number;
  daily_penalty_rate: number;
  today: string;
  due_date: string;
}

export interface AvailableBook {
  id: string;
  title: string;
  author: string;
  availableCopies: number;
}

export interface PageResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function serializeLoan(loan: LoanRecord) {
  return {
    id: loan.id,
    studentId: loan.student_id,
    bookId: loan.book_id,
    issuedBy: loan.issued_by,
    borrowedAt: loan.borrow_date,
    dueDate: loan.due_date,
    returnedAt: loan.return_date,
    returnedTo: loan.returned_to,
    dailyPenaltyRate: Number(loan.daily_penalty_rate),
    overdueDays: loan.overdue_days,
    fineAmount: Number(loan.fine_amount),
    finePaidAt: loan.fine_paid_at,
    receiptNumber: loan.receipt_number,
  };
}

export function serializeLoanDetails(loan: LoanDetailsRecord) {
  return {
    ...serializeLoan(loan),
    studentNumber: loan.student_number,
    studentName: loan.student_name,
    bookTitle: loan.book_title,
    bookAuthor: loan.book_author,
  };
}

export function serializePolicy(policy: CirculationPolicy) {
  return {
    timeZone: policy.time_zone,
    loanPeriodDays: policy.loan_period_days,
    maxActiveLoans: policy.max_active_loans,
    dailyPenaltyRate: Number(policy.daily_penalty_rate),
    today: policy.today,
    dueDate: policy.due_date,
  };
}
