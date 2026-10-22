import { useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeftRight, ArrowRight, CheckCircle2, ChevronDown, Clock3, FileText,
  LayoutDashboard, Library, LogOut, Menu, Search, ShieldCheck, UserCog, Users, X,
} from 'lucide-react';
import type { BookRecord, Loan, Page, Reservation, Staff, StaffRole } from './types/library';
import { initialBooks } from './data/librarySeed';
import { initialLoans } from './data/loans';
import { initialReservations } from './data/reservations';
import { initialStaff } from './data/staff';
import { students } from './data/students';
import { daysLate, formatDate, getInitials, money, todayISO } from './utils/library';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './features/library/DashboardPage';
import { BooksPage } from './features/library/BooksPage';
import { CirculationPage } from './features/library/CirculationPage';
import { BorrowersPage } from './features/library/BorrowersPage';
import { ReservationsPage } from './features/library/ReservationsPage';
import { LibrariansPage } from './features/library/LibrariansPage';
import { Field, FormActions, Modal } from './components/staff/StaffUI';
import './App.css';
import './staff.css';

const pageLabels: Record<Page, string> = {
  dashboard: 'Dashboard',
  books: 'Book catalog',
  circulation: 'Circulation desk',
  borrowed: 'Active borrowers',
  reservations: 'Reservations',
  librarians: 'Librarian management',
};
export default function App() {
  const [signedIn, setSignedIn] = useState(false);
  const [role, setRole] = useState<StaffRole>('Librarian');
  const [page, setPage] = useState<Page>('dashboard');
  const [books, setBooks] = useState<BookRecord[]>(initialBooks);
  const [loans, setLoans] = useState<Loan[]>(initialLoans);
  const [reservations, setReservations] = useState<Reservation[]>(() => initialReservations.map<Reservation>((item) => item.status === 'Active' && item.expires < todayISO() ? { ...item, status: 'Expired' } : item));
  const [staff, setStaff] = useState<Staff[]>(initialStaff);
  const [mobileNav, setMobileNav] = useState(false);
  const [lookup, setLookup] = useState('');
  const [modal, setModal] = useState<'book' | 'reservation' | 'librarian' | null>(null);
  const [editingBook, setEditingBook] = useState<BookRecord | null>(null);
  const [notice, setNotice] = useState('');
  const [fineReceipt, setFineReceipt] = useState<{ loan: Loan; amount: number; receipt: string } | null>(null);
  const [circulationTab, setCirculationTab] = useState<'borrow' | 'return'>('borrow');
  const [borrowId, setBorrowId] = useState('');
  const [borrowBookId, setBorrowBookId] = useState('');
  const [returnLoanId, setReturnLoanId] = useState('');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [loanQuery, setLoanQuery] = useState('');
  const [reservationQuery, setReservationQuery] = useState('');
  const [reservationFilter, setReservationFilter] = useState('All');
  const [bookStatusFilter, setBookStatusFilter] = useState('All books');
  const [loanFilter, setLoanFilter] = useState('All active');
  const [bookForm, setBookForm] = useState({ title: '', author: '', category: 'Literature', year: '', total: '1', shelf: '' });
  const [reservationForm, setReservationForm] = useState({ studentId: '', bookId: '' });
  const [staffForm, setStaffForm] = useState({ name: '', email: '' });

  const activeLoans = useMemo(() => loans.filter((loan) => !loan.returned), [loans]);
  const overdueLoans = activeLoans.filter((loan) => daysLate(loan.due) > 0);
  const activeReservations = reservations.filter((reservation) => reservation.status === 'Active');
  const bookById = (id: number) => books.find((book) => book.id === id);
  const go = (next: Page) => { setPage(next); setMobileNav(false); setNotice(''); };
  const flash = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 3600); };
  const studentFor = (id: string) => students[id.trim().toUpperCase()];

  const startBookForm = (book?: BookRecord) => {
    setEditingBook(book ?? null);
    setBookForm(book ? { title: book.title, author: book.author, category: book.category, year: String(book.year), total: String(book.total), shelf: book.shelf } : { title: '', author: '', category: 'Literature', year: '', total: '1', shelf: '' });
    setModal('book');
  };
  const saveBook = (event: FormEvent) => {
    event.preventDefault();
    const total = Math.max(0, Number(bookForm.total) || 0);
    if (editingBook) {
      const checkedOut = editingBook.total - editingBook.available;
      if (total < checkedOut) return flash(`Total copies cannot be less than the ${checkedOut} currently checked out.`);
      setBooks((items) => items.map((book) => book.id === editingBook.id ? { ...book, ...bookForm, year: Number(bookForm.year) || 0, total, available: Math.max(0, total - checkedOut), shelf: bookForm.shelf || 'Unassigned' } : book));
      flash('Book record updated.');
    } else {
      const id = Math.max(0, ...books.map((book) => book.id)) + 1;
      setBooks((items) => [{ id, ...bookForm, year: Number(bookForm.year) || 0, total, available: total, shelf: bookForm.shelf || 'Unassigned', active: true }, ...items]);
      flash('Book added to the catalog.');
    }
    setModal(null);
  };
  const processBorrow = (event: FormEvent) => {
    event.preventDefault();
    const student = studentFor(borrowId);
    const bookId = Number(borrowBookId);
    const book = bookById(bookId);
    if (!student || !book) return flash('Check the student ID and selected book.');
    if (activeLoans.some((loan) => loan.studentId === borrowId.trim().toUpperCase() && daysLate(loan.due) > 0)) return flash('This student has an overdue item. Resolve it before borrowing.');
    if (activeLoans.filter((loan) => loan.studentId === borrowId.trim().toUpperCase()).length >= 3) return flash('This student has reached the three-book loan limit.');
    if (!book.active || book.available < 1) return flash('There are no copies available. Create a reservation instead.');
    const borrowed = todayISO();
    const due = new Date(`${borrowed}T12:00:00`); due.setDate(due.getDate() + 14);
    const studentId = borrowId.trim().toUpperCase();
    setBooks((items) => items.map((item) => item.id === bookId ? { ...item, available: item.available - 1 } : item));
    setLoans((items) => [{ id: `LN-${1062 + items.length}`, studentId, student: student.name, bookId, borrowed, due: due.toLocaleDateString('en-CA') }, ...items]);
    setReservations((items) => items.map((reservation) => reservation.studentId === studentId && reservation.bookId === bookId && reservation.status === 'Active' ? { ...reservation, status: 'Fulfilled' } : reservation));
    setBorrowId(''); setBorrowBookId(''); flash(` - ${book.title} -  checked out to ${student.name}.`);
  };
  const processReturn = () => {
    const loan = activeLoans.find((item) => item.id === returnLoanId);
    if (!loan) return flash('Choose an active loan to return.');
    const lateDays = daysLate(loan.due);
    const fine = lateDays * 5;
    const receipt = fine > 0 ? `RCP-${todayISO().replaceAll('-', '')}-${Math.floor(100000 + Math.random() * 899999)}` : undefined;
    setBooks((items) => items.map((book) => book.id === loan.bookId ? { ...book, available: Math.min(book.total, book.available + 1) } : book));
    setLoans((items) => items.map((item) => item.id === loan.id ? { ...item, returned: todayISO(), finePaid: fine, receipt } : item));
    if (fine > 0 && receipt) setFineReceipt({ loan, amount: fine, receipt });
    setReturnLoanId(''); flash(fine ? `Return complete. ${money(fine)} collected  -  receipt ${receipt}.` : 'Return complete. No fine due.');
  };
  const saveReservation = (event: FormEvent) => {
    event.preventDefault();
    const studentId = reservationForm.studentId.trim().toUpperCase();
    const student = studentFor(studentId);
    const bookId = Number(reservationForm.bookId);
    const book = bookById(bookId);
    if (!student || !book) return flash('Check the student ID and selected book.');
    if (reservations.some((item) => item.studentId === studentId && item.bookId === bookId && item.status === 'Active')) return flash('This student already has an active reservation for that title.');
    const expires = new Date(`${todayISO()}T12:00:00`); expires.setDate(expires.getDate() + 3);
    setReservations((items) => [{ id: `RS-${262 + items.length}`, studentId, student: student.name, bookId, reserved: todayISO(), expires: expires.toLocaleDateString('en-CA'), status: 'Active' }, ...items]);
    setModal(null); setReservationForm({ studentId: '', bookId: '' }); flash('Reservation created for three days.');
  };
  const saveStaff = (event: FormEvent) => {
    event.preventDefault();
    setStaff((items) => [{ name: staffForm.name, email: staffForm.email, active: true, since: new Date().toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' }) }, ...items]);
    setStaffForm({ name: '', email: '' }); setModal(null); flash('Librarian added to the demo directory.');
  };

  if (!signedIn) return <LoginPage onSignIn={async (email) => { setRole(email.toLowerCase().includes('admin') ? 'Admin' : 'Librarian'); setSignedIn(true); }}/>

  const navItems: { id: Page; label: string; icon: typeof LayoutDashboard; count?: number; admin?: boolean }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'circulation', label: 'Circulation desk', icon: ArrowLeftRight },
    { id: 'books', label: 'Book catalog', icon: Library },
    { id: 'borrowed', label: 'Active borrowers', icon: Users, count: overdueLoans.length },
    { id: 'reservations', label: 'Reservations', icon: BookmarkCheck },
    { id: 'librarians', label: 'Librarian management', icon: UserCog, admin: true },
  ];
  const globalStudent = lookup.trim().toUpperCase();
  const lookupStudent = globalStudent ? studentFor(globalStudent) : undefined;

  return <div className="staff-app">
    <aside className={`staff-sidebar ${mobileNav ? 'staff-sidebar-open' : ''}`}>
      <button className="staff-brand" onClick={() => go('dashboard')}><span className="school-seal staff-brand-seal" aria-label="Frighton University seal"><span className="seal-monogram">F</span><i/><small>1912</small></span><span><strong>FRIGHTON</strong><small>UNIVERSITY LIBRARY</small></span></button>
      <div className="staff-nav-caption">LIBRARY OPERATIONS</div>
      <nav className="staff-nav" aria-label="Library staff navigation">
        {navItems.filter((item) => !item.admin || role === 'Admin').map((item) => { const Icon = item.icon; return <button key={item.id} className={page === item.id ? 'staff-nav-active' : ''} onClick={() => go(item.id)}><Icon size={18}/><span>{item.label}</span>{item.count ? <b className="nav-alert-count">{item.count}</b> : null}</button>; })}
      </nav>
      <div className="sidebar-spacer"/>
      <div className="staff-sidebar-note"><span className="online-dot"/><span><strong>Desk is open</strong><small>Circulation is ready</small></span><Clock3 size={15}/></div>
      <div className="staff-profile"><span className="staff-avatar">{role === 'Admin' ? 'AH' : 'JM'}</span><span><strong>{role === 'Admin' ? 'Amelia Hart' : 'Julian Moore'}</strong><small>{role}  -  Demo mode</small></span></div>
    </aside>
    {mobileNav && <button className="staff-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)}/>}
    <main className="staff-main">
      <header className="staff-topbar">
        <button className="staff-menu-button" onClick={() => setMobileNav((open) => !open)} aria-label="Toggle navigation">{mobileNav ? <X size={20}/> : <Menu size={20}/>}</button>
        <div className="staff-breadcrumb"><span>Frighton Library</span><b>/</b><strong>{pageLabels[page]}</strong></div>
        <div className="staff-top-actions">
          <label className="quick-lookup"><Search size={16}/><input aria-label="Quick student ID lookup" placeholder="Look up student ID" value={lookup} onChange={(event) => setLookup(event.target.value)}/><kbd>Ctrl + K</kbd></label>
          {lookup && <div className="lookup-popover">{lookupStudent ? <><span className="staff-avatar small-avatar">{getInitials(lookupStudent.name)}</span><div><strong>{lookupStudent.name}</strong><small>{globalStudent}</small></div><button onClick={() => { setBorrowId(globalStudent); setCirculationTab('borrow'); go('circulation'); setLookup(''); }}>Start checkout <ArrowRight size={14}/></button></> : <span className="lookup-not-found">{globalStudent.length > 5 ? 'No student record found' : 'Enter a student ID'}</span>}</div>}
          <span className="topbar-divider"/><button className="top-staff"><span className="staff-avatar small-avatar">{role === 'Admin' ? 'AH' : 'JM'}</span><span><strong>{role === 'Admin' ? 'Amelia Hart' : 'Julian Moore'}</strong><small>{role}</small></span><ChevronDown size={14}/></button>
          <button className="top-signout" onClick={() => setSignedIn(false)} aria-label="Sign out"><LogOut size={17}/></button>
        </div>
      </header>
      <div className="staff-content" key={page}>
        {page === 'dashboard' && <DashboardPage books={books} activeLoans={activeLoans} overdueLoans={overdueLoans} reservations={activeReservations} bookById={bookById} onNavigate={go} onCirculation={(tab) => { setCirculationTab(tab); go('circulation'); }} />}
        {page === 'books' && <BooksPage books={books} query={catalogQuery} setQuery={setCatalogQuery} filter={bookStatusFilter} setFilter={setBookStatusFilter} onAdd={() => startBookForm()} onEdit={startBookForm} onArchive={(id) => { setBooks((items) => items.map((book) => book.id === id ? { ...book, active: false } : book)); flash('Book archived. Its circulation history is retained.'); }} onReserve={(bookId) => { setReservationForm({ studentId: '', bookId: String(bookId) }); setModal('reservation'); }} />}
        {page === 'circulation' && <CirculationPage tab={circulationTab} setTab={setCirculationTab} books={books} activeLoans={activeLoans} loans={loans} borrowId={borrowId} setBorrowId={setBorrowId} borrowBookId={borrowBookId} setBorrowBookId={setBorrowBookId} returnLoanId={returnLoanId} setReturnLoanId={setReturnLoanId} studentFor={studentFor} bookById={bookById} onBorrow={processBorrow} onReturn={processReturn} onReserve={() => { setReservationForm({ studentId: borrowId, bookId: borrowBookId }); setModal('reservation'); }} />}
        {page === 'borrowed' && <BorrowersPage loans={loans} books={books} query={loanQuery} setQuery={setLoanQuery} filter={loanFilter} setFilter={setLoanFilter} bookById={bookById} onReturn={(id) => { setReturnLoanId(id); setCirculationTab('return'); go('circulation'); }} />}
        {page === 'reservations' && <ReservationsPage reservations={reservations} query={reservationQuery} setQuery={setReservationQuery} filter={reservationFilter} setFilter={setReservationFilter} bookById={bookById} onNew={() => { setReservationForm({ studentId: '', bookId: '' }); setModal('reservation'); }} onCancel={(id) => { setReservations((items) => items.map((item) => item.id === id ? { ...item, status: 'Cancelled' } : item)); flash('Reservation cancelled.'); }} onBorrow={(reservation) => { setBorrowId(reservation.studentId); setBorrowBookId(String(reservation.bookId)); setCirculationTab('borrow'); go('circulation'); }} />}
        {page === 'librarians' && <LibrariansPage staff={staff} onAdd={() => setModal('librarian')} onToggle={(email) => setStaff((items) => items.map((person) => person.email === email ? { ...person, active: !person.active } : person))} />}
      </div>
      <footer className="staff-footer"><span>FRIGHTON UNIVERSITY LIBRARY</span><span>Staff circulation console <i> - </i> Demo data</span></footer>
    </main>
    {notice && <div className="staff-toast" role="status"><CheckCircle2 size={17}/>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notice"><X size={15}/></button></div>}
    {modal === 'book' && <Modal title={editingBook ? 'Edit book record' : 'Add a book'} subtitle="Maintain the collection catalog." onClose={() => setModal(null)}><form className="staff-form" onSubmit={saveBook}><div className="form-grid"><Field label="Book title"><input required value={bookForm.title} onChange={(event) => setBookForm({ ...bookForm, title: event.target.value })} placeholder="Enter title"/></Field><Field label="Author"><input required value={bookForm.author} onChange={(event) => setBookForm({ ...bookForm, author: event.target.value })} placeholder="Author name"/></Field><Field label="Category"><input value={bookForm.category} onChange={(event) => setBookForm({ ...bookForm, category: event.target.value })} placeholder="e.g. History"/></Field><Field label="Publication year"><input type="number" min="0" value={bookForm.year} onChange={(event) => setBookForm({ ...bookForm, year: event.target.value })} placeholder="2026"/></Field><Field label="Total copies"><input type="number" min="0" required value={bookForm.total} onChange={(event) => setBookForm({ ...bookForm, total: event.target.value })}/></Field><Field label="Shelf location"><input value={bookForm.shelf} onChange={(event) => setBookForm({ ...bookForm, shelf: event.target.value })} placeholder="Humanities  -  823.9"/></Field></div><FormActions onCancel={() => setModal(null)} submit={editingBook ? 'Save changes' : 'Add to catalog'}/></form></Modal>}
    {modal === 'reservation' && <Modal title="New reservation" subtitle="Hold a title for a student for three days." onClose={() => setModal(null)}><form className="staff-form" onSubmit={saveReservation}><Field label="Student ID"><input required value={reservationForm.studentId} onChange={(event) => setReservationForm({ ...reservationForm, studentId: event.target.value.toUpperCase() })} placeholder="STU-2026-0001"/><small className="field-hint">Demo IDs: STU-2026-0001 through 0004</small></Field><Field label="Book"><select required value={reservationForm.bookId} onChange={(event) => setReservationForm({ ...reservationForm, bookId: event.target.value })}><option value="">Choose a title</option>{books.filter((book) => book.active).map((book) => <option value={book.id} key={book.id}>{book.title} {book.available ? ` -  ${book.available} available` : ' -  Out of stock'}</option>)}</select></Field><FormActions onCancel={() => setModal(null)} submit="Create reservation"/></form></Modal>}
    {modal === 'librarian' && <Modal title="Add librarian" subtitle="Create a staff directory entry for this demo." onClose={() => setModal(null)}><form className="staff-form" onSubmit={saveStaff}><Field label="Full name"><input required value={staffForm.name} onChange={(event) => setStaffForm({ ...staffForm, name: event.target.value })} placeholder="Full name"/></Field><Field label="University email"><input required type="email" value={staffForm.email} onChange={(event) => setStaffForm({ ...staffForm, email: event.target.value })} placeholder="name@frighton.edu"/></Field><div className="demo-callout"><ShieldCheck size={17}/> Frontend demo only. Account creation and password setup require a secured backend.</div><FormActions onCancel={() => setModal(null)} submit="Add librarian"/></form></Modal>}
    {fineReceipt && <Modal title="Fine payment receipt" subtitle="Frighton University Library  -  Circulation desk" onClose={() => setFineReceipt(null)}><div className="receipt-card"><div className="receipt-brand"><span className="school-seal staff-brand-seal receipt-seal" aria-label="Frighton University seal"><span className="seal-monogram">F</span><i/><small>1912</small></span><span><strong>FRIGHTON UNIVERSITY</strong><small>LIBRARY SERVICES</small></span></div><div className="receipt-number-block"><span>RECEIPT NUMBER</span><strong>{fineReceipt.receipt}</strong></div><div className="receipt-fields"><span>Student<strong>{fineReceipt.loan.student}</strong></span><span>Student ID<strong>{fineReceipt.loan.studentId}</strong></span><span>Returned book<strong>{bookById(fineReceipt.loan.bookId)?.title}</strong></span><span>Payment date<strong>{formatDate(todayISO())}</strong></span></div><div className="receipt-total"><span>Fine collected</span><strong>{money(fineReceipt.amount)}</strong></div><p>Thank you. Keep this receipt for your records.</p></div><div className="form-actions"><button className="staff-outline" onClick={() => setFineReceipt(null)}>Close</button><button className="staff-primary" onClick={() => window.print()}><FileText size={15}/> Print receipt</button></div></Modal>}
  </div>;
}
