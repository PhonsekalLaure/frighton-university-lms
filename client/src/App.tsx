import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, ArrowLeftRight, ArrowRight, BookmarkCheck, CheckCircle2, ChevronDown, Clock3, FileText, LayoutDashboard, Library, LogOut, Menu, Search, UserCog, Users, X } from 'lucide-react';
import type { BookRecord, Loan, Page, Reservation, Staff } from './types/library';
import { formatDate, getInitials, money } from './utils/library';
import { useAuth } from './hooks/useAuth';
import { usePatronLookup } from './hooks/usePatronLookup';
import { useRemoteData } from './hooks/useRemoteData';
import { getAllPages } from './services/api';
import { archiveBook, borrowBook, getBooks, getLoan, getLoans, getPolicy, returnBook, saveBook as persistBook, toLoan } from './services/library';
import { cancelReservation, createReservation, getReservations } from './services/reservations';
import { demoBooks, getDemoLoans, returnDemoLoan } from './data/libraryDemo';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './features/library/DashboardPage';
import { BooksPage } from './features/library/BooksPage';
import { CirculationPage } from './features/library/CirculationPage';
import { BorrowersPage } from './features/library/BorrowersPage';
import { ReservationsPage } from './features/library/ReservationsPage';
import { LibrariansPage } from './features/library/LibrariansPage';
import { Field, FormActions, Modal } from './components/staff/StaffUI';
import { RemoteState } from './components/staff/RemoteState';
import './App.css';
import './staff.css';

type ConfirmationRequest = { title: string; message: string; confirmLabel: string; onConfirm: () => void; danger?: boolean };
const loadReservations = (signal: AbortSignal) => getReservations('all', signal);
const loadStaff = (signal: AbortSignal) => getAllPages<Staff>('/v1/staff', signal);
const emptyBookForm = { title: '', author: '', category: '', year: '', total: '1', shelf: '' };

const pageLabels: Record<Page, string> = {
  dashboard: 'Dashboard',
  books: 'Book catalog',
  circulation: 'Circulation desk',
  borrowed: 'Active borrowers',
  reservations: 'Reservations',
  librarians: 'Librarian management',
};
const pagePaths: Record<Page, string> = {
  dashboard: '/dashboard',
  books: '/books',
  circulation: '/circulation',
  borrowed: '/borrowers',
  reservations: '/reservations',
  librarians: '/librarians',
};
const pageFromPath = (pathname: string): Page | undefined => {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  if (normalizedPath === '/') return 'dashboard';
  return (Object.keys(pagePaths) as Page[]).find((candidate) => pagePaths[candidate] === normalizedPath);
};
export default function App() {
  const { librarian, checking, sessionError, login, logout } = useAuth();
  const role = librarian?.role === 'admin' ? 'Admin' : 'Librarian';
  const [page, setPage] = useState<Page>(() => pageFromPath(window.location.pathname) ?? 'dashboard');
  const demoPage = page === 'borrowed';
  const librarySessionId = !demoPage ? librarian?.id : undefined;
  const catalogRecords = useRemoteData(getBooks, librarySessionId);
  const loanRecords = useRemoteData(getLoans, librarySessionId);
  const policyRecord = useRemoteData(getPolicy, librarySessionId);
  const demoLoanRecords = useRemoteData(getDemoLoans, librarian?.id);
  const reservationRecords = useRemoteData(loadReservations, librarian?.id);
  const staffRecords = useRemoteData(loadStaff, librarian?.role === 'admin' && page === 'librarians' ? librarian.id : undefined);
  const books = catalogRecords.data ?? [];
  const loans = loanRecords.data ?? [];
  const policy = policyRecord.data;
  const reservations: Reservation[] = (reservationRecords.data ?? []).map((item) => ({
    id: item.id, studentId: item.studentNumber, student: item.studentName, bookId: item.book.id,
    reserved: item.reservedAt, expires: item.expiresAt,
    status: ({ active: 'Active', fulfilled: 'Fulfilled', cancelled: 'Cancelled', expired: 'Expired' } as const)[item.status],
  }));
  const staff = staffRecords.data ?? [];
  const demoLoans = demoLoanRecords.data ?? [];
  const [mobileNav, setMobileNav] = useState(false);
  const [lookup, setLookup] = useState('');
  const [modal, setModal] = useState<'book' | 'reservation' | null>(null);
  const [editingBook, setEditingBook] = useState<BookRecord | null>(null);
  const [notice, setNotice] = useState('');
  const [operationError, setOperationError] = useState('');
  const [pending, setPending] = useState(false);
  const mutationLock = useRef(false);
  const [revision, setRevision] = useState(0);
  const [fineReceipt, setFineReceipt] = useState<{ loan: Loan; amount: number; receipt: string } | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const [circulationTab, setCirculationTab] = useState<'borrow' | 'return'>('borrow');
  const [borrowId, setBorrowId] = useState('');
  const [borrowBookId, setBorrowBookId] = useState('');
  const [returnLoanId, setReturnLoanId] = useState('');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [loanQuery, setLoanQuery] = useState('');
  const [reservationQuery, setReservationQuery] = useState('');
  const [reservationFilter, setReservationFilter] = useState('All statuses');
  const [bookStatusFilter, setBookStatusFilter] = useState('All books');
  const [loanFilter, setLoanFilter] = useState('All active');
  const [bookForm, setBookForm] = useState(emptyBookForm);
  const [reservationForm, setReservationForm] = useState({ studentId: '', bookId: '' });
  const borrowPatron = usePatronLookup(borrowId, Boolean(librarySessionId) && page === 'circulation', revision);
  const quickPatron = usePatronLookup(lookup, Boolean(librarySessionId), revision);
  const loadQuote = useCallback(async (signal: AbortSignal) => toLoan(await getLoan(returnLoanId, signal)), [returnLoanId]);
  const returnDetails = useRemoteData(loadQuote, librarian && page === 'circulation' && returnLoanId ? librarian.id + ':' + returnLoanId : undefined);
  const returnQuote = returnDetails.data?.id === returnLoanId ? returnDetails.data : null;

  useEffect(() => {
    const restorePage = () => {
      setPage(pageFromPath(window.location.pathname) ?? 'dashboard');
      setMobileNav(false);
      setNotice('');
      setOperationError('');
    };
    window.addEventListener('popstate', restorePage);
    return () => window.removeEventListener('popstate', restorePage);
  }, []);

  useEffect(() => {
    setModal(null); setConfirmation(null); setFineReceipt(null);
    setBorrowId(''); setBorrowBookId(''); setReturnLoanId(''); setLookup('');
    setNotice(''); setOperationError('');
  }, [librarian?.id]);

  useEffect(() => {
    if (!librarian) return;
    const refresh = () => {
      if (!mutationLock.current) {
        if (librarySessionId) {
          void catalogRecords.reload(); void loanRecords.reload(); void policyRecord.reload();
        }
        void reservationRecords.reload(); void demoLoanRecords.reload();
      }
    };
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [librarian, catalogRecords.reload, loanRecords.reload, policyRecord.reload, reservationRecords.reload, demoLoanRecords.reload, librarySessionId]);

  useEffect(() => {
    if (librarian && librarian.role !== 'admin' && page === 'librarians') {
      setPage('dashboard');
      window.history.replaceState({ libraryPage: 'dashboard' }, '', pagePaths.dashboard);
    }
  }, [librarian?.role, page]);

  const activeLoans = loans.filter((loan) => !loan.returned);
  const overdueLoans = activeLoans.filter((loan) => loan.overdueDays > 0);
  const activeReservations = reservations.filter((item) => item.status === 'Active');
  const demoBookById = (id: string) => demoBooks.find((book) => book.id === id);
  const bookById = (id: string) => books.find((book) => book.id === id) ?? demoBookById(id);
  const go = (next: Page) => {
    if (pending || (next === 'librarians' && role !== 'Admin')) return;
    if (next !== page) window.history.pushState({ libraryPage: next }, '', pagePaths[next]);
    setPage(next); setMobileNav(false); setNotice(''); setOperationError('');
  };
  const flash = (message: string) => setNotice(message);
  const runMutation = async (action: () => Promise<void>) => {
    if (mutationLock.current) return;
    mutationLock.current = true; setPending(true); setOperationError(''); setNotice('');
    try { await action(); setRevision((value) => value + 1); }
    catch (error) { setOperationError(error instanceof Error ? error.message : 'Unable to complete the action.'); }
    finally { mutationLock.current = false; setPending(false); }
  };
  const refreshLibrary = async () => {
    await Promise.all([catalogRecords.reload(), loanRecords.reload(), policyRecord.reload(), reservationRecords.reload()]);
  };
  const closeModal = () => { if (!pending) { setModal(null); setOperationError(''); } };
  const startBookForm = (book?: BookRecord) => {
    if (mutationLock.current) return;
    setEditingBook(book ?? null);
    setBookForm(book ? { title: book.title, author: book.author, category: book.category, year: book.year?.toString() ?? '', total: String(book.total), shelf: book.shelf } : emptyBookForm);
    setOperationError(''); setModal('book');
  };
  const saveBook = (event: FormEvent) => {
    event.preventDefault();
    void runMutation(async () => {
      await persistBook(editingBook?.id ?? null, {
        title: bookForm.title, author: bookForm.author, category: bookForm.category,
        year: bookForm.year === '' ? null : Number(bookForm.year), total: Number(bookForm.total), shelf: bookForm.shelf,
      });
      setModal(null); flash(editingBook ? 'Book record updated.' : 'Book added to the catalog.');
      await catalogRecords.reload();
    });
  };
  const processBorrow = (event: FormEvent) => {
    event.preventDefault();
    if (!borrowPatron.patron?.canBorrow || borrowPatron.loading) return;
    void runMutation(async () => {
      await borrowBook(borrowId.trim().toUpperCase(), borrowBookId);
      setBorrowId(''); setBorrowBookId(''); flash('Book checked out successfully.');
      await refreshLibrary();
    });
  };
  const processReturn = () => {
    if (!returnQuote || returnDetails.loading || returnQuote.returned) return;
    const displayed = returnQuote;
    void runMutation(async () => {
      const fresh = toLoan(await getLoan(displayed.id));
      if (fresh.returned || fresh.fineAmount !== displayed.fineAmount || fresh.overdueDays !== displayed.overdueDays) {
        await returnDetails.reload();
        throw new Error('The return details changed. Review the updated amount before confirming.');
      }
      const { loan } = await returnBook(displayed.id, displayed.fineAmount > 0);
      const returned = toLoan({ ...loan, studentNumber: displayed.studentId, studentName: displayed.student, bookTitle: displayed.bookTitle, bookAuthor: displayed.bookAuthor });
      if (loan.fineAmount > 0 && loan.receiptNumber) setFineReceipt({ loan: returned, amount: loan.fineAmount, receipt: loan.receiptNumber });
      setReturnLoanId('');
      flash(loan.fineAmount ? `Return complete. ${money(loan.fineAmount)} collected; receipt ${loan.receiptNumber}.` : 'Return complete. No fine due.');
      await refreshLibrary();
    });
  };
  const saveReservation = (event: FormEvent) => {
    event.preventDefault();
    void runMutation(async () => {
      await createReservation(reservationForm.studentId.trim().toUpperCase(), reservationForm.bookId);
      setModal(null); setReservationForm({ studentId: '', bookId: '' }); flash('Reservation created. The hold expires in three days.');
      await Promise.all([reservationRecords.reload(), catalogRecords.reload()]);
    });
  };
  const requestArchive = (id: string) => {
    const book = bookById(id);
    if (!book) return;
    setConfirmation({
      title: 'Archive this book?', message: `"${book.title}" will be hidden from the active catalog. Its circulation history will be retained.`,
      confirmLabel: 'Archive book', danger: true, onConfirm: () => { void runMutation(async () => {
        await archiveBook(id); flash('Book archived.'); await catalogRecords.reload();
      }); },
    });
  };
  const requestCancelReservation = (id: string) => setConfirmation({
    title: 'Cancel this reservation?', message: 'The hold will be released immediately and retained in reservation history.',
    confirmLabel: 'Cancel reservation', danger: true, onConfirm: () => { void runMutation(async () => {
      await cancelReservation(id); flash('Reservation cancelled.'); await reservationRecords.reload();
    }); },
  });

  if (checking) return <main className="login-page"><RemoteState loading error="" onRetry={() => {}}/></main>;
  if (!librarian) return <LoginPage onSignIn={async (email, password, remember) => {
    await login(email, password, remember);
    window.history.replaceState({ libraryPage: page }, '', pagePaths[page]);
  }} sessionError={sessionError}/>;

  const navItems: { id: Page; label: string; icon: typeof LayoutDashboard; count?: number; admin?: boolean }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'circulation', label: 'Circulation desk', icon: ArrowLeftRight },
    { id: 'books', label: 'Book catalog', icon: Library },
    { id: 'borrowed', label: 'Active borrowers', icon: Users, count: demoLoans.filter((loan) => !loan.returned && loan.overdueDays > 0).length },
    { id: 'reservations', label: 'Reservations', icon: BookmarkCheck },
    { id: 'librarians', label: 'Librarian directory', icon: UserCog, admin: true },
  ];
  const globalStudent = lookup.trim().toUpperCase();
  const lookupStudent = quickPatron.patron;
  const staffName = librarian.fullName || librarian.email;
  const pageRecords = page === 'librarians' ? [staffRecords]
    : page === 'books' ? [catalogRecords]
    : page === 'reservations' ? [reservationRecords, catalogRecords]
    : page === 'borrowed' ? [demoLoanRecords]
    : page === 'circulation' ? [catalogRecords, loanRecords, policyRecord]
    : [catalogRecords, loanRecords, reservationRecords];
  const loading = pageRecords.some((record) => record.loading);
  const dataError = pageRecords.find((record) => record.error)?.error ?? '';
  const ready = pageRecords.every((record) => record.data !== null);
  const retry = () => { for (const record of pageRecords) void record.reload(); };
  return <div className="staff-app">
    <aside className={`staff-sidebar ${mobileNav ? 'staff-sidebar-open' : ''}`}>
      <button className="staff-brand" onClick={() => go('dashboard')}><span className="school-seal staff-brand-seal" aria-label="Frighton University seal"><span className="seal-monogram">F</span><i/><small>1912</small></span><span><strong>FRIGHTON</strong><small>UNIVERSITY LIBRARY</small></span></button>
      <div className="staff-nav-caption">LIBRARY OPERATIONS</div>
      <nav className="staff-nav" aria-label="Library staff navigation">
        {navItems.filter((item) => !item.admin || role === 'Admin').map((item) => { const Icon = item.icon; return <button key={item.id} className={page === item.id ? 'staff-nav-active' : ''} onClick={() => go(item.id)}><Icon size={18}/><span>{item.label}</span>{item.count ? <b className="nav-alert-count">{item.count}</b> : null}</button>; })}
      </nav>
      <div className="sidebar-spacer"/>
      <div className="staff-sidebar-note"><span className="online-dot"/><span><strong>Desk is open</strong><small>Authenticated staff session</small></span><Clock3 size={15}/></div>
      <div className="staff-profile"><span className="staff-avatar">{getInitials(staffName)}</span><span><strong>{staffName}</strong><small>{role}</small></span></div>
    </aside>
    {mobileNav && <button className="staff-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)}/>}
    <main className="staff-main">
      <header className="staff-topbar">
        <button className="staff-menu-button" onClick={() => setMobileNav((open) => !open)} aria-label="Toggle navigation">{mobileNav ? <X size={20}/> : <Menu size={20}/>}</button>
        <div className="staff-breadcrumb"><span>Frighton Library</span><b>/</b><strong>{pageLabels[page]}</strong></div>
        <div className="staff-top-actions">
          <label className="quick-lookup"><Search size={16}/><input aria-label="Quick student ID lookup" placeholder={demoPage ? 'Student lookup at circulation desk' : 'Look up student ID'} disabled={demoPage} value={lookup} onChange={(event) => setLookup(event.target.value)}/><kbd>Ctrl + K</kbd></label>
          {lookup && !demoPage && <div className="lookup-popover">{lookupStudent ? <><span className="staff-avatar small-avatar">{getInitials(lookupStudent.name)}</span><div><strong>{lookupStudent.name}</strong><small>{globalStudent}</small></div><button onClick={() => { setBorrowId(globalStudent); setCirculationTab('borrow'); go('circulation'); setLookup(''); }}>Start checkout <ArrowRight size={14}/></button></> : <span className="lookup-not-found">{quickPatron.loading ? 'Looking up student...' : quickPatron.error || 'Enter a student ID'}</span>}</div>}
          <span className="topbar-divider"/><button className="top-staff"><span className="staff-avatar small-avatar">{getInitials(staffName)}</span><span><strong>{staffName}</strong><small>{role}</small></span><ChevronDown size={14}/></button>
          <button className="top-signout" disabled={pending} onClick={() => { void logout().catch((error: unknown) => setOperationError(error instanceof Error ? error.message : 'Unable to sign out.')); }} aria-label="Sign out"><LogOut size={17}/></button>
        </div>
      </header>
      <div className="staff-content" key={page} aria-busy={pending || loading} inert={pending}>
        {operationError && <div className="inline-warning" role="alert"><AlertTriangle size={17}/>{operationError}</div>}
        {loading || dataError || !ready ? <RemoteState loading={loading} error={dataError} onRetry={retry}/> : <>
        {page === 'dashboard' && <DashboardPage books={books} activeLoans={activeLoans} overdueLoans={overdueLoans} reservations={activeReservations} bookById={bookById} onNavigate={go} onCirculation={(tab) => { setCirculationTab(tab); go('circulation'); }} />}
        {page === 'books' && <BooksPage books={books} query={catalogQuery} setQuery={setCatalogQuery} filter={bookStatusFilter} setFilter={setBookStatusFilter} onAdd={() => startBookForm()} onEdit={startBookForm} onArchive={requestArchive} onReserve={(bookId) => { setReservationForm({ studentId: '', bookId }); setModal('reservation'); }} />}
        {page === 'circulation' && policy && <CirculationPage tab={circulationTab} setTab={setCirculationTab} books={books} activeLoans={activeLoans} loans={loans} policy={policy} borrowId={borrowId} setBorrowId={setBorrowId} borrowBookId={borrowBookId} setBorrowBookId={setBorrowBookId} returnLoanId={returnLoanId} setReturnLoanId={setReturnLoanId} patron={borrowPatron.patron} patronLoading={borrowPatron.loading} patronError={borrowPatron.error} returnQuote={returnQuote} quoteLoading={returnDetails.loading} quoteError={returnDetails.error} pending={pending} bookById={bookById} onBorrow={processBorrow} onReturn={processReturn} onReserve={() => { setReservationForm({ studentId: '', bookId: borrowBookId }); setModal('reservation'); }} />}
        {page === 'borrowed' && <BorrowersPage loans={demoLoans} books={demoBooks} query={loanQuery} setQuery={setLoanQuery} filter={loanFilter} setFilter={setLoanFilter} bookById={demoBookById} onReturn={(id) => { void runMutation(async () => { await returnDemoLoan(id); await demoLoanRecords.reload(); flash('Demo return complete. Changes reset on refresh.'); }); }} />}
        {page === 'reservations' && <ReservationsPage reservations={reservations} query={reservationQuery} setQuery={setReservationQuery} filter={reservationFilter} setFilter={setReservationFilter} bookById={(id) => books.find((book) => book.id === id)} onNew={() => { setReservationForm({ studentId: '', bookId: '' }); setModal('reservation'); }} onCancel={requestCancelReservation} onBorrow={(reservation) => { setBorrowId(reservation.studentId); setBorrowBookId(reservation.bookId); setCirculationTab('borrow'); go('circulation'); }} />}
        {page === 'librarians' && role === 'Admin' && <LibrariansPage staff={staff}/>}
        </>}
      </div>
      <footer className="staff-footer"><span>FRIGHTON UNIVERSITY LIBRARY</span><span>Staff circulation console</span></footer>
    </main>
    {notice && <div className="staff-toast" role="status"><CheckCircle2 size={17}/>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notice"><X size={15}/></button></div>}
    {modal === 'book' && <Modal title={editingBook ? 'Edit book record' : 'Add a book'} subtitle="Maintain the collection catalog." onClose={closeModal}><form className="staff-form" onSubmit={saveBook}>{operationError && <p role="alert" className="inline-warning">{operationError}</p>}<fieldset className="workflow-fields" disabled={pending}><div className="form-grid"><Field label="Book title"><input required value={bookForm.title} onChange={(event) => setBookForm({ ...bookForm, title: event.target.value })} placeholder="Enter title"/></Field><Field label="Author"><input required value={bookForm.author} onChange={(event) => setBookForm({ ...bookForm, author: event.target.value })} placeholder="Author name"/></Field><Field label="Category"><input value={bookForm.category} onChange={(event) => setBookForm({ ...bookForm, category: event.target.value })} placeholder="e.g. History"/></Field><Field label="Publication year"><input type="number" min="1" max="9999" step="1" value={bookForm.year} onChange={(event) => setBookForm({ ...bookForm, year: event.target.value })} placeholder="2026"/></Field><Field label="Total copies"><input type="number" min="0" max="1000000" step="1" required value={bookForm.total} onChange={(event) => setBookForm({ ...bookForm, total: event.target.value })}/></Field><Field label="Shelf location"><input value={bookForm.shelf} onChange={(event) => setBookForm({ ...bookForm, shelf: event.target.value })} placeholder="Humanities  -  823.9"/></Field></div><FormActions onCancel={closeModal} pending={pending} submit={editingBook ? 'Save changes' : 'Add to catalog'}/></fieldset></form></Modal>}
    {modal === 'reservation' && <Modal title="New reservation" subtitle="Hold a catalog title for an eligible student for three days." onClose={closeModal}><form className="staff-form" onSubmit={saveReservation}>{operationError && <p role="alert" className="inline-warning">{operationError}</p>}<fieldset className="workflow-fields" disabled={pending}><Field label="Student ID"><input required value={reservationForm.studentId} onChange={(event) => setReservationForm({ ...reservationForm, studentId: event.target.value.toUpperCase() })} placeholder="STU-2026-0001" maxLength={50}/><small className="field-hint">The student's local account and SIS standing will be verified.</small></Field><Field label="Book"><select required value={reservationForm.bookId} onChange={(event) => setReservationForm({ ...reservationForm, bookId: event.target.value })}><option value="">Choose a title</option>{books.filter((book) => book.active).map((book) => <option value={book.id} key={book.id}>{book.title} {book.available ? ` -  ${book.available} available` : ' -  Out of stock'}</option>)}</select></Field><FormActions onCancel={closeModal} pending={pending} submit="Create reservation"/></fieldset></form></Modal>}

    {confirmation && <Modal title={confirmation.title} subtitle={confirmation.message} onClose={() => setConfirmation(null)}><div className="form-actions confirmation-actions"><button type="button" className="staff-outline" onClick={() => setConfirmation(null)}>Go back</button><button type="button" className={confirmation.danger ? 'staff-primary staff-danger' : 'staff-primary'} onClick={() => { const pending = confirmation; setConfirmation(null); pending.onConfirm(); }}>{confirmation.confirmLabel}</button></div></Modal>}
    {fineReceipt && <Modal title="Fine payment receipt" subtitle="Frighton University Library  -  Circulation desk" onClose={() => setFineReceipt(null)}><div className="receipt-card"><div className="receipt-brand"><span className="school-seal staff-brand-seal receipt-seal" aria-label="Frighton University seal"><span className="seal-monogram">F</span><i/><small>1912</small></span><span><strong>FRIGHTON UNIVERSITY</strong><small>LIBRARY SERVICES</small></span></div><div className="receipt-number-block"><span>RECEIPT NUMBER</span><strong>{fineReceipt.receipt}</strong></div><div className="receipt-fields"><span>Student<strong>{fineReceipt.loan.student}</strong></span><span>Student ID<strong>{fineReceipt.loan.studentId}</strong></span><span>Returned book<strong>{bookById(fineReceipt.loan.bookId)?.title ?? fineReceipt.loan.bookTitle}</strong></span><span>Payment date<strong>{formatDate(fineReceipt.loan.returned!)}</strong></span></div><div className="receipt-total"><span>Fine collected</span><strong>{money(fineReceipt.amount)}</strong></div><p>Thank you. Keep this receipt for your records.</p></div><div className="form-actions"><button className="staff-outline" onClick={() => setFineReceipt(null)}>Close</button><button className="staff-primary" onClick={() => window.print()}><FileText size={15}/> Print receipt</button></div></Modal>}
  </div>;
}
