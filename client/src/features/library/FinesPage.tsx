import { useState } from 'react';
import { ArrowLeftRight, Coins, Search } from 'lucide-react';
import type { Loan } from '../../types/library';
import { formatDate, getInitials, money } from '../../utils/library';
import { finesCollectedToday, paidFines, pendingFines } from '../../utils/loanSummary';
import { EmptyState, PageHeading, StatusPill } from '../../components/staff/StaffUI';
import { TABLE_PAGE_SIZE, TablePagination } from '../../components/staff/TablePagination';

export function FinesPage({ loans, onReturn }: { loans: Loan[]; onReturn: (id: string) => void }) {
  const [view, setView] = useState<'pending' | 'history'>('pending');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const pending = pendingFines(loans);
  const history = paidFines(loans);
  const rows = (view === 'pending' ? pending : history)
    .filter((loan) => (loan.student + ' ' + loan.studentId + ' ' + loan.bookTitle + ' ' + (loan.receipt ?? ''))
      .toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => view === 'pending' ? b.fineAmount - a.fineAmount
      : Date.parse(b.finePaidAt!) - Date.parse(a.finePaidAt!));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / TABLE_PAGE_SIZE)));
  const visible = rows.slice((currentPage - 1) * TABLE_PAGE_SIZE, currentPage * TABLE_PAGE_SIZE);
  const total = (items: Loan[]) => items.reduce((sum, loan) => sum + loan.fineAmount, 0);

  return <>
    <PageHeading eyebrow="FINE COLLECTION" title="Student fines"/>
    <div className="fine-summary-grid">
      <section className="borrower-mini-stat"><span>Pending fines</span><strong className="red-value">{money(total(pending))}</strong><small>{pending.length} unpaid loans</small></section>
      <section className="borrower-mini-stat"><span>Collected today</span><strong>{money(finesCollectedToday(loans))}</strong><small>Asia/Manila</small></section>
      <section className="borrower-mini-stat"><span>Total collected</span><strong>{money(total(history))}</strong><small>{history.length} paid fines</small></section>
    </div>
    <p className="field-hint">Pending fines on unreturned books continue to accrue. Staff collect the final amount when processing the return.</p>
    <div className="borrower-tabs">
      <button className={view === 'pending' ? 'borrower-tab-active' : ''} onClick={() => { setView('pending'); setPage(1); }}>Pending fines <b>{pending.length}</b></button>
      <button className={view === 'history' ? 'borrower-tab-active' : ''} onClick={() => { setView('history'); setPage(1); }}>Payment history <b>{history.length}</b></button>
    </div>
    <section className="staff-panel table-panel">
      <div className="table-toolbar">
        <label className="table-search"><Search size={16}/><input aria-label="Search student fines" value={query}
          onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search student, ID, book, or receipt"/></label>
        <span className="fine-view-total">{money(total(rows))} in this view</span>
      </div>
      <div className="table-scroll">
        <table className="staff-table">
          <thead><tr><th>STUDENT</th><th>BOOK</th><th>DUE DATE</th><th>{view === 'pending' ? 'OVERDUE DAYS' : 'PAID ON'}</th><th>FINE</th><th>{view === 'pending' ? 'STATUS / ACTION' : 'RECEIPT'}</th></tr></thead>
          <tbody>{visible.map((loan) => <tr key={loan.id}>
            <td><div className="student-cell"><span className="staff-avatar tiny-avatar">{getInitials(loan.student)}</span><span><strong>{loan.student}</strong><small>{loan.studentId}</small></span></div></td>
            <td><div className="simple-book-cell"><strong>{loan.bookTitle || 'Archived title'}</strong><small>{loan.bookAuthor}</small></div></td>
            <td>{formatDate(loan.due)}</td>
            <td>{view === 'pending' ? loan.overdueDays + ' days' : formatDate(loan.finePaidAt!)}</td>
            <td><strong className={view === 'pending' ? 'fine-amount' : 'history-fine'}>{money(loan.fineAmount)}</strong></td>
            <td>{view === 'pending' ? <div className="fine-row-actions"><StatusPill status={loan.returned ? 'Unpaid' : 'Accruing'}/>
              {!loan.returned && <button className="staff-text-link" onClick={() => onReturn(loan.id)}><ArrowLeftRight size={14}/> Process return</button>}
            </div> : <span className="receipt-number">{loan.receipt || '-'}</span>}</td>
          </tr>)}</tbody>
        </table>
        {rows.length === 0 && <EmptyState icon={<Coins size={20}/>}
          title={query ? 'No matching fines' : view === 'pending' ? 'No pending fines' : 'No fine payments yet'}
          text={query ? 'Try another student, book, or receipt.' : view === 'pending' ? 'No students have unpaid loan fines.' : 'Collected fines and receipts will appear here.'}/>}
      </div>
      <div className="table-bottom"><span>{view === 'pending' ? 'Unpaid and accruing loan fines' : 'Recorded fine payments'}</span><TablePagination count={rows.length} page={currentPage} onPageChange={setPage}/></div>
    </section>
  </>;
}
