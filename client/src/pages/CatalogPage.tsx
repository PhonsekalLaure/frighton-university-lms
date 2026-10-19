import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { BookCover } from '../components/BookCover';
import { books } from '../data/books';
import type { Book } from '../data/books';

const categories = ['All books', ...Array.from(new Set(books.map((book) => book.category)))];
export function CatalogPage({ onBook }: { onBook: (book: Book) => void }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All books');
  const [availableOnly, setAvailableOnly] = useState(false);
  const filtered = useMemo(() => books.filter((book) => (category === 'All books' || book.category === category) && (!availableOnly || book.copies > 0) && `${book.title} ${book.author} ${book.category}`.toLowerCase().includes(search.toLowerCase())), [search, category, availableOnly]);
  return <>
    <div className="page-heading"><div className="eyebrow">THE FRIGHTON COLLECTION</div><h1>Discover books</h1></div>
    <div className="catalog-tools"><label className="search-box"><Search size={18}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search titles, authors, subjects…" aria-label="Search catalog"/>{search && <button onClick={() => setSearch('')} aria-label="Clear search"><X size={16}/></button>}</label><label className="availability-filter"><input type="checkbox" checked={availableOnly} onChange={(event) => setAvailableOnly(event.target.checked)}/><SlidersHorizontal size={15}/> Available now</label></div>
    <div className="category-filters" aria-label="Filter by category">{categories.map((item) => <button key={item} className={`filter-chip ${item === category ? 'selected' : ''}`} onClick={() => setCategory(item)}>{item}</button>)}</div>
    <div className="results-caption"><span><strong>{filtered.length}</strong> titles to explore</span><span>Curated for curious minds</span></div>
    {filtered.length ? <div className="book-grid">{filtered.map((book) => <button className="book-card" key={book.id} onClick={() => onBook(book)}><div className="book-card-cover-wrap"><BookCover book={book}/><span className={`availability-pill ${book.copies ? 'is-available' : 'is-unavailable'}`}><i/>{book.copies ? 'Available' : 'On loan'}</span></div><span className="book-card-copy"><span className="book-category">{book.category} · {book.year}</span><strong>{book.title}</strong><small>{book.author}</small></span></button>)}</div> : <div className="empty-state"><Search size={24}/><h2>No books found</h2><p>Try a different title, author, or category.</p><button className="text-button" onClick={() => { setSearch(''); setCategory('All books'); setAvailableOnly(false); }}>Clear filters</button></div>}
  </>;
}
