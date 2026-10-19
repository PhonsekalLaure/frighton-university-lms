import { useState } from 'react';
import { ArrowRight, BookOpen, Clock3, Compass, Home, Menu, Search, X } from 'lucide-react';
import { BookCover } from './components/BookCover';
import { CatalogPage } from './pages/CatalogPage';
import { DashboardPage } from './pages/DashboardPage';
import { MyLoansPage } from './pages/MyLoansPage';
import { LoginPage } from './pages/LoginPage';
import { books, type Book } from './data/books';
import { useAuth } from './hooks/useAuth';
import './App.css';

type Page = 'home' | 'catalog' | 'loans';
export default function App() {
  const [page, setPage] = useState<Page>('home');
  const { librarian, checking, sessionError, login, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [notice, setNotice] = useState('');
  const showBook = (book: Book | number) => setSelectedBook(typeof book === 'number' ? books.find((item) => item.id === book) ?? null : book);
  const navigate = (next: Page) => { setPage(next); setMobileNav(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const borrow = () => { setNotice('Loan requests are not available yet. Please visit the library desk.'); setSelectedBook(null); window.setTimeout(() => setNotice(''), 4500); };
  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await logout();
      setSelectedBook(null);
      setMobileNav(false);
      setNotice('');
      setPage('home');
    } catch (error: unknown) {
      setNotice(error instanceof Error ? error.message : 'Unable to sign out. Please try again.');
    } finally {
      setSigningOut(false);
    }
  };
  if (checking) return <main className="auth-loading" role="status">Checking your session...</main>;
  if (!librarian) return <LoginPage sessionError={sessionError} onSignIn={async (email, password, remember) => {
    await login(email, password, remember);
    setPage('home');
    setSelectedBook(null);
    setMobileNav(false);
    setNotice('');
  }} />;
  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <button className="brand-lockup" onClick={() => navigate('home')} aria-label="Frighton University Library home"><span className="brand-mark"><span>F</span></span><span><strong>FRIGHTON</strong><small>UNIVERSITY LIBRARY</small></span></button>
      <div className="nav-label">LIBRARY</div>
      <nav className="side-nav" aria-label="Main navigation">
        <button className={page === 'home' ? 'nav-active' : ''} onClick={() => navigate('home')}><Home size={18}/> Overview</button>
        <button className={page === 'catalog' ? 'nav-active' : ''} onClick={() => navigate('catalog')}><Compass size={18}/> Discover books</button>
        <button className={page === 'loans' ? 'nav-active' : ''} onClick={() => navigate('loans')}><BookOpen size={18}/> My loans <span className="nav-count">2</span></button>
      </nav>
    </aside>
    {mobileNav && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)}/>}
    <main className="main-area">
      <header className="topbar"><div className="topbar-left"><button className="mobile-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="Toggle navigation">{mobileNav ? <X size={20}/> : <Menu size={20}/>}</button><span className="portal-label"><span className="portal-monogram">F</span> FRIGHTON UNIVERSITY LIBRARY</span></div><div className="topbar-right"><button className="top-search" onClick={() => navigate('catalog')}><Search size={16}/><span>Search the collection</span></button><span className="topbar-date"><Clock3 size={14}/> Open today until 9 PM</span><button className="sign-out-button" onClick={() => void handleSignOut()} disabled={signingOut}>{signingOut ? 'Signing out...' : 'Sign out'}</button></div></header>
      <div className="page-content" key={page}>{page === 'home' ? <DashboardPage librarianName={librarian.fullName} onCatalog={() => navigate('catalog')} onBook={showBook}/> : page === 'catalog' ? <CatalogPage onBook={showBook}/> : <MyLoansPage onBook={showBook}/>}</div>
    </main>
    {notice && <div className="toast" role="status">{notice}</div>}
    {selectedBook && <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedBook(null); }}><section className="book-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><button className="dialog-close" onClick={() => setSelectedBook(null)} aria-label="Close book details"><X size={19}/></button><div className="dialog-cover"><BookCover book={selectedBook}/></div><div className="dialog-content"><div className="eyebrow">{selectedBook.category} · {selectedBook.year}</div><h2 id="dialog-title">{selectedBook.title}</h2><p className="dialog-author">by {selectedBook.author}</p><div className={`detail-availability ${selectedBook.copies ? 'is-available' : 'is-unavailable'}`}><span className="availability-pill-dot"/>{selectedBook.copies ? `${selectedBook.copies} copies available` : 'Currently on loan'}<span>·</span>{selectedBook.shelf}</div><p className="dialog-description">{selectedBook.description}</p><div className="dialog-actions"><button className="button button-primary" disabled={!selectedBook.copies} onClick={borrow}>{selectedBook.copies ? 'Request to borrow' : 'Join the waitlist'} <ArrowRight size={16}/></button></div></div></section></div>}
  </div>;
}
