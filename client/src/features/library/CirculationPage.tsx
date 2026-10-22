import type { FormEvent } from 'react';
import { AlertTriangle, ArrowDownLeft, ArrowRight, ArrowUpRight, BookmarkCheck, BookOpen, CalendarDays, CheckCircle2, Command, Users } from 'lucide-react';
import type { BookRecord, CirculationPolicy, Loan, Patron } from '../../types/library';
import { coverTone, dateISO, formatDate, getInitials, money } from '../../utils/library';
import { PageHeading, PanelHeading, StatusPill } from '../../components/staff/StaffUI';

interface Props {
  tab: 'borrow' | 'return'; setTab: (tab: 'borrow' | 'return') => void;
  books: BookRecord[]; activeLoans: Loan[]; loans: Loan[]; policy: CirculationPolicy;
  borrowId: string; setBorrowId: (value: string) => void;
  borrowBookId: string; setBorrowBookId: (value: string) => void;
  returnLoanId: string; setReturnLoanId: (value: string) => void;
  patron: Patron | null; patronLoading: boolean; patronError: string;
  returnQuote: Loan | null; quoteLoading: boolean; quoteError: string; pending: boolean;
  bookById: (id: string) => BookRecord | undefined;
  onBorrow: (event: FormEvent) => void; onReturn: () => void; onReserve: () => void;
}

export function CirculationPage(props: Props) {
  const { tab, setTab, books, activeLoans, loans, policy, borrowId, setBorrowId, borrowBookId,
    setBorrowBookId, returnLoanId, setReturnLoanId, patron, patronLoading, patronError,
    returnQuote, quoteLoading, quoteError, pending, bookById, onBorrow, onReturn, onReserve } = props;
  const chosenBook = bookById(borrowBookId);
  const quote = returnQuote?.id === returnLoanId ? returnQuote : null;
  const fine = quote?.fineAmount ?? 0;
  const issueHistory = loans.filter((loan) => dateISO(loan.borrowed) === policy.today);
  return <>
    <PageHeading eyebrow="CIRCULATION" title="Circulation desk"/>
    <div className="circulation-tabs">
      <button className={tab === 'borrow' ? 'tab-active' : ''} onClick={() => setTab('borrow')} disabled={pending}><ArrowUpRight size={16}/> Check out</button>
      <button className={tab === 'return' ? 'tab-active' : ''} onClick={() => setTab('return')} disabled={pending}><ArrowDownLeft size={16}/> Process return</button>
      <span className="tab-hint"><Command size={14}/> Scan or type the student ID</span>
    </div>
    <div className="circulation-layout"><section className="staff-panel circulation-panel">
      {tab === 'borrow' ? <form onSubmit={onBorrow}><fieldset className="workflow-fields" disabled={pending}>
        <div className="workflow-step"><span className="step-num">01</span><div className="step-content">
          <h2>Identify the student</h2><p>Enter the student ID to confirm their borrowing status.</p>
          <div className="input-with-icon"><Users size={17}/><input autoFocus value={borrowId} onChange={(event) => setBorrowId(event.target.value.toUpperCase())} placeholder="Student ID" aria-label="Student ID" maxLength={50} required/></div>
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
          <select className="workflow-select" value={borrowBookId} onChange={(event) => setBorrowBookId(event.target.value)} required>
            <option value="">Search and choose a book</option>
            {books.filter((book) => book.active && book.available > 0).map((book) =>
              <option value={book.id} key={book.id}>{book.title} - {book.available} available</option>)}
          </select>
          {chosenBook && <div className="chosen-book"><span className={`book-mini-cover cover-${coverTone(chosenBook.id)}`}><BookOpen size={16}/></span>
            <span><strong>{chosenBook.title}</strong><small>{chosenBook.author}</small></span><span className="availability-tag">{chosenBook.available} available</span></div>}
        </div></div>
        <div className="workflow-step"><span className="step-num">03</span><div className="step-content">
          <h2>Confirm checkout</h2><p>Loan period is {policy.loanPeriodDays} days, using Manila time.</p>
          <div className="checkout-due"><CalendarDays size={17}/><span>Due date</span><strong>{formatDate(policy.dueDate)}</strong></div>
          <button className="staff-primary checkout-submit" type="submit" disabled={pending || patronLoading || !patron?.canBorrow || !chosenBook?.active || chosenBook.available < 1}>
            {pending ? 'Processing checkout...' : 'Confirm checkout'} <ArrowRight size={16}/>
          </button>
        </div></div>
      </fieldset></form> : <div>
        <div className="workflow-step return-step"><span className="step-num">01</span><div className="step-content">
          <h2>Find the active loan</h2><p>Select the book being returned by a student.</p>
          <select className="workflow-select" value={returnLoanId} onChange={(event) => setReturnLoanId(event.target.value)} disabled={pending}>
            <option value="">Select a student loan</option>
            {activeLoans.map((loan) => <option value={loan.id} key={loan.id}>{loan.student} - {bookById(loan.bookId)?.title ?? loan.bookTitle} - Due {formatDate(loan.due)}</option>)}
          </select>
          {activeLoans.length === 0 && <p className="field-hint">There are no active loans to return.</p>}
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
        <ul>{tab === 'borrow' ? <><li>Maximum {policy.maxActiveLoans} active loans per student</li><li>Loan period is {policy.loanPeriodDays} calendar days</li><li>Overdue items must be resolved first</li><li>Only one active reservation per title</li></>
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
