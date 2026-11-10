import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  MailPlus,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserCheck,
  Users,
  UserX,
  X,
} from 'lucide-react';
import type { Staff, StaffInvitation } from '../../types/library';
import { formatDate, getInitials } from '../../utils/library';
import { EmptyState, Field, FormActions, Modal, PageHeading, StatusPill } from '../../components/staff/StaffUI';
import { TABLE_PAGE_SIZE, TablePagination } from '../../components/staff/TablePagination';
import {
  deleteStaff,
  getInvitations,
  inviteLibrarian,
  resendInvitation,
  revokeInvitation,
  updateStaff,
} from '../../services/staff';
import { ApiError } from '../../services/api';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface LibrariansPageProps {
  staff: Staff[];
  onReload: () => Promise<boolean | void>;
  onNotice?: (message: string) => void;
  currentAdminId?: string;
}

export function LibrariansPage({
  staff,
  onReload,
  onNotice,
  currentAdminId,
}: LibrariansPageProps) {
  const [activeTab, setActiveTab] = useState<'directory' | 'invitations'>('directory');
  const [invitations, setInvitations] = useState<StaffInvitation[]>([]);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All statuses');
  const [page, setPage] = useState(1);

  // Modals
  const [modal, setModal] = useState<
    'invite' | 'inviteSent' | 'edit' | 'password' | 'toggle' | 'delete' | null
  >(null);
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [pending, setPending] = useState(false);
  const [modalError, setModalError] = useState('');
  const [pageError, setPageError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Invite states
  const [inviteForm, setInviteForm] = useState({
    email: '',
    firstName: '',
    middleName: '',
    lastName: '',
  });
  const [lastDispatchedInvite, setLastDispatchedInvite] = useState<StaffInvitation | null>(null);

  // Edit / Password form states
  const [editForm, setEditForm] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    email: '',
    active: true,
  });

  const [passwordForm, setPasswordForm] = useState({
    password: '',
    confirmPassword: '',
  });

  const loadAllInvitations = async () => {
    try {
      const data = await getInvitations();
      setInvitations(data);
    } catch {
      // Continue silently if invitations endpoint is quiet
    }
  };

  useEffect(() => {
    void loadAllInvitations();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [query, filter, activeTab]);

  const notify = (msg: string) => {
    if (onNotice) onNotice(msg);
  };

  const closeModal = () => {
    if (pending) return;
    setModal(null);
    setSelectedStaff(null);
    setModalError('');
    setFieldErrors({});
    setShowPassword(false);
    setCopiedLink(false);
  };

  const openInviteModal = () => {
    setInviteForm({
      email: '',
      firstName: '',
      middleName: '',
      lastName: '',
    });
    setModalError('');
    setFieldErrors({});
    setModal('invite');
  };

  const openEditModal = (person: Staff) => {
    setSelectedStaff(person);
    const firstName = person.firstName || person.name.split(' ')[0] || '';
    const lastName = person.lastName || person.name.split(' ').slice(-1)[0] || '';
    const middleName = person.middleName ?? '';

    setEditForm({
      firstName,
      middleName,
      lastName,
      email: person.email,
      active: person.active,
    });
    setModalError('');
    setFieldErrors({});
    setModal('edit');
  };

  const openPasswordModal = (person: Staff) => {
    setSelectedStaff(person);
    setPasswordForm({ password: '', confirmPassword: '' });
    setModalError('');
    setFieldErrors({});
    setShowPassword(false);
    setModal('password');
  };

  const openToggleModal = (person: Staff) => {
    setSelectedStaff(person);
    setModalError('');
    setModal('toggle');
  };

  const openDeleteModal = (person: Staff) => {
    setSelectedStaff(person);
    setModalError('');
    setModal('delete');
  };

  const handleInviteSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;

    const emailTrimmed = inviteForm.email.trim();
    const errors: Record<string, string> = {};

    if (!emailTrimmed) {
      errors.email = 'Staff email address is required.';
    } else if (!EMAIL_REGEX.test(emailTrimmed)) {
      errors.email = 'Enter a valid staff email address.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setModalError('Please correct the email address.');
      return;
    }

    setPending(true);
    setModalError('');
    setFieldErrors({});

    try {
      const res = await inviteLibrarian({
        email: emailTrimmed,
        firstName: inviteForm.firstName.trim() || null,
        middleName: inviteForm.middleName.trim() || null,
        lastName: inviteForm.lastName.trim() || null,
      });

      setLastDispatchedInvite(res.invitation);
      setModal('inviteSent');
      notify(`Invitation sent to ${res.invitation.email}. Valid for 48 hours.`);
      void loadAllInvitations();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setModalError(err.message);
        if (err.fields) setFieldErrors(err.fields);
      } else {
        setModalError(err instanceof Error ? err.message : 'Unable to send invitation.');
      }
    } finally {
      setPending(false);
    }
  };

  const handleResendInvite = async (invitation: StaffInvitation) => {
    try {
      const res = await resendInvitation(invitation.id);
      setLastDispatchedInvite(res.invitation);
      setModal('inviteSent');
      notify(`Invitation resent to ${invitation.email}. Fresh 48-hour expiration set.`);
      void loadAllInvitations();
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : 'Unable to resend invitation.');
    }
  };

  const handleRevokeInvite = async (id: string, email: string) => {
    try {
      await revokeInvitation(id);
      notify(`Invitation for ${email} has been revoked.`);
      void loadAllInvitations();
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : 'Unable to revoke invitation.');
    }
  };

  const copyInviteUrl = (link?: string) => {
    if (!link) return;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    });
  };

  const handleEditSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending || !selectedStaff) return;

    const errors: Record<string, string> = {};
    if (!editForm.firstName.trim()) errors.firstName = 'First name cannot be empty.';
    if (!editForm.lastName.trim()) errors.lastName = 'Last name cannot be empty.';
    if (!editForm.email.trim()) {
      errors.email = 'Email address cannot be empty.';
    } else if (!EMAIL_REGEX.test(editForm.email.trim())) {
      errors.email = 'Enter a valid staff email address.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setModalError('Please correct the highlighted form errors.');
      return;
    }

    setPending(true);
    setModalError('');
    setFieldErrors({});

    try {
      const updated = await updateStaff(selectedStaff.id, {
        firstName: editForm.firstName.trim(),
        middleName: editForm.middleName.trim() || null,
        lastName: editForm.lastName.trim(),
        email: editForm.email.trim(),
        active: editForm.active,
      });
      closeModal();
      notify(`Librarian profile updated for ${updated.name}.`);
      await onReload();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setModalError(err.message);
        if (err.fields) setFieldErrors(err.fields);
      } else {
        setModalError(err instanceof Error ? err.message : 'Unable to update librarian details.');
      }
    } finally {
      setPending(false);
    }
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending || !selectedStaff) return;

    const errors: Record<string, string> = {};
    if (!passwordForm.password) {
      errors.password = 'New password is required.';
    } else if (passwordForm.password.length < 8) {
      errors.password = 'Password must be at least 8 characters long.';
    }
    if (passwordForm.password !== passwordForm.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setModalError('Please correct the password errors.');
      return;
    }

    setPending(true);
    setModalError('');
    setFieldErrors({});

    try {
      await updateStaff(selectedStaff.id, {
        password: passwordForm.password,
      });
      closeModal();
      notify(`Password updated successfully for ${selectedStaff.name}.`);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setModalError(err.message);
        if (err.fields) setFieldErrors(err.fields);
      } else {
        setModalError(err instanceof Error ? err.message : 'Unable to reset password.');
      }
    } finally {
      setPending(false);
    }
  };

  const handleToggleStatus = async () => {
    if (pending || !selectedStaff) return;
    setPending(true);
    setModalError('');

    try {
      const updated = await updateStaff(selectedStaff.id, {
        active: !selectedStaff.active,
      });
      closeModal();
      notify(
        updated.active
          ? `${updated.name}'s account has been reactivated.`
          : `${updated.name}'s account has been deactivated.`
      );
      await onReload();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Unable to change account status.');
    } finally {
      setPending(false);
    }
  };

  const handleDelete = async () => {
    if (pending || !selectedStaff) return;
    setPending(true);
    setModalError('');

    try {
      await deleteStaff(selectedStaff.id);
      closeModal();
      notify(`Librarian account for ${selectedStaff.name} has been deleted.`);
      await onReload();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Unable to delete librarian account.');
    } finally {
      setPending(false);
    }
  };

  // Filter staff rows
  const normalizedQuery = query.toLowerCase().trim();
  const filteredStaff = staff
    .filter((person) => {
      if (!normalizedQuery) return true;
      const haystack = `${person.name} ${person.firstName ?? ''} ${person.lastName ?? ''} ${person.email}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    })
    .filter((person) => {
      if (filter === 'Active') return person.active;
      if (filter === 'Deactivated') return !person.active;
      return true;
    });

  // Filter invitations rows
  const pendingInvitationsCount = invitations.filter((i) => i.status === 'pending').length;
  const filteredInvitations = invitations
    .filter((inv) => {
      if (!normalizedQuery) return true;
      const haystack = `${inv.email} ${inv.firstName ?? ''} ${inv.lastName ?? ''}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    })
    .filter((inv) => {
      if (filter === 'Active') return inv.status === 'pending';
      if (filter === 'Deactivated') return inv.status === 'expired' || inv.status === 'revoked';
      return true;
    });

  const totalCount = activeTab === 'directory' ? filteredStaff.length : filteredInvitations.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / TABLE_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);

  const visibleStaff = filteredStaff.slice(
    (currentPage - 1) * TABLE_PAGE_SIZE,
    currentPage * TABLE_PAGE_SIZE
  );
  const visibleInvitations = filteredInvitations.slice(
    (currentPage - 1) * TABLE_PAGE_SIZE,
    currentPage * TABLE_PAGE_SIZE
  );

  const activeStaffCount = staff.filter((p) => p.active).length;
  const deactivatedCount = staff.filter((p) => !p.active).length;

  return (
    <>
      <PageHeading
        eyebrow="ACCESS CONTROL"
        title="Librarian management"
        description="Invite librarians via email, manage login access, and maintain the library staff directory."
      >
        <button type="button" className="staff-primary" onClick={openInviteModal}>
          <MailPlus size={16} /> Invite librarian
        </button>
      </PageHeading>

      {/* Overview Metric Bar */}
      <div className="catalog-summary">
        <span>
          <strong>{staff.length}</strong> active staff members
        </span>
        <i />
        <span>
          <strong>{activeStaffCount}</strong> active logins
        </span>
        <i />
        <span>
          <strong>{deactivatedCount}</strong> deactivated
        </span>
        <i />
        <span>
          <strong>{pendingInvitationsCount}</strong> pending invitations (48h duration)
        </span>
      </div>

      {pageError && (
        <div className="inline-warning" role="alert" style={{ marginBottom: 16 }}>
          <AlertTriangle size={17} />
          <span>{pageError}</span>
          <button type="button" className="staff-text-link" onClick={() => setPageError('')}>
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="borrower-tabs" style={{ marginBottom: 14 }}>
        <button
          type="button"
          className={activeTab === 'directory' ? 'borrower-tab-active' : ''}
          onClick={() => setActiveTab('directory')}
        >
          Staff Directory <b>{staff.length}</b>
        </button>
        <button
          type="button"
          className={activeTab === 'invitations' ? 'borrower-tab-active' : ''}
          onClick={() => {
            setActiveTab('invitations');
            void loadAllInvitations();
          }}
        >
          Invitations & Onboarding <b>{pendingInvitationsCount}</b>
        </button>
      </div>

      <section className="staff-panel table-panel">
        <div className="table-toolbar">
          <label className="table-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email"
              aria-label="Search staff"
            />
          </label>

          <label className="select-filter">
            <SlidersHorizontal size={15} />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="Filter by account status"
            >
              <option>All statuses</option>
              <option>Active</option>
              <option>Deactivated</option>
            </select>
          </label>
        </div>

        {activeTab === 'directory' ? (
          /* TAB 1: REGISTERED STAFF */
          <div className="table-scroll">
            <table className="staff-table staff-directory-table">
              <thead>
                <tr>
                  <th>STAFF MEMBER</th>
                  <th>EMAIL</th>
                  <th>STATUS</th>
                  <th>ADDED</th>
                  <th style={{ textAlign: 'right', paddingRight: 18 }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {visibleStaff.map((person) => {
                  const isSelf = Boolean(currentAdminId && person.id === currentAdminId);

                  return (
                    <tr key={person.id || person.email}>
                      <td>
                        <div className="student-cell">
                          <span className="staff-avatar tiny-avatar">{getInitials(person.name)}</span>
                          <span>
                            <strong>{person.name}</strong>
                            <small>Librarian</small>
                          </span>
                        </div>
                      </td>
                      <td>{person.email}</td>
                      <td>
                        <StatusPill status={person.active ? 'Active' : 'Deactivated'} />
                      </td>
                      <td>{formatDate(person.since)}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            title={`Edit ${person.name}`}
                            aria-label={`Edit ${person.name}`}
                            onClick={() => openEditModal(person)}
                          >
                            <Pencil size={15} />
                          </button>

                          <button
                            type="button"
                            className="row-key"
                            title={`Reset password for ${person.name}`}
                            aria-label={`Reset password for ${person.name}`}
                            onClick={() => openPasswordModal(person)}
                          >
                            <KeyRound size={15} />
                          </button>

                          {person.active ? (
                            <button
                              type="button"
                              className="row-toggle-active"
                              title={
                                isSelf
                                  ? 'Cannot deactivate your current session'
                                  : `Deactivate ${person.name}`
                              }
                              aria-label={`Deactivate ${person.name}`}
                              disabled={isSelf}
                              onClick={() => openToggleModal(person)}
                            >
                              <UserX size={15} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="row-toggle-deactive"
                              title={`Reactivate ${person.name}`}
                              aria-label={`Reactivate ${person.name}`}
                              onClick={() => openToggleModal(person)}
                            >
                              <UserCheck size={15} />
                            </button>
                          )}

                          <button
                            type="button"
                            className="row-delete"
                            title={isSelf ? 'Cannot delete your own account' : `Delete ${person.name}`}
                            aria-label={`Delete ${person.name}`}
                            disabled={isSelf}
                            onClick={() => openDeleteModal(person)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {visibleStaff.length === 0 && (
              <EmptyState
                icon={<Users size={22} />}
                title={query || filter !== 'All statuses' ? 'No matching librarians' : 'No librarians found'}
                text={
                  query || filter !== 'All statuses'
                    ? 'Try adjusting your search keywords or status filter.'
                    : 'Invite librarians using their email with the button above.'
                }
              />
            )}
          </div>
        ) : (
          /* TAB 2: INVITATIONS */
          <div className="table-scroll">
            <table className="staff-table staff-directory-table">
              <thead>
                <tr>
                  <th>INVITEE</th>
                  <th>EMAIL</th>
                  <th>STATUS</th>
                  <th>SENT</th>
                  <th>EXPIRATION</th>
                  <th style={{ textAlign: 'right', paddingRight: 18 }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {visibleInvitations.map((inv) => {
                  const now = new Date();
                  const expDate = new Date(inv.expiresAt);
                  const isExp = inv.status === 'pending' && expDate < now;
                  const diffHours = Math.max(0, Math.round((expDate.getTime() - now.getTime()) / 3600000));
                  const nameDisplay = [inv.firstName, inv.lastName].filter(Boolean).join(' ') || 'Pending registration';

                  return (
                    <tr key={inv.id}>
                      <td>
                        <div className="student-cell">
                          <span
                            className="staff-avatar tiny-avatar"
                            style={{ background: '#f0efe9', color: '#7a7684' }}
                          >
                            <Mail size={13} />
                          </span>
                          <span>
                            <strong>{nameDisplay}</strong>
                            <small>Librarian invite</small>
                          </span>
                        </div>
                      </td>
                      <td>{inv.email}</td>
                      <td>
                        <StatusPill
                          status={
                            inv.status === 'accepted'
                              ? 'Fulfilled'
                              : isExp || inv.status === 'expired'
                              ? 'Expired'
                              : inv.status === 'revoked'
                              ? 'Deactivated'
                              : 'Active'
                          }
                        />
                      </td>
                      <td>{formatDate(inv.createdAt)}</td>
                      <td>
                        {inv.status === 'accepted' ? (
                          <span style={{ color: '#4c7b5d' }}>Accepted</span>
                        ) : isExp || inv.status === 'expired' ? (
                          <span style={{ color: '#ae5c51' }}>Expired</span>
                        ) : inv.status === 'revoked' ? (
                          <span style={{ color: '#888' }}>Revoked</span>
                        ) : (
                          <span style={{ color: '#9a7d48' }}>
                            Expires in {diffHours}h ({formatDate(inv.expiresAt)})
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="row-actions">
                          {inv.inviteLink && inv.status === 'pending' && !isExp && (
                            <button
                              type="button"
                              title="Copy invitation link"
                              aria-label="Copy invitation link"
                              onClick={() => copyInviteUrl(inv.inviteLink)}
                            >
                              <Copy size={15} />
                            </button>
                          )}

                          <button
                            type="button"
                            title="Resend invitation (renews for 48 hours)"
                            aria-label="Resend invitation"
                            onClick={() => handleResendInvite(inv)}
                          >
                            <RefreshCw size={15} />
                          </button>

                          {inv.status === 'pending' && !isExp && (
                            <button
                              type="button"
                              className="row-delete"
                              title="Revoke invitation"
                              aria-label="Revoke invitation"
                              onClick={() => handleRevokeInvite(inv.id, inv.email)}
                            >
                              <X size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {visibleInvitations.length === 0 && (
              <EmptyState
                icon={<Mail size={22} />}
                title="No invitations found"
                text="Send an invitation by clicking the 'Invite librarian' button."
              />
            )}
          </div>
        )}

        <div className="table-bottom">
          <span>
            Showing {totalCount} records • Invitations carry a standard 48-hour expiration period
          </span>
          <TablePagination count={totalCount} page={currentPage} onPageChange={setPage} />
        </div>

        <div className="staff-security-note">
          <ShieldCheck size={16} />
          <span>
            Administrators manage staff invitations. Recipients receive a link to set up their own profile
            and password.
          </span>
        </div>
      </section>

      {/* MODAL 1: INVITE LIBRARIAN (NO PASSWORD FIELD) */}
      {modal === 'invite' && (
        <Modal
          title="Invite Librarian"
          subtitle="Send an email invitation. The recipient will be guided to create their own account and password."
          onClose={closeModal}
        >
          <form className="staff-form" onSubmit={handleInviteSubmit}>
            {modalError && (
              <p role="alert" className="inline-warning">
                <AlertTriangle size={15} /> {modalError}
              </p>
            )}

            <fieldset className="workflow-fields" disabled={pending}>
              <Field label="Staff campus email *">
                <input
                  required
                  type="email"
                  maxLength={254}
                  placeholder="e.g. m.blackwood@frighton.edu"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  aria-invalid={Boolean(fieldErrors.email)}
                />
                {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
              </Field>

              <div className="form-grid">
                <Field label="First name (optional)">
                  <input
                    type="text"
                    maxLength={100}
                    placeholder="Librarian can enter this"
                    value={inviteForm.firstName}
                    onChange={(e) => setInviteForm({ ...inviteForm, firstName: e.target.value })}
                  />
                </Field>

                <Field label="Last name (optional)">
                  <input
                    type="text"
                    maxLength={100}
                    placeholder="Librarian can enter this"
                    value={inviteForm.lastName}
                    onChange={(e) => setInviteForm({ ...inviteForm, lastName: e.target.value })}
                  />
                </Field>
              </div>

              <Field label="Middle name (optional)">
                <input
                  type="text"
                  maxLength={100}
                  placeholder="Optional"
                  value={inviteForm.middleName}
                  onChange={(e) => setInviteForm({ ...inviteForm, middleName: e.target.value })}
                />
              </Field>

              {/* Standard Expiration Notice */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '10px 12px',
                  borderRadius: 5,
                  background: '#f8f4ec',
                  border: '1px solid #ebdcc5',
                  color: '#897042',
                  fontSize: 11,
                  lineHeight: 1.5,
                }}
              >
                <Clock size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  <strong>Standard duration expiration:</strong> The invitation link is valid for{' '}
                  <strong>48 hours</strong>. The invitee will choose their own password upon opening the link.
                </span>
              </div>

              <FormActions onCancel={closeModal} submit="Send invitation" pending={pending} />
            </fieldset>
          </form>
        </Modal>
      )}

      {/* MODAL 2: INVITATION DISPATCHED CONFIRMATION (WITH COPYABLE LINK) */}
      {modal === 'inviteSent' && lastDispatchedInvite && (
        <Modal
          title="Invitation Dispatched"
          subtitle={`Invitation created for ${lastDispatchedInvite.email}.`}
          onClose={closeModal}
        >
          <div style={{ textAlign: 'center', padding: '10px 0 16px' }}>
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: '50%',
                background: '#eaf4ee',
                color: '#3e7655',
                display: 'grid',
                placeItems: 'center',
                margin: '0 auto 12px',
              }}
            >
              <CheckCircle2 size={28} />
            </div>
            <p style={{ color: '#444759', fontSize: 13, lineHeight: 1.5, margin: 0 }}>
              An invitation email has been dispatched to <strong>{lastDispatchedInvite.email}</strong>.
            </p>
            <p style={{ color: '#888794', fontSize: 11, margin: '4px 0 0' }}>
              Standard 48-hour expiration • Expires {formatDate(lastDispatchedInvite.expiresAt)}
            </p>
          </div>

          <div className="staff-field" style={{ marginBottom: 16 }}>
            <span>Invitation Link</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                readOnly
                value={lastDispatchedInvite.inviteLink || ''}
                style={{
                  flex: 1,
                  background: '#f7f6f1',
                  border: '1px solid #dedbd3',
                  fontSize: 11,
                  color: '#474958',
                }}
              />
              <button
                type="button"
                className="staff-primary"
                style={{ height: 37, padding: '0 12px' }}
                onClick={() => copyInviteUrl(lastDispatchedInvite.inviteLink)}
              >
                {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                {copiedLink ? 'Copied' : 'Copy link'}
              </button>
            </div>
            <span className="field-hint">
              You can copy this link and share it directly with the librarian if needed.
            </span>
          </div>

          <div className="form-actions">
            <button type="button" className="staff-primary" onClick={closeModal}>
              Done
            </button>
          </div>
        </Modal>
      )}

      {/* MODAL 3: EDIT LIBRARIAN */}
      {modal === 'edit' && selectedStaff && (
        <Modal
          title="Edit Librarian Account"
          subtitle={`Update profile and access settings for ${selectedStaff.name}.`}
          onClose={closeModal}
        >
          <form className="staff-form" onSubmit={handleEditSubmit}>
            {modalError && (
              <p role="alert" className="inline-warning">
                <AlertTriangle size={15} /> {modalError}
              </p>
            )}

            <fieldset className="workflow-fields" disabled={pending}>
              <div className="form-grid">
                <Field label="First name *">
                  <input
                    required
                    type="text"
                    maxLength={100}
                    value={editForm.firstName}
                    onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                    aria-invalid={Boolean(fieldErrors.firstName)}
                  />
                  {fieldErrors.firstName && <span className="field-error">{fieldErrors.firstName}</span>}
                </Field>

                <Field label="Middle name">
                  <input
                    type="text"
                    maxLength={100}
                    placeholder="Optional"
                    value={editForm.middleName}
                    onChange={(e) => setEditForm({ ...editForm, middleName: e.target.value })}
                  />
                </Field>
              </div>

              <div className="form-grid">
                <Field label="Last name *">
                  <input
                    required
                    type="text"
                    maxLength={100}
                    value={editForm.lastName}
                    onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                    aria-invalid={Boolean(fieldErrors.lastName)}
                  />
                  {fieldErrors.lastName && <span className="field-error">{fieldErrors.lastName}</span>}
                </Field>

                <Field label="Staff email *">
                  <input
                    required
                    type="email"
                    maxLength={254}
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    aria-invalid={Boolean(fieldErrors.email)}
                  />
                  {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
                </Field>
              </div>

              <label className="staff-checkbox-label">
                <input
                  type="checkbox"
                  checked={editForm.active}
                  disabled={currentAdminId === selectedStaff.id}
                  onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })}
                />
                <span>Account is active</span>
              </label>

              <FormActions onCancel={closeModal} submit="Save changes" pending={pending} />
            </fieldset>
          </form>
        </Modal>
      )}

      {/* MODAL 4: RESET PASSWORD */}
      {modal === 'password' && selectedStaff && (
        <Modal
          title="Reset Password"
          subtitle={`Set a new login password for ${selectedStaff.name} (${selectedStaff.email}).`}
          onClose={closeModal}
        >
          <form className="staff-form" onSubmit={handlePasswordSubmit}>
            {modalError && (
              <p role="alert" className="inline-warning">
                <AlertTriangle size={15} /> {modalError}
              </p>
            )}

            <fieldset className="workflow-fields" disabled={pending}>
              <Field label="New password *">
                <div className="staff-password-wrap">
                  <input
                    required
                    type={showPassword ? 'text' : 'password'}
                    minLength={8}
                    maxLength={1024}
                    placeholder="At least 8 characters"
                    value={passwordForm.password}
                    onChange={(e) => setPasswordForm({ ...passwordForm, password: e.target.value })}
                    aria-invalid={Boolean(fieldErrors.password)}
                  />
                  <button
                    type="button"
                    className="staff-password-toggle"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {fieldErrors.password && <span className="field-error">{fieldErrors.password}</span>}
              </Field>

              <Field label="Confirm new password *">
                <div className="staff-password-wrap">
                  <input
                    required
                    type={showPassword ? 'text' : 'password'}
                    minLength={8}
                    maxLength={1024}
                    placeholder="Re-enter the new password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    aria-invalid={Boolean(fieldErrors.confirmPassword)}
                  />
                </div>
                {fieldErrors.confirmPassword && (
                  <span className="field-error">{fieldErrors.confirmPassword}</span>
                )}
              </Field>

              <FormActions onCancel={closeModal} submit="Update password" pending={pending} />
            </fieldset>
          </form>
        </Modal>
      )}

      {/* MODAL 5: TOGGLE STATUS (DEACTIVATE / REACTIVATE) */}
      {modal === 'toggle' && selectedStaff && (
        <Modal
          title={selectedStaff.active ? 'Deactivate Librarian Account' : 'Reactivate Librarian Account'}
          subtitle={`Confirmation for ${selectedStaff.name} (${selectedStaff.email})`}
          onClose={closeModal}
        >
          {modalError && (
            <p role="alert" className="inline-warning">
              <AlertTriangle size={15} /> {modalError}
            </p>
          )}

          <p style={{ margin: '8px 0 16px', fontSize: 13, color: '#4a4d5d', lineHeight: 1.5 }}>
            {selectedStaff.active ? (
              <>
                Are you sure you want to deactivate <strong>{selectedStaff.name}</strong>? They will
                immediately be signed out and blocked from signing in to the librarian portal. Their
                circulation records and history will be preserved.
              </>
            ) : (
              <>
                Reactivate <strong>{selectedStaff.name}</strong>? Their login privileges and circulation desk
                access will be restored immediately.
              </>
            )}
          </p>

          <div className="form-actions confirmation-actions">
            <button type="button" className="staff-outline" onClick={closeModal} disabled={pending}>
              Cancel
            </button>
            <button
              type="button"
              className={selectedStaff.active ? 'staff-primary staff-danger' : 'staff-primary'}
              disabled={pending}
              onClick={handleToggleStatus}
            >
              {pending
                ? 'Updating...'
                : selectedStaff.active
                ? 'Deactivate account'
                : 'Reactivate account'}
            </button>
          </div>
        </Modal>
      )}

      {/* MODAL 6: DELETE LIBRARIAN */}
      {modal === 'delete' && selectedStaff && (
        <Modal
          title="Delete Librarian Account"
          subtitle={`Permanent removal of ${selectedStaff.name}`}
          onClose={closeModal}
        >
          {modalError && (
            <p role="alert" className="inline-warning" style={{ margin: '8px 0 14px' }}>
              <AlertTriangle size={16} /> <span>{modalError}</span>
            </p>
          )}

          <p style={{ margin: '6px 0 16px', fontSize: 13, color: '#4a4d5d', lineHeight: 1.5 }}>
            Are you sure you want to permanently delete the account for <strong>{selectedStaff.name}</strong> (
            <code>{selectedStaff.email}</code>)?
          </p>

          <div className="demo-callout" style={{ marginBottom: 16 }}>
            <AlertTriangle size={16} />
            <span>
              If this librarian has recorded book checkouts, returns, or reservations, foreign-key
              protection will prevent deletion. In that case, use <strong>Deactivate</strong> instead to
              safely revoke login access.
            </span>
          </div>

          <div className="form-actions confirmation-actions">
            <button type="button" className="staff-outline" onClick={closeModal} disabled={pending}>
              Cancel
            </button>
            <button
              type="button"
              className="staff-primary staff-danger"
              disabled={pending}
              onClick={handleDelete}
            >
              {pending ? 'Deleting...' : 'Permanently delete'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
