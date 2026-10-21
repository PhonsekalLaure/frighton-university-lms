import { BookMarked, LoaderCircle, Plus, RotateCcw, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  borrowReservation,
  cancelReservation,
  createReservation,
  getReservationBooks,
  getReservations,
  type Reservation,
  type ReservationBook,
} from '../services/reservations';

type Filter = 'all' | Reservation['status'];

const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All reservations' },
  { value: 'active', label: 'Active' },
  { value: 'fulfilled', label: 'Fulfilled' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
];

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' }).format(new Date(value));
}

export function ReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [books, setBooks] = useState<ReservationBook[]>([]);
  const [filter, setFilter] = useState<Filter>('active');
  const [frightonId, setFrightonId] = useState('');
  const [bookId, setBookId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async (nextFilter = filter) => {
    setLoading(true);
    setError('');
    try {
      const [nextReservations, nextBooks] = await Promise.all([getReservations(nextFilter), getReservationBooks()]);
      setReservations(nextReservations);
      setBooks(nextBooks);
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load reservations.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const activeCount = useMemo(() => reservations.filter((reservation) => reservation.status === 'active').length, [reservations]);

  const changeFilter = (nextFilter: Filter) => {
    setFilter(nextFilter);
    void load(nextFilter);
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!frightonId.trim() || !bookId) return;
    setSubmitting(true);
    setError('');
    try {
      await createReservation(frightonId.trim(), bookId);
      setFrightonId('');
      setBookId('');
      setNotice('Reservation created. The hold expires in three days.');
      await load();
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to create the reservation.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (id: string, action: 'cancel' | 'borrow') => {
    setActionId(id);
    setError('');
    try {
      if (action === 'cancel') {
        await cancelReservation(id);
        setNotice('Reservation cancelled.');
      } else {
        await borrowReservation(id);
        setNotice('Book checked out and reservation fulfilled.');
      }
      await load();
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update the reservation.');
    } finally {
      setActionId('');
    }
  };

  return <>
    <div className="page-heading reservation-heading">
      <div><div className="eyebrow">CIRCULATION DESK</div><h1>Reservations</h1><p>Reserve a title for a student and keep the queue moving.</p></div>
      <span className="reservation-count"><BookMarked size={16} /> {activeCount} active</span>
    </div>

    <section className="panel reservation-create-panel">
      <div className="section-heading"><div><div className="eyebrow">NEW RESERVATION</div><h2>Hold a book for a student</h2></div></div>
      <form className="reservation-form" onSubmit={handleCreate}>
        <label>Student ID<input value={frightonId} onChange={(event) => setFrightonId(event.target.value)} placeholder="e.g. STU-2026-0001" autoComplete="off" required /></label>
        <label>Book<select value={bookId} onChange={(event) => setBookId(event.target.value)} required><option value="">Select a title</option>{books.map((book) => <option key={book.id} value={book.id}>{book.title} — {book.author} ({book.availableCopies} available)</option>)}</select></label>
        <button className="button button-primary" disabled={submitting}>{submitting ? <><LoaderCircle className="spin" size={16} /> Reserving…</> : <><Plus size={16} /> Create reservation</>}</button>
      </form>
      <p className="form-hint">Student standing is checked with SIS. The first active reservation gets priority when a copy is borrowed.</p>
    </section>

    {(notice || error) && <div className={`reservation-message ${error ? 'is-error' : ''}`} role="status"><span>{error || notice}</span><button onClick={() => { setNotice(''); setError(''); }} aria-label="Dismiss message"><X size={15} /></button></div>}

    <section className="panel reservation-list-panel">
      <div className="reservation-list-toolbar"><div className="reservation-filters">{filters.map((item) => <button key={item.value} className={filter === item.value ? 'selected' : ''} onClick={() => changeFilter(item.value)}>{item.label}</button>)}</div><button className="button button-small" onClick={() => void load()} disabled={loading}><RotateCcw size={14} /> Refresh</button></div>
      {loading ? <div className="reservation-empty"><LoaderCircle className="spin" size={21} /> Loading reservations…</div> : reservations.length === 0 ? <div className="reservation-empty"><BookMarked size={24} /><h2>No {filter === 'all' ? '' : filter} reservations</h2><p>Create a reservation above when a student asks staff to hold a title.</p></div> : <div className="reservation-table-wrap"><table className="reservation-table"><thead><tr><th>Student</th><th>Book</th><th>Reserved</th><th>Expires</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{reservations.map((reservation) => <tr key={reservation.id}><td><strong>{reservation.studentName}</strong><small>{reservation.studentNumber}</small></td><td><strong>{reservation.book?.title ?? 'Removed book'}</strong><small>{reservation.book?.author ?? 'No longer in catalog'}</small></td><td>{formatDate(reservation.reservedAt)}</td><td>{reservation.status === 'active' ? formatDate(reservation.expiresAt) : '—'}</td><td><span className={`reservation-status status-${reservation.status}`}>{reservation.status}</span></td><td className="reservation-actions">{reservation.status === 'active' && <>{(reservation.book?.availableCopies ?? 0) > 0 && <button className="text-button" disabled={actionId === reservation.id} onClick={() => void handleAction(reservation.id, 'borrow')}>Borrow now</button>}<button className="text-button danger-button" disabled={actionId === reservation.id} onClick={() => void handleAction(reservation.id, 'cancel')}>{actionId === reservation.id ? 'Working…' : 'Cancel'}</button></>}</td></tr>)}</tbody></table></div>}
    </section>
  </>;
}
