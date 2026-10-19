import { ArrowUpRight, CalendarDays, CheckCircle2 } from 'lucide-react';
import { BookCover } from '../components/BookCover';
import { books } from '../data/books';

export function MyLoansPage({ onBook }: { onBook: (id: number) => void }) {
  const current = [books[0], books[3]];
  const past = [{ book: books[4], date: 'Returned Sep 18, 2026' }, { book: books[5], date: 'Returned Aug 02, 2026' }];
  return <>
    <div className="page-heading"><div className="eyebrow">YOUR READING HISTORY</div><h1>My loans</h1></div>
    <div className="loan-stats"><div className="panel stat-card"><span className="stat-icon teal"><BookCover book={books[0]} className="tiny-book"/></span><span><small>Currently borrowed</small><strong>2 <em>of 5 books</em></strong></span></div><div className="panel stat-card"><span className="stat-icon gold"><CalendarDays size={20}/></span><span><small>Next due date</small><strong>Oct 24 <em>in 5 days</em></strong></span></div><div className="panel stat-card"><span className="stat-icon green"><CheckCircle2 size={20}/></span><span><small>Returned on time</small><strong>8 <em>this year</em></strong></span></div></div>
    <section className="panel loan-table-panel"><div className="section-heading"><div><div className="eyebrow">CURRENTLY BORROWED</div><h2>On your shelf</h2></div><span className="count-pill">2 books</span></div>{current.map((book, index) => <div className="full-loan-row" key={book.id}><BookCover book={book} className="full-loan-cover"/><div className="full-loan-main"><strong>{book.title}</strong><span>{book.author}</span><small>{book.shelf}</small></div><div className="full-loan-due"><span className={`status-dot ${index === 0 ? 'soon' : ''}`}/><span><strong>{index === 0 ? 'Due soon' : 'On loan'}</strong><small><CalendarDays size={13}/> Due {index === 0 ? 'October 24, 2026' : 'November 2, 2026'}</small></span></div><button className="icon-button" aria-label={`Open ${book.title}`} onClick={() => onBook(book.id)}><ArrowUpRight size={17}/></button></div>)}</section>
    <section className="panel history-panel"><div className="section-heading"><div><div className="eyebrow">A LITTLE NOSTALGIA</div><h2>Recently returned</h2></div></div>{past.map(({ book, date }) => <button className="history-row" key={book.id} onClick={() => onBook(book.id)}><BookCover book={book} className="history-cover"/><span><strong>{book.title}</strong><small>{book.author}</small></span><span className="returned-label"><CheckCircle2 size={14}/>{date}</span></button>)}</section>
  </>;
}
