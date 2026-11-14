import { useId, useState, type FormEvent } from 'react';
import { Camera, Eye, EyeOff, KeyRound, LogOut, Pencil, ShieldCheck, UserRound } from 'lucide-react';
import type { Librarian } from '../../services/auth';
import { changePassword, updateMyProfile } from '../../services/auth';
import { getInitials } from '../../utils/library';
import { FormActions, Modal, PageHeading } from '../../components/staff/StaffUI';

function PasswordField({ label, autoComplete, value, onChange, minLength, disabled }: {
  label: string;
  autoComplete: 'current-password' | 'new-password';
  value: string;
  onChange: (value: string) => void;
  minLength?: number;
  disabled: boolean;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return <div className="staff-field">
    <label htmlFor={id}>{label}</label>
    <div className="staff-password-wrap">
      <input id={id} type={visible ? 'text' : 'password'} autoComplete={autoComplete} value={value} onChange={(event) => onChange(event.target.value)} required minLength={minLength} maxLength={1024} disabled={disabled}/>
      <button className="staff-password-toggle" type="button" aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={visible} aria-controls={id} onClick={() => setVisible((shown) => !shown)} disabled={disabled}>
        {visible ? <EyeOff size={18} aria-hidden="true"/> : <Eye size={18} aria-hidden="true"/>}
      </button>
    </div>
  </div>;
}

export function ProfilePage({ librarian, pending, onLogout, onProfileUpdated }: {
  librarian: Librarian;
  pending: boolean;
  onLogout: () => void;
  onProfileUpdated: (librarian: Librarian) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [confirmingPassword, setConfirmingPassword] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [confirmingProfile, setConfirmingProfile] = useState(false);
  const [editFirstName, setEditFirstName] = useState(librarian.firstName);
  const [editMiddleName, setEditMiddleName] = useState(librarian.middleName ?? '');
  const [editLastName, setEditLastName] = useState(librarian.lastName);
  const [profileError, setProfileError] = useState('');
  const [profileNotice, setProfileNotice] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const name = librarian.fullName || librarian.email;
  const role = librarian.role === 'admin' ? 'Admin' : 'Librarian';
  const profileLocked = savingProfile || confirmingProfile;

  function closePasswordModal() {
    if (savingPassword) return;
    setPasswordModalOpen(false);
    setConfirmingPassword(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setPasswordSaved(false);
  }

  function openEditProfile() {
    setEditFirstName(librarian.firstName);
    setEditMiddleName(librarian.middleName ?? '');
    setEditLastName(librarian.lastName);
    setProfileError('');
    setProfileNotice('');
    setEditingProfile(true);
  }

  function closeEditProfile() {
    if (profileLocked) return;
    setEditingProfile(false);
    setEditFirstName(librarian.firstName);
    setEditMiddleName(librarian.middleName ?? '');
    setEditLastName(librarian.lastName);
    setProfileError('');
  }

  function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (profileLocked) return;
    const first = editFirstName.trim();
    const middle = editMiddleName.trim();
    const last = editLastName.trim();
    if (!first || !last) {
      setProfileError('First name and last name are required.');
      return;
    }
    if (first.length > 100 || middle.length > 100 || last.length > 100) {
      setProfileError('Each name must be 100 characters or fewer.');
      return;
    }
    setProfileError('');
    setConfirmingProfile(true);
  }

  async function saveProfile() {
    if (!confirmingProfile || savingProfile) return;
    setSavingProfile(true);
    try {
      const updated = await updateMyProfile(editFirstName.trim(), editMiddleName.trim(), editLastName.trim());
      onProfileUpdated(updated);
      setProfileNotice('Your name has been updated.');
      setEditingProfile(false);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Unable to save your name. Please try again.');
    } finally {
      setSavingProfile(false);
      setConfirmingProfile(false);
    }
  }

  function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingPassword || confirmingPassword) return;
    setPasswordError('');
    setPasswordSaved(false);
    if (!currentPassword || currentPassword.length > 1024) {
      setPasswordError('Enter your current password.');
      return;
    }
    if (newPassword.length < 8 || newPassword.length > 1024) {
      setPasswordError('Your new password must be between 8 and 1024 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('The new passwords do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError('Choose a new password different from your current password.');
      return;
    }
    setConfirmingPassword(true);
  }

  async function savePassword() {
    if (!confirmingPassword || savingPassword) return;
    setSavingPassword(true);
    try {
      await changePassword(currentPassword, newPassword, confirmPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSaved(true);
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Unable to change your password. Please try again.');
    } finally {
      setSavingPassword(false);
      setConfirmingPassword(false);
    }
  }

  return <div className="profile-page">
    <PageHeading eyebrow="ACCOUNT" title="My profile"/>
    <section className="staff-panel profile-card" aria-label="Staff profile">
      <div className="profile-card-heading">
        <span className="profile-photo-wrap">
          <span className="staff-avatar profile-avatar">{getInitials(name)}</span>
          <button className="profile-photo-edit" type="button" aria-label="Change profile picture"><Camera size={14}/></button>
        </span>
        <span className="profile-card-identity"><strong>{name}</strong><small>{role}</small></span>
        {editingProfile
          ? <span className="profile-heading-actions">
              <button className="staff-outline" type="button" onClick={closeEditProfile} disabled={profileLocked || passwordModalOpen}>Cancel</button>
              <button className="staff-primary" type="submit" form="profile-details-form" disabled={profileLocked || passwordModalOpen}>{savingProfile ? 'Saving…' : 'Save changes'}</button>
            </span>
          : <button className="staff-outline profile-edit-button" type="button" onClick={openEditProfile} disabled={pending || passwordModalOpen}><Pencil size={15}/> Edit profile</button>}
      </div>
      {profileNotice && <p className="profile-notice" role="status">{profileNotice}</p>}
      <form id="profile-details-form" className="profile-details-form" onSubmit={submitProfile}>
        {editingProfile && profileError && <p className="inline-warning profile-edit-error" role="alert">{profileError}</p>}
        <div className="profile-details">
          <div><span>First name</span>{editingProfile ? <input aria-label="First name" className="profile-inline-input" autoFocus value={editFirstName} onChange={(event) => setEditFirstName(event.target.value)} required maxLength={100} disabled={profileLocked || passwordModalOpen}/> : <strong>{librarian.firstName || '—'}</strong>}</div>
          <div><span>Last name</span>{editingProfile ? <input aria-label="Last name" className="profile-inline-input" value={editLastName} onChange={(event) => setEditLastName(event.target.value)} required maxLength={100} disabled={profileLocked || passwordModalOpen}/> : <strong>{librarian.lastName || '—'}</strong>}</div>
          <div><span>Middle name</span>{editingProfile ? <input aria-label="Middle name" className="profile-inline-input" value={editMiddleName} onChange={(event) => setEditMiddleName(event.target.value)} maxLength={100} disabled={profileLocked || passwordModalOpen}/> : <strong>{librarian.middleName || '—'}</strong>}</div>
          <div><span>Email address</span><strong>{librarian.email}</strong></div>
          <div><span>Role</span><strong>{role}</strong></div>
        </div>
      </form>
      <section className="profile-security" aria-label="Password settings">
        <button className="staff-outline profile-change-password" type="button" onClick={() => setPasswordModalOpen(true)} disabled={pending || profileLocked}>
          <KeyRound size={15}/> Change password
        </button>
      </section>
      <div className="profile-card-actions">
        <button className="staff-outline profile-logout" type="button" disabled={pending || savingPassword || profileLocked} onClick={onLogout}>
          <LogOut size={16}/> Sign out
        </button>
      </div>
    </section>
    {confirmingProfile && <Modal className="profile-account-modal" title="Confirm profile changes" subtitle="Review your name before saving your profile." onClose={() => { if (!savingProfile) setConfirmingProfile(false); }}>
      <div className="profile-confirmation-content">
        <div className="profile-confirmation-account">
          <span className="profile-confirmation-icon"><UserRound size={21} aria-hidden="true"/></span>
          <div><span>Current profile</span><strong>{name}</strong><small>{librarian.email}</small></div>
        </div>
        <section className="profile-confirmation-review" aria-label="Updated profile details">
          <h3>Updated name</h3>
          <dl>
            <div><dt>First name</dt><dd>{editFirstName.trim()}</dd></div>
            <div><dt>Middle name</dt><dd>{editMiddleName.trim() || <span className="profile-confirmation-empty">Not provided</span>}</dd></div>
            <div><dt>Last name</dt><dd>{editLastName.trim()}</dd></div>
          </dl>
        </section>
        <p className="profile-confirmation-note">Your updated name will appear across the library portal.</p>
      </div>
      <form onSubmit={(event) => { event.preventDefault(); void saveProfile(); }}>
        <FormActions onCancel={() => setConfirmingProfile(false)} submit="Confirm changes" pending={savingProfile}/>
      </form>
    </Modal>}
    {passwordModalOpen && <Modal className="profile-account-modal" title={confirmingPassword ? 'Confirm password change' : 'Change password'} subtitle={confirmingPassword ? 'Confirm that you want to change the password for your staff account.' : 'Enter your current password and choose a new password for your staff account.'} onClose={closePasswordModal}>
      {confirmingPassword ? <>
        <div className="profile-confirmation-content">
          <div className="profile-confirmation-account">
            <span className="profile-confirmation-icon"><ShieldCheck size={21} aria-hidden="true"/></span>
            <div><span>Staff account</span><strong>{librarian.email}</strong><small>{name}</small></div>
          </div>
          <div className="profile-confirmation-security">
            <KeyRound size={18} aria-hidden="true"/>
            <div><strong>Ready to update your password?</strong><p>Use your new password the next time you sign in.</p></div>
          </div>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); void savePassword(); }}>
          <FormActions onCancel={() => setConfirmingPassword(false)} submit="Confirm password change" pending={savingPassword}/>
        </form>
      </> : <>
        {passwordError && <p className="inline-warning" role="alert">{passwordError}</p>}
        {passwordSaved && <p className="profile-password-message is-success" role="status">Your password has been changed.</p>}
        <form className="staff-form profile-password-form" onSubmit={submitPassword}>
          <PasswordField label="Current password" autoComplete="current-password" value={currentPassword} onChange={setCurrentPassword} disabled={savingPassword}/>
          <PasswordField label="New password" autoComplete="new-password" value={newPassword} onChange={setNewPassword} minLength={8} disabled={savingPassword}/>
          <PasswordField label="Confirm new password" autoComplete="new-password" value={confirmPassword} onChange={setConfirmPassword} minLength={8} disabled={savingPassword}/>
          <FormActions onCancel={closePasswordModal} submit="Change password" pending={savingPassword}/>
        </form>
      </>}
    </Modal>}
  </div>;
}
