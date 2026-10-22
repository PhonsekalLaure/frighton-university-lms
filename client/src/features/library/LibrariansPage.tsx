import { ShieldCheck, Users } from 'lucide-react';
import type { Staff } from '../../types/library';
import { formatDate, getInitials } from '../../utils/library';
import { EmptyState, PageHeading, StatusPill } from '../../components/staff/StaffUI';

export function LibrariansPage({ staff }: { staff: Staff[] }) {
  return <>
    <PageHeading eyebrow="ACCESS CONTROL" title="Librarian directory"/>
    <section className="staff-panel table-panel">
      <div className="staff-list-heading"><div><span className="eyebrow-staff">LIBRARY TEAM</span><h2>Staff directory <small>{staff.length}</small></h2></div></div>
      <div className="table-scroll"><table className="staff-table staff-directory-table">
        <thead><tr><th>STAFF MEMBER</th><th>EMAIL</th><th>STATUS</th><th>ADDED</th></tr></thead>
        <tbody>{staff.map((person) => <tr key={person.email}>
          <td><div className="student-cell"><span className="staff-avatar tiny-avatar">{getInitials(person.name)}</span><span><strong>{person.name}</strong><small>Librarian</small></span></div></td>
          <td>{person.email}</td><td><StatusPill status={person.active ? 'Active' : 'Deactivated'}/></td><td>{formatDate(person.since)}</td>
        </tr>)}</tbody>
      </table>{staff.length === 0 && <EmptyState icon={<Users size={20}/>} title="No librarians found" text="No librarian accounts have been registered."/>}</div>
      <div className="staff-security-note"><ShieldCheck size={16}/><span>Contact the system administrator to create or change staff accounts.</span></div>
    </section>
  </>;
}
