import { useState, type FormEvent } from 'react';
import { Camera, KeyRound, LogOut, Pencil } from 'lucide-react';
import type { Librarian } from '../../services/auth';
import { changePassword, updateMyProfile } from '../../services/auth';
import { getInitials } from '../../utils/library';
import { Field, FormActions, Modal, PageHeading } from '../../components/staff/StaffUI';

export function ProfilePage({ librarian, pending, onLogout }: {
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
  const [editingProfile, setEditingProfile] = useState(false);
  const [editFirstName, setEditFirstName] = useState(librarian.firstName);
  const [editMiddleName, setEditMiddleName] = useState(librarian.middleName ?? '');
  const [editLastName, setEditLastName] = useState(librarian.lastName);
  const [profileError, setProfileError] = useState('');
  const [profileNotice, setProfileNotice] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const name = librarian.fullName || librarian.email;
  const role = librarian.role === 'admin' ? 'Admin' : 'Librarian';

  function closePasswordModal() {
    if (savingPassword) return;
    setPasswordModalOpen(false);
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
    if (savingProfile) return;
    setEditingProfile(false);
    setEditFirstName(librarian.firstName);
    setEditMiddleName(librarian.middleName ?? '');
    setEditLastName(librarian.lastName);
    setProfileError('');
  }

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingProfile) return;
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
    setSavingProfile(true);
    setProfileError('');
    try {
      const updated = await updateMyProfile(first, middle, last);
      onProfileUpdated(updated);
      setProfileNotice('Your name has been updated.');
      setEditingProfile(false);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Unable to save your name. Please try again.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingPassword) return;
    setPasswordError('');
    setPasswordSaved(false);
    if (newPassword.length < 8 || newPassword.length > 1024) {
      setPasswordError('Your new password must be between 8 and 1024 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('The new passwords do not match.');
      return;
    }
    setSavingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSaved(true);
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Unable to change your password. Please try again.');
    } finally {
      setSavingPassword(false);
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
              <button className="staff-outline" type="button" onClick={closeEditProfile} disabled={savingProfile}>Cancel</button>
              <button className="staff-primary" type="submit" form="profile-details-form" disabled={savingProfile}>{savingProfile ? 'Saving…' : 'Save changes'}</button>
            </span>
          : <button className="staff-outline profile-edit-button" type="button" onClick={openEditProfile}><Pencil size={15}/> Edit profile</button>}
      </div>
      {profileNotice && <p className="profile-notice" role="status">{profileNotice}</p>}
      <form id="profile-details-form" className="profile-details-form" onSubmit={(event) => { void submitProfile(event); }}>
        {editingProfile && profileError && <p className="inline-warning profile-edit-error" role="alert">{profileError}</p>}
        <div className="profile-details">
          <div><span>First name</span>{editingProfile ? <input className="profile-inline-input" autoFocus value={editFirstName} onChange={(event) => setEditFirstName(event.target.value)} required maxLength={100} disabled={savingProfile}/> : <strong>{librarian.firstName || '—'}</strong>}</div>
          <div><span>Last name</span>{editingProfile ? <input className="profile-inline-input" value={editLastName} onChange={(event) => setEditLastName(event.target.value)} required maxLength={100} disabled={savingProfile}/> : <strong>{librarian.lastName || '—'}</strong>}</div>
          <div><span>Middle name</span>{editingProfile ? <input className="profile-inline-input" value={editMiddleName} onChange={(event) => setEditMiddleName(event.target.value)} maxLength={100} disabled={savingProfile}/> : <strong>{librarian.middleName || '—'}</strong>}</div>
          <div><span>Email address</span><strong>{librarian.email}</strong></div>
          <div><span>Role</span><strong>{role}</strong></div>
        </div>
      </form>
      <section className="profile-security" aria-label="Password settings">
        <button className="staff-outline profile-change-password" type="button" onClick={() => setPasswordModalOpen(true)}>
          <KeyRound size={15}/> Change password
        </button>
      </section>
      <div className="profile-card-actions">
        <button className="staff-outline profile-logout" type="button" disabled={pending || savingPassword} onClick={onLogout}>
          <LogOut size={16}/> Sign out
        </button>
      </div>
    </section>
    {passwordModalOpen && <Modal title="Change password" subtitle="Enter your current password and choose a new password for your staff account." onClose={closePasswordModal}>
      {passwordError && <p className="inline-warning" role="alert">{passwordError}</p>}
      {passwordSaved && <p className="profile-password-message is-success" role="status">Your password has been changed.</p>}
      <form className="staff-form profile-password-form" onSubmit={(event) => { void submitPassword(event); }}>
        <Field label="Current password">
          <input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required maxLength={1024} disabled={savingPassword}/>
        </Field>
        <Field label="New password">
          <input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={8} maxLength={1024} disabled={savingPassword}/>
        </Field>
        <Field label="Confirm new password">
          <input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={8} maxLength={1024} disabled={savingPassword}/>
        </Field>
        <FormActions onCancel={closePasswordModal} submit="Change password" pending={savingPassword}/>
      </form>
    </Modal>}
  </div>;
}
