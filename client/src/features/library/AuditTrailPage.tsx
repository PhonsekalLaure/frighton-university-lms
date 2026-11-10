import { useCallback, useState } from 'react';
import { ClipboardList, RefreshCw, Search } from 'lucide-react';
import { useRemoteData } from '../../hooks/useRemoteData';
import { auditActionLabels, getAuditEvents, type AuditFilterValues } from '../../services/audit';
import { EmptyState, PageHeading } from '../../components/staff/StaffUI';
import { RemoteState } from '../../components/staff/RemoteState';
import { TablePagination } from '../../components/staff/TablePagination';

const blank: AuditFilterValues = { q: '', action: '', from: '', to: '' };
const pageSize = 25;
const timestamp = (value: string) => new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
}).format(new Date(value));
export function AuditTrailPage({ sessionId }: { sessionId: string }) {
  const [draft, setDraft] = useState<AuditFilterValues>(blank);
  const [filters, setFilters] = useState<AuditFilterValues>(blank);
  const [page, setPage] = useState(1);
  const [filterError, setFilterError] = useState('');
  const load = useCallback((signal: AbortSignal) => getAuditEvents(filters, page, pageSize, signal), [filters, page]);
  const resource = useRemoteData(load, JSON.stringify([sessionId, filters, page]));
  const data = resource.data;
  return <>
    <PageHeading eyebrow="ADMINISTRATION" title="Audit trail" description="Completed book and circulation actions, including who processed them and when.">
      <button type="button" className="staff-outline" disabled={resource.loading} onClick={() => { void resource.reload(); }}><RefreshCw size={16}/> Refresh</button>
    </PageHeading>
    <p className="audit-note">Times use Asia/Manila. Records begin when audit logging is enabled and are kept as a permanent history.</p>
    <section className="staff-panel table-panel">
      <form className="audit-filters" onSubmit={(event) => {
        event.preventDefault();
        if (draft.from && draft.to && draft.from > draft.to) { setFilterError('The start date must be before the end date.'); return; }
        setFilterError(''); setPage(1); setFilters({ ...draft, q: draft.q.trim() });
      }}>
        <label className="audit-search"><span>Search</span><span className="table-search"><Search size={16}/><input name="auditSearch" maxLength={100} value={draft.q} onChange={(event) => setDraft({ ...draft, q: event.target.value })} placeholder="Staff, student number, or title"/></span></label>
        <label><span>Action</span><select value={draft.action} onChange={(event) => setDraft({ ...draft, action: event.target.value })}><option value="">All actions</option>{Object.entries(auditActionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>From</span><input type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })}/></label>
        <label><span>To</span><input type="date" min={draft.from || undefined} value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })}/></label>
        <button className="staff-primary" disabled={resource.loading}>Apply filters</button>
        <button type="button" className="staff-outline" onClick={() => { setDraft(blank); setFilters(blank); setPage(1); setFilterError(''); }}>Clear</button>
      </form>
      {filterError && <p className="inline-warning" role="alert">{filterError}</p>}
      {resource.error && <RemoteState loading={false} error={resource.error} onRetry={() => { void resource.reload(); }}/>}
      {resource.loading && <p className="audit-note" role="status">Loading audit records...</p>}
      {data && !resource.error && <><div className="table-scroll"><table className="staff-table audit-table"><thead><tr><th>DATE & TIME</th><th>ACTION</th><th>PERFORMED BY</th><th>BOOK / RECORD</th><th>STUDENT</th></tr></thead>
        <tbody>{data.data.map((event) => <tr key={event.id}><td><time dateTime={event.occurredAt}>{timestamp(event.occurredAt)}</time></td><td><strong>{auditActionLabels[event.action] ?? event.action}</strong></td><td><strong>{event.actorName}</strong><small>{event.actorRole}</small></td><td>{event.entityLabel}</td><td>{event.studentNumber ?? '-'}</td></tr>)}</tbody>
      </table>{data.data.length === 0 && <EmptyState icon={<ClipboardList size={20}/>} title="No audit records found" text="Try different filters. New actions appear here after audit logging is enabled."/>}</div>
      <div className="table-bottom"><span>Admin access only</span><TablePagination count={data.total} page={page} pageSize={pageSize} onPageChange={setPage}/></div></>}
    </section>
  </>;
}
