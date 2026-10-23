import { useCallback, type FormEvent } from 'react';
import { AlertTriangle, ArrowDownLeft, ArrowRight, ArrowUpRight, BookmarkCheck, BookOpen, CalendarDays, CheckCircle2, Command } from 'lucide-react';
import type { BookRecord, CirculationPolicy, Loan, Patron } from '../../types/library';
import { coverTone, dateISO, formatDate, getInitials, money } from '../../utils/library';
import { PageHeading, PanelHeading, StatusPill } from '../../components/staff/StaffUI';
import { SearchSelect } from '../../components/staff/SearchSelect';
import { searchReservationStudents } from '../../services/reservations';

const searchStudents = async (query: string, signal: AbortSignal) =>
  (await searchReservationStudents(query, signal)).map((student) => ({
    value: student.studentNumber, label: student.name,
    detail: [student.studentNumber, student.program].filter(Boolean).join(' - '),
  }));

interface Props {
  tab: 'borrow' | 'return'; setTab: (tab: 'borrow' | 'return') => void;
  books: BookRecord[]; activeLoans: Loan[]; loans: Loan[]; policy: CirculationPolicy;
  borrowId: string; setBorrowId: (value: string) => void;
  borrowBookId: string; setBorrowBookId: (value: string) => void;
  returnLoanId: string; setReturnLoanId: (value: string) => void;
  patron: Patron | null; patronLoading: boolean; patronError: string; checkoutError: string;
  returnQuote: Loan | null; quoteLoading: boolean; quoteError: string; pending: boolean;
  bookById: (id: string) => BookRecord | undefined;
  onBorrow: (event: FormEvent) => void; onReturn: () => void; onReserve: () => void;
}

export function CirculationPage(props: Props) {
  const { tab, setTab, books, activeLoans, loans, policy, borrowId, setBorrowId, borrowBookId,
    setBorrowBookId, returnLoanId, setReturnLoanId, patron, patronLoading, patronError,
    returnQuote, quoteLoading, quoteError, pending, bookById, onBorrow, onReturn, onReserve, checkoutError } = props;
  const selectedReturnLoan = activeLoans.find((loan) => loan.id === returnLoanId);
  const searchBooks = useCallback(async (query: string) => books
    .filter((book) => book.active && book.available > 0 && book.title.toLowerCase().includes(query.toLowerCase()))
    .map((book) => ({ value: book.id, label: book.title, detail: book.author + ' - ' + book.available + ' available' })), [books]);
  const searchActiveBorrowers = useCallback(async (query: string) => activeLoans
    .filter((loan) => (loan.student + ' ' + loan.studentId + ' ' + (bookById(loan.bookId)?.title ?? loan.bookTitle))
      .toLowerCase().includes(query.toLowerCase()))
    .map((loan) => ({
      value: loan.id, label: loan.student,
      detail: loan.studentId + ' - ' + (bookById(loan.bookId)?.title ?? loan.bookTitle) + ' - Due ' + formatDate(loan.due),
    })), [activeLoans, bookById]);
  const chosenBook = bookById(borrowBookId);
  const quote = returnQuote?.id === returnLoanId ? returnQuote : null;
  const fine = quote?.fineAmount ?? 0;
  const issueHistory = loans.filter((loan) => dateISO(loan.borrowed) === policy.today);
  return <>
    <PageHeading eyebrow="CIRCULATION" title="Circulation desk"/>
    <div className="circulation-tabs">
      <button className={tab === 'borrow' ? 'tab-active' : ''} onClick={() => setTab('borrow')} disabled={pending}><ArrowUpRight size={16}/> Check out</button>
      <button className={tab === 'return' ? 'tab-active' : ''} onClick={() => setTab('return')} disabled={pending}><ArrowDownLeft size={16}/> Process return</button>
      <span className="tab-hint"><Command size={14}/> Type a student number, name, or book title</span>
    </div>
    <div className="circulation-layout"><section className="staff-panel circulation-panel">
      {tab === 'borrow' ? <form onSubmit={onBorrow}><fieldset className="workflow-fields" disabled={pending}>
        <div className="workflow-step"><span className="step-num">01</span><div className="step-content">
          <h2>Identify the student</h2><p>Type a student number or name, then select a suggestion to check borrowing status.</p>
          <SearchSelect value={borrowId} selectedLabel={patron ? patron.name + ' - ' + borrowId : borrowId}
            onSelect={setBorrowId} search={searchStudents} label="Checkout student"
            placeholder="Type student number or name" emptyMessage="No active students found." minLength={2} required disabled={pending}/>
          {patronLoading && <p role="status" className="field-hint">Checking student eligibility...</p>}
          {patronError && <div role="alert" className="inline-warning"><AlertTriangle size={15}/>{patronError}</div>}
          {patron && <><div className="student-lookup-card">
            <span className="staff-avatar">{getInitials(patron.name)}</span>
            <span><strong>{patron.name}</strong><small>{patron.program || patron.department || patron.academicStatus}</small><small>{patron.activeLoanCount} active loans; {patron.overdueLoanCount} overdue</small></span>
            <StatusPill status={patron.canBorrow ? 'Eligible' : 'Blocked'}/>
          </div>{patron.blockedReason && <div className="inline-warning"><AlertTriangle size={15}/>{patron.blockedReason}</div>}</>}
        </div></div>
        <div className="workflow-step"><span className="step-num">02</span><div className="step-content">
          <h2>Select a book</h2><p>Only active titles with available copies can be checked out.</p>
          <SearchSelect value={borrowBookId} selectedLabel={chosenBook?.title ?? ''}
            onSelect={setBorrowBookId} search={searchBooks} label="Checkout book"
            placeholder="Type book title" emptyMessage="No available books match this title." required disabled={pending}/>
          {chosenBook && <div className="chosen-book"><span className={`book-mini-cover cover-${coverTone(chosenBook.id)}`}><BookOpen size={16}/></span>
            <span><strong>{chosenBook.title}</strong><small>{chosenBook.author}</small></span><span className="availability-tag">{chosenBook.available} available</span></div>}
        </div></div>
        <div className="workflow-step"><span className="step-num">03</span><div className="step-content">
          <h2>Confirm checkout</h2><p>Loan period is {policy.loanPeriodDays} days, using Manila time.</p>
          <div className="checkout-due"><CalendarDays size={17}/><span>Due date</span><strong>{formatDate(policy.dueDate)}</strong></div>
          {checkoutError && <p className="inline-warning" role="alert"><AlertTriangle size={15}/>{checkoutError}</p>}
          <button className="staff-primary checkout-submit" type="submit" disabled={pending || patronLoading || !patron?.canBorrow || !chosenBook?.active || chosenBook.available < 1}>
            {pending ? 'Processing checkout...' : 'Confirm checkout'} <ArrowRight size={16}/>
          </button>
        </div></div>
      </fieldset></form> : <div>
        <div className="workflow-step return-step"><span className="step-num">01</span><div className="step-content">
          <h2>Find an active borrower</h2><p>Choose a borrower and their borrowed book from the active loan records.</p>
          <SearchSelect value={returnLoanId}
            selectedLabel={selectedReturnLoan ? selectedReturnLoan.student + ' - ' + selectedReturnLoan.studentId : ''}
            onSelect={setReturnLoanId} search={searchActiveBorrowers} label="Active borrower"
            placeholder="Search borrower name or student number" minLength={0}
            emptyMessage="No active borrowers match your search." disabled={pending}/>
        </div></div>
        <div className="workflow-step return-step"><span className="step-num">02</span><div className="step-content">
          <h2>Returning book</h2><p>The book title is filled automatically when you choose an active borrower.</p>
          <div className="input-with-icon"><BookOpen size={17}/><input aria-label="Returning book" readOnly
            value={selectedReturnLoan ? bookById(selectedReturnLoan.bookId)?.title ?? selectedReturnLoan.bookTitle : ''}
            placeholder="Choose an active borrower to fill the book title"/></div>          {activeLoans.length === 0 && <p className="field-hint">There are no active loans to return.</p>}
          {returnLoanId && quoteLoading && <p role="status">Calculating the current fine...</p>}
          {returnLoanId && quoteError && <div className="inline-warning" role="alert"><AlertTriangle size={15}/>{quoteError}</div>}
        </div></div>
        {quote && !quoteLoading && !quoteError && (quote.returned
          ? <p className="inline-warning">This loan has already been returned. Refresh the loan list.</p>
          : <><div className="return-detail-card"><span className="book-mini-cover cover-1"><BookOpen size={16}/></span>
            <div><span className="eyebrow-staff">RETURNING BOOK</span><strong>{bookById(quote.bookId)?.title ?? quote.bookTitle}</strong><small>{quote.student} - {quote.studentId}</small></div>
            <StatusPill status={quote.overdueDays ? `${quote.overdueDays} days overdue` : 'On time'}/></div>
            <div className={fine ? 'fine-panel fine-due' : 'fine-panel'}>
              <span className="fine-icon">{fine ? <AlertTriangle size={18}/> : <CheckCircle2 size={18}/>}</span>
              <div><strong>{fine ? 'Fine to collect' : 'No fine due'}</strong><small>{fine ? `${quote.overdueDays} overdue days - ${money(quote.dailyPenaltyRate)} per day` : 'This item is being returned on time.'}</small></div><b>{money(fine)}</b>
            </div>
            <button className="staff-primary checkout-submit" onClick={onReturn} disabled={pending}>{pending ? 'Processing return...' : fine ? `Collect ${money(fine)} and return` : 'Confirm return'} <ArrowRight size={16}/></button>
            {fine > 0 && <p className="receipt-note">A receipt number will be generated after collection.</p>}
          </>)}
      </div>}
    </section><aside className="circulation-aside">
      <section className="staff-panel circulation-help"><span className="eyebrow-staff">DESK GUIDE</span><h3>{tab === 'borrow' ? 'Borrowing rules' : 'Return processing'}</h3>
        <ul>{tab === 'borrow' ? <><li>One active loan per student</li><li>Loan period is {policy.loanPeriodDays} calendar days</li><li>Return all borrowed books before borrowing again</li><li>Only one active reservation per title</li></>
          : <><li>The default fine is {money(policy.dailyPenaltyRate)} per overdue day</li><li>Returns use the rate saved with the loan</li><li>Fined returns receive a printable receipt</li></>}</ul>
        <div className="help-divider"/><button className="staff-text-link" onClick={onReserve} disabled={pending}><BookmarkCheck size={15}/> Create a reservation</button>
      </section>
      <section className="staff-panel today-summary"><PanelHeading eyebrow="TODAY" title="Desk activity"/>
        <div className="today-stat"><span>Checkouts processed</span><strong>{issueHistory.length}</strong></div>
        <div className="today-stat"><span>Active loans</span><strong>{activeLoans.length}</strong></div>
        <div className="today-stat"><span>Books available</span><strong>{books.reduce((sum, book) => sum + (book.active ? book.available : 0), 0)}</strong></div>
      </section>
    </aside></div>
  </>;
}
