import { useEffect, useState } from 'react';
import { Archive, ArrowUpRight, BookmarkCheck, ListPlus, Plus, Search, Settings2, SlidersHorizontal } from 'lucide-react';
import { BookThumbnail } from '../../components/staff/BookThumbnail';
import type { BookRecord } from '../../types/library';
import { EmptyState, PageHeading, StatusPill } from '../../components/staff/StaffUI';
import { TABLE_PAGE_SIZE, TablePagination } from '../../components/staff/TablePagination';

interface Props {
  books: BookRecord[];
  query: string;
  setQuery: (value: string) => void;
  filter: string;
  setFilter: (value: string) => void;
  onAdd: () => void;
  onEdit: (book: BookRecord) => void;
  onAdjustCopies: (book: BookRecord) => void;
  onArchive: (id: string) => void;
  onBorrow: (id: string) => void;
  onReserve: (id: string) => void;
}

export function BooksPage({ books, query, setQuery, filter, setFilter, onAdd, onEdit,
  onAdjustCopies, onArchive, onBorrow, onReserve }: Props) {
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState('');
  useEffect(() => { setPage(1); }, [query, filter, category]);
  const categories = [...new Set(books.map((book) => book.category).filter(Boolean))].sort();
  const rows = books.filter((book) => (book.title + ' ' + book.author + ' ' + book.category + ' ' + (book.publisher ?? ''))
    .toLowerCase().includes(query.toLowerCase()))
    .filter((book) => !category || book.category === category)
    .filter((book) => filter === 'All books' || (filter === 'Available' ? book.active && book.available > 0
      : filter === 'Out of stock' ? book.active && book.available <= 0 : !book.active));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / TABLE_PAGE_SIZE)));
  const visibleRows = rows.slice((currentPage - 1) * TABLE_PAGE_SIZE, currentPage * TABLE_PAGE_SIZE);

  return <>
    <PageHeading eyebrow="COLLECTIONS" title="Book catalog">
      <button className="staff-primary" onClick={onAdd}><Plus size={17}/> Add a book</button>
    </PageHeading>
    <div className="catalog-summary">
      <span><strong>{books.filter((book) => book.active).length}</strong> active titles</span><i/>
      <span><strong>{books.reduce((sum, book) => sum + (book.active ? book.total : 0), 0)}</strong> total copies</span><i/>
      <span><strong>{books.filter((book) => book.active && book.available <= 0).length}</strong> out of stock</span>
    </div>
    <section className="staff-panel table-panel">
      <div className="table-toolbar catalog-toolbar">
        <label className="table-search"><Search size={16}/><input aria-label="Search catalog" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, author, category, or publisher"/></label>
        <label className="select-filter"><span className="sr-only">Category</span>
          <select aria-label="Category" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">All categories</option>
            {categories.map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label className="select-filter"><SlidersHorizontal size={15}/>
          <select aria-label="Availability" value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option>All books</option><option>Available</option><option>Out of stock</option><option>Archived</option>
          </select>
        </label>
      </div>
      <div className="table-scroll">
        <table className="staff-table"><thead><tr><th>TITLE / AUTHOR</th><th>CATEGORY</th><th>PUBLISHER</th><th>YEAR</th><th>AVAILABLE</th><th>STATUS</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{visibleRows.map((book) => <tr key={book.id}>
            <td><div className="book-cell"><BookThumbnail key={book.id + String(book.hasImage)} book={book}/><span><strong>{book.title}</strong><small>{book.author}</small></span></div></td>
            <td>{book.category}</td><td>{book.publisher || '-'}</td><td>{book.year || '-'}</td>
            <td><strong>{book.available}</strong><span className="copy-total"> / {book.total}</span></td>
            <td><StatusPill status={!book.active ? 'Archived' : book.available > 0 ? 'Available' : 'Out of stock'}/></td>
            <td><div className="row-actions">
              <button title="Edit record" aria-label={'Edit ' + book.title} onClick={() => onEdit(book)}><Settings2 size={16}/></button>
              <button title="Adjust copies" aria-label={'Adjust copies of ' + book.title} onClick={() => onAdjustCopies(book)}><ListPlus size={16}/></button>
              {book.active && <>
                {book.available > 0
                  ? <button title="Borrow this book" aria-label={'Borrow ' + book.title} onClick={() => onBorrow(book.id)}><ArrowUpRight size={16}/></button>
                  : <button title="Reserve this title" aria-label={'Reserve ' + book.title} onClick={() => onReserve(book.id)}><BookmarkCheck size={16}/></button>}
                <button className="row-archive" title="Archive title" aria-label={'Archive ' + book.title} onClick={() => onArchive(book.id)}><Archive size={15}/></button>
              </>}
            </div></td>
          </tr>)}</tbody>
        </table>
        {rows.length === 0 && <EmptyState icon={<Search size={20}/>} title="No titles found" text="Try another search or filter."/>}
      </div>
      <div className="table-bottom"><span>Stock counts update when items are checked out or returned</span><TablePagination count={rows.length} page={currentPage} onPageChange={setPage}/></div>
    </section>
  </>;
}
