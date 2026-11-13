import { Fragment, useState } from 'react';
import { BookCheck, FileText, Search, SlidersHorizontal, Users } from 'lucide-react';
import type { BookRecord, Loan } from '../../types/library';
import { formatDate, getInitials, money, todayISO } from '../../utils/library';
import { daysRemaining, groupLoansByStudent } from '../../utils/loanSummary';
import { EmptyState, MiniStat, PageHeading, StatusPill } from '../../components/staff/StaffUI';
import { TABLE_PAGE_SIZE, TablePagination } from '../../components/staff/TablePagination';

interface Props {
  loans: Loan[];
  books: BookRecord[];
  query: string;
  setQuery: (value: string) => void;
  filter: string;
  setFilter: (value: string) => void;
  bookById: (id: string) => BookRecord | undefined;
  onReturn: (id: string) => void;
}

export function BorrowersPage({ loans, books, query, setQuery, filter, setFilter, bookById, onReturn }: Props) {
  const [view, setView] = useState<'active' | 'history'>('active');
  const [grouped, setGrouped] = useState(false);
  const [page, setPage] = useState(1);
  const active = loans.filter((loan) => !loan.returned);
  const rows = (view === 'active' ? active : loans.filter((loan) => loan.returned))
    .filter((loan) => (loan.student + ' ' + loan.studentId + ' ' + (bookById(loan.bookId)?.title ?? loan.bookTitle))
      .toLowerCase().includes(query.toLowerCase()))
    .filter((loan) => view === 'history' || filter === 'All active' ||
      (filter === 'Overdue' ? loan.overdueDays > 0 : filter === 'Due today'
        ? loan.due === todayISO() : loan.overdueDays === 0 && loan.due !== todayISO()));
  const groups = groupLoansByStudent(rows);
  const count = grouped ? groups.length : rows.length;
  const currentPage = Math.min(page, Math.max(1, Math.ceil(count / TABLE_PAGE_SIZE)));
  const start = (currentPage - 1) * TABLE_PAGE_SIZE;
  const visibleLoans = rows.slice(start, start + TABLE_PAGE_SIZE);
  const visibleGroups = groups.slice(start, start + TABLE_PAGE_SIZE);

  function exportCSV() {
    const cell = (value: unknown) => {
      const text = String(value ?? '');
      const safe = /^[=+@-]/.test(text) ? "'" + text : text;
      return '"' + safe.replace(/"/g, '""') + '"';
    };
    const csv = [
      ['Student', 'Student ID', 'Book', 'Borrowed', 'Due', 'Returned', 'Status', 'Fine', 'Receipt'],
      ...rows.map((loan) => [loan.student, loan.studentId, bookById(loan.bookId)?.title ?? loan.bookTitle,
        loan.borrowed, loan.due, loan.returned ?? '', loan.returned ? 'Returned' : loan.overdueDays ? 'Overdue'
          : loan.due === todayISO() ? 'Due today' : 'On time', loan.finePaid ?? loan.fineAmount, loan.receipt ?? '']),
    ].map((row) => row.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'frighton-' + (view === 'active' ? 'active-borrowers' : 'return-history') + '.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  function renderLoan(loan: Loan) {
    const late = loan.overdueDays;
    const remaining = daysRemaining(loan.due);
    return <tr key={loan.id}>
      <td><div className="student-cell"><span className="staff-avatar tiny-avatar">{getInitials(loan.student)}</span><span><strong>{loan.student}</strong><small>{loan.studentId}</small></span></div></td>
      <td><div className="simple-book-cell"><strong>{bookById(loan.bookId)?.title ?? loan.bookTitle}</strong><small>{bookById(loan.bookId)?.author ?? loan.bookAuthor}</small></div></td>
      <td>{formatDate(loan.borrowed)}</td>
      <td><strong>{formatDate(view === 'active' ? loan.due : loan.returned!)}</strong>
        {view === 'active' && <small className={late > 0 ? 'late-days' : 'days-remaining'}>
          {late > 0 ? late + ' days late' : remaining === 0 ? 'Due today' : remaining + (remaining === 1 ? ' day left' : ' days left')}
        </small>}
      </td>
      <td>{view === 'active' ? <div className="status-fine"><StatusPill status={late ? 'Overdue' : loan.due === todayISO() ? 'Due today' : 'On time'}/>{late > 0 && <strong className="fine-amount">{money(loan.fineAmount)}</strong>}</div>
        : <span className="history-fine">{loan.finePaid ? money(loan.finePaid) : loan.fineAmount > 0 ? 'Unpaid: ' + money(loan.fineAmount) : 'No fine'}</span>}</td>
      <td>{view === 'active' ? <button className="row-return" type="button" title="Process return" aria-label={'Process return for ' + loan.student} onClick={() => onReturn(loan.id)}><BookCheck size={16}/></button>
        : <span className="receipt-number">{loan.receipt ?? '-'}</span>}</td>
    </tr>;
  }

  return <>
    <PageHeading eyebrow="CIRCULATION MONITOR" title="Active borrowers"><button className="staff-outline" onClick={exportCSV}><FileText size={16}/> Export CSV</button></PageHeading>
    <div className="borrower-stats">
      <MiniStat label="Active loans" value={active.length}/>
      <MiniStat label="Overdue" value={active.filter((loan) => loan.overdueDays > 0).length} red/>
      <MiniStat label="Due today" value={active.filter((loan) => loan.due === todayISO()).length}/>
      <MiniStat label="Books available" value={books.reduce((sum, book) => sum + (book.active ? book.available : 0), 0)}/>
    </div>
    <div className="borrower-tabs">
      <button onClick={() => { setView('active'); setPage(1); }} className={view === 'active' ? 'borrower-tab-active' : ''}>Active loans <b>{active.length}</b></button>
      <button onClick={() => { setView('history'); setPage(1); }} className={view === 'history' ? 'borrower-tab-active' : ''}>Return history <b>{loans.filter((loan) => loan.returned).length}</b></button>
    </div>
    <section className="staff-panel table-panel">
      <div className="table-toolbar borrower-toolbar">
        <label className="table-search"><Search size={16}/><input aria-label="Search borrowers" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search student, ID, or book"/></label>
        {view === 'active' && <label className="select-filter"><SlidersHorizontal size={15}/><select aria-label="Loan status" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); }}><option>All active</option><option>Overdue</option><option>Due today</option><option>On time</option></select></label>}
        <label className="group-students-toggle"><input type="checkbox" checked={grouped} onChange={(event) => { setGrouped(event.target.checked); setPage(1); }}/> Group by student</label>
      </div>
      <div className="table-scroll">
        <table className="staff-table borrower-table">
          <thead><tr><th>STUDENT</th><th>BOOK</th><th>CHECKED OUT</th><th>{view === 'active' ? 'DUE DATE' : 'RETURNED'}</th><th>{view === 'active' ? 'STATUS / FINE' : 'FINE PAID'}</th><th/></tr></thead>
          <tbody>{grouped ? visibleGroups.map((group) => <Fragment key={group.studentId}>
            <tr className="student-group-heading"><th colSpan={6} scope="rowgroup">
              {group.student} | {group.studentId}<span>{group.loans.length} {view === 'active' ? 'active' : 'returned'} {group.loans.length === 1 ? 'book' : 'books'} | {money(group.loans.reduce((sum, loan) => sum + loan.fineAmount, 0))} {view === 'active' ? 'accrued fines' : 'total fines'}
              </span>
            </th></tr>
            {group.loans.map(renderLoan)}
          </Fragment>) : visibleLoans.map(renderLoan)}</tbody>
        </table>
        {rows.length === 0 && <EmptyState icon={<Users size={20}/>} title={view === 'active' ? 'No active loans found' : 'No return history found'} text="Try another search or switch views."/>}
      </div>
      <div className="table-bottom"><span>{rows.length} {view === 'active' ? 'active' : 'returned'} loans ? {groups.length} students</span><TablePagination count={count} page={currentPage} onPageChange={setPage}/></div>
    </section>
  </>;
}
