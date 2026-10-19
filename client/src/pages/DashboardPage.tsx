import { ArrowRight, Bell, CalendarDays, Clock3 } from 'lucide-react';
import { BookCover } from '../components/BookCover';
import { EligibilityCard } from '../components/EligibilityCard';
import { books } from '../data/books';
import { student } from '../data/student';

export function DashboardPage({ librarianName, onCatalog, onBook }: { librarianName: string; onCatalog: () => void; onBook: (id: number) => void }) {
  const loanBooks = [books[0], books[3]];
  return <>
    <div className="welcome-row">
      <div><div className="eyebrow">FRIGHTON UNIVERSITY LIBRARY</div><h1>Welcome, {librarianName}</h1></div>
      <button className="button button-primary" onClick={onCatalog}>Explore the catalog <ArrowRight size={16} /></button>
    </div>
    <div className="dashboard-grid">
      <div className="dashboard-main">
        <EligibilityCard />
        <section className="panel loans-panel">
          <div className="section-heading"><div><div className="eyebrow">ON YOUR SHELF</div><h2>Your current loans</h2></div><button className="text-button" onClick={onCatalog}>All loans <ArrowRight size={15} /></button></div>
          <div className="loan-list">{loanBooks.map((book, index) => <button className="loan-item" key={book.id} onClick={() => onBook(book.id)}><BookCover book={book} className="loan-cover"/><span className="loan-info"><strong>{book.title}</strong><small>{book.author}</small><span className={`due-label ${index === 0 ? 'due-soon' : ''}`}><CalendarDays size={13} /> Due {index === 0 ? 'Oct 24' : 'Nov 02'}</span></span><ArrowRight size={17} className="loan-arrow" /></button>)}</div>
          <div className="loan-summary"><span><Clock3 size={15} /> {student.borrowed} of {student.borrowingLimit} books checked out</span><span className="summary-track"><i /></span></div>
        </section>
      </div>
      <aside className="dashboard-side">
        <section className="panel updates-panel"><div className="section-heading"><div><div className="eyebrow">FROM THE LIBRARY</div><h2>What’s new</h2></div><Bell size={17} className="muted-icon" /></div>
          <div className="update-feature"><div className="update-art"><span className="library-monogram">FU</span><span className="campus-caption">KNOWLEDGE · COMMUNITY · DISCOVERY</span></div><div className="update-meta">UNIVERSITY LIBRARY</div><h3>Library hours</h3></div>
          <div className="update-note"><span className="note-dot"/><div><strong>Monday – Friday</strong><p>8:00 AM – 9:00 PM</p></div></div>
        </section>
      </aside>
    </div>
    <section className="discover-strip"><div><span className="discover-icon">✳</span><span><strong>University Library Collection</strong></span></div><button className="button button-outline" onClick={onCatalog}>Browse books <ArrowRight size={15} /></button></section>
  </>;
}
