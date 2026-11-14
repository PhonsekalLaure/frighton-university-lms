import { AlertTriangle, ArrowDownLeft, ArrowRight, ArrowUpRight, BookOpen, BookmarkCheck, CalendarDays, Clock3, Coins, FileText, Library, Plus } from 'lucide-react';
import type { BookRecord, Loan, Page, Reservation } from '../../types/library';
import { formatDate, money, todayISO } from '../../utils/library';
import { finesCollectedToday } from '../../utils/loanSummary';
import { EmptyState, LoanListItem, Metric, PageHeading, PanelHeading } from '../../components/staff/StaffUI';

interface Props {
  books: BookRecord[];
  loans: Loan[];
  activeLoans: Loan[];
  overdueLoans: Loan[];
  reservations: Reservation[];
  bookById: (id: string) => BookRecord | undefined;
  onNavigate: (page: Page) => void;
  onBorrowers: (filter: string) => void;
  onCirculation: (tab: 'borrow' | 'return') => void;
  onAddBook: () => void;
  onNewReservation: () => void;
}

export function DashboardPage({ books, loans, activeLoans, overdueLoans, reservations, bookById,
  onNavigate, onBorrowers, onCirculation, onAddBook, onNewReservation }: Props) {
  const dueToday = activeLoans.filter((loan) => loan.due === todayISO());
  const now = Date.now();
  const expiring = reservations.filter((item) => item.status === 'Active' &&
    Date.parse(item.expires) <= now + 86400000 && Date.parse(item.expires) >= now)
    .sort((a, b) => Date.parse(a.expires) - Date.parse(b.expires));
  const available = books.reduce((sum, book) => sum + (book.active ? book.available : 0), 0);
  const collected = finesCollectedToday(loans);

  return <>
    <PageHeading title="Good morning, library team">
      <button className="staff-outline" onClick={() => onBorrowers('All active')}><FileText size={16}/> View activity</button>
    </PageHeading>
    {overdueLoans.length > 0 && <button className="overdue-banner" onClick={() => onBorrowers('Overdue')}>
      <span className="alert-icon"><AlertTriangle size={18}/></span>
      <span><strong>{overdueLoans.length} overdue {overdueLoans.length === 1 ? 'loan' : 'loans'} need attention</strong>
        <small>Estimated fines accrued: {money(overdueLoans.reduce((sum, loan) => sum + loan.fineAmount, 0))} - Review overdue borrowers</small>
      </span><ArrowRight size={18}/>
    </button>}
    <div className="metric-grid dashboard-metrics">
      <Metric icon={<Library size={18}/>} label="Titles in collection" value={books.filter((book) => book.active).length.toLocaleString()} detail={available + ' copies available'} tone="blue"/>
      <Metric icon={<BookOpen size={18}/>} label="Currently borrowed" value={activeLoans.length.toString()} detail="Across active borrowers" tone="sage"/>
      <Metric icon={<AlertTriangle size={18}/>} label="Overdue loans" value={overdueLoans.length.toString()} detail={overdueLoans.length ? 'Action needed' : 'All on time'} tone="rose"/>
      <Metric icon={<BookmarkCheck size={18}/>} label="Active reservations" value={reservations.length.toString()} detail="Three-day catalog holds" tone="gold"/>
      <Metric icon={<Coins size={18}/>} label="Fines collected today" value={money(collected)} detail="Payments recorded in Manila time" tone="sage"/>
    </div>
    <div className="dashboard-layout">
      <div className="dashboard-primary">
        <section className="staff-panel">
          <PanelHeading eyebrow="DESK WORKFLOW" title="Quick actions"/>
          <div className="quick-action-grid">
            <button onClick={() => onCirculation('borrow')} className="quick-action-card"><span className="quick-action-icon borrow-icon"><ArrowUpRight size={19}/></span><span><strong>Check out a book</strong><small>Issue a book to a student</small></span><ArrowRight size={16}/></button>
            <button onClick={() => onCirculation('return')} className="quick-action-card"><span className="quick-action-icon return-icon"><ArrowDownLeft size={19}/></span><span><strong>Process a return</strong><small>Accept a book and collect fines</small></span><ArrowRight size={16}/></button>
            <button onClick={onAddBook} className="quick-action-card"><span className="quick-action-icon catalog-icon"><Plus size={19}/></span><span><strong>Add to collection</strong><small>Create a book record</small></span><ArrowRight size={16}/></button>
            <button onClick={onNewReservation} className="quick-action-card"><span className="quick-action-icon reserve-icon"><BookmarkCheck size={18}/></span><span><strong>New reservation</strong><small>Create a three-day hold</small></span><ArrowRight size={16}/></button>
          </div>
        </section>
        <section className="staff-panel">
          <PanelHeading eyebrow="DUE TODAY" title="Today's returns" action={<button className="staff-text-link" onClick={() => onBorrowers('Due today')}>View due today <ArrowRight size={14}/></button>}/>
          {dueToday.length ? <div className="compact-loan-list">{dueToday.map((loan) => <LoanListItem key={loan.id} loan={loan} book={bookById(loan.bookId)}/>)}</div>
            : <EmptyState icon={<CalendarDays size={20}/>} title="No books due today" text="There are no loans due today."/>}
        </section>
      </div>
      <aside className="dashboard-secondary">
        <section className="staff-panel">
          <PanelHeading eyebrow="WITHIN 24 HOURS" title="Reservations expiring" action={<button className="staff-text-link" onClick={() => onNavigate('reservations')}>View all <ArrowRight size={14}/></button>}/>
          {expiring.length ? <ul className="expiring-reservations">
            {expiring.map((item) => <li key={item.id}>
              <strong>{bookById(item.bookId)?.title ?? 'Archived title'}</strong>
              <span>{item.student} | {item.studentId}</span>
              <small><Clock3 size={13}/> {formatDate(item.expires)} at {new Date(item.expires).toLocaleTimeString('en-PH', {
                timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit',
              })}</small>
            </li>)}
          </ul> : <EmptyState icon={<Clock3 size={20}/>} title="No holds expiring soon" text="No active reservations expire within 24 hours."/>}
        </section>
        <section className="staff-panel desk-card">
          <span className="eyebrow-staff">FINE COLLECTION</span>
          <h3>{money(collected)} collected today</h3>
          <p>Review pending student fines and payment history.</p>
          <button className="staff-text-link" onClick={() => onNavigate('fines')}>Open fines <ArrowRight size={15}/></button>
        </section>
      </aside>
    </div>
  </>;
}
