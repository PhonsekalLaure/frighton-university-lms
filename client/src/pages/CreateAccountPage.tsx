import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import type { StaffInvitation } from '../types/library';
import { acceptInvitation, verifyInvitation } from '../services/staff';
import { ApiError } from '../services/api';
import { formatDate } from '../utils/library';

interface CreateAccountPageProps {
  onGoToLogin: (email?: string) => void;
}

export function CreateAccountPage({ onGoToLogin }: CreateAccountPageProps) {
  const [token, setToken] = useState<string>('');
  const [invitation, setInvitation] = useState<StaffInvitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifyError, setVerifyError] = useState('');
  const [isExpired, setIsExpired] = useState(false);
  const [isAccepted, setIsAccepted] = useState(false);

  // Form state
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Extract token from query or hash
    const params = new URLSearchParams(window.location.search);
    let tokenParam = params.get('token') || '';
    let emailParam = params.get('email') || '';

    if (window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      if (!tokenParam) {
        tokenParam = hashParams.get('token') || hashParams.get('access_token') || '';
      }
      if (!emailParam) {
        emailParam = hashParams.get('email') || '';
      }
    }

    setToken(tokenParam);

    if (!tokenParam && !emailParam) {
      setLoading(false);
      setVerifyError('No invitation token was found in the link. Please check your invitation email.');
      return;
    }

    verifyInvitation(tokenParam || undefined, emailParam || undefined)
      .then((inv) => {
        setInvitation(inv);
        if (inv.firstName) setFirstName(inv.firstName);
        if (inv.middleName) setMiddleName(inv.middleName);
        if (inv.lastName) setLastName(inv.lastName);

        if (inv.status === 'accepted') {
          setIsAccepted(true);
        } else if (inv.status === 'expired' || new Date(inv.expiresAt) < new Date()) {
          setIsExpired(true);
        }
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Invalid invitation link.';
        setVerifyError(message);
        if (message.toLowerCase().includes('expired')) {
          setIsExpired(true);
        } else if (message.toLowerCase().includes('already accepted')) {
          setIsAccepted(true);
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting || !invitation) return;

    const errors: Record<string, string> = {};
    if (!firstName.trim()) errors.firstName = 'First name is required.';
    if (!lastName.trim()) errors.lastName = 'Last name is required.';
    if (!password) {
      errors.password = 'Password is required.';
    } else if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters long.';
    }
    if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setSubmitError('Please resolve the errors below before continuing.');
      return;
    }

    setSubmitting(true);
    setSubmitError('');
    setFieldErrors({});

    try {
      await acceptInvitation({
        token,
        email: invitation.email,
        password,
        firstName: firstName.trim(),
        middleName: middleName.trim() || null,
        lastName: lastName.trim(),
      });
      setSuccess(true);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setSubmitError(err.message);
        if (err.fields) setFieldErrors(err.fields);
      } else {
        setSubmitError(err instanceof Error ? err.message : 'Unable to complete account registration.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // State 1: Loading
  if (loading) {
    return (
      <main className="login-page login-page-centered">
        <div className="login-logo">
          <span className="school-seal" aria-label="Frighton University seal">
            <span className="seal-monogram">F</span>
            <i />
            <small>1912</small>
          </span>
          <span>
            <strong>FRIGHTON UNIVERSITY</strong>
          </span>
        </div>
        <section className="login-card" style={{ textAlign: 'center', padding: '40px 30px' }}>
          <div className="eyebrow">VERIFYING INVITATION</div>
          <h2 style={{ fontSize: 20, margin: '12px 0 8px' }}>Validating your invitation...</h2>
          <p style={{ color: '#888792', fontSize: 13 }}>Connecting to Frighton University Library Services</p>
        </section>
      </main>
    );
  }

  // State 2: Success
  if (success) {
    return (
      <main className="login-page login-page-centered">
        <div className="login-logo">
          <span className="school-seal" aria-label="Frighton University seal">
            <span className="seal-monogram">F</span>
            <i />
            <small>1912</small>
          </span>
          <span>
            <strong>FRIGHTON UNIVERSITY</strong>
          </span>
        </div>
        <section className="login-card" style={{ textAlign: 'center', padding: '40px 32px' }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: '#eaf4ee',
              color: '#3e7655',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 16px',
            }}
          >
            <CheckCircle2 size={32} />
          </div>
          <div className="eyebrow" style={{ color: '#3e7655' }}>
            REGISTRATION COMPLETE
          </div>
          <h1 style={{ fontSize: 24, margin: '8px 0 10px', color: '#343956' }}>Account Activated</h1>
          <p style={{ color: '#74737f', fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>
            Welcome to the library team! Your librarian account for <strong>{invitation?.email}</strong> is ready.
            You can now sign in to access the circulation console.
          </p>
          <button
            type="button"
            className="button login-submit"
            onClick={() => onGoToLogin(invitation?.email)}
          >
            Sign in to librarian console <ArrowRight size={16} />
          </button>
        </section>
      </main>
    );
  }

  // State 3: Error / Expired / Already Accepted / Invalid
  if (verifyError || isExpired || isAccepted) {
    return (
      <main className="login-page login-page-centered">
        <div className="login-logo">
          <span className="school-seal" aria-label="Frighton University seal">
            <span className="seal-monogram">F</span>
            <i />
            <small>1912</small>
          </span>
          <span>
            <strong>FRIGHTON UNIVERSITY</strong>
          </span>
        </div>
        <section className="login-card" style={{ textAlign: 'center', padding: '36px 30px' }}>
          <div
            style={{
              width: 50,
              height: 50,
              borderRadius: '50%',
              background: isAccepted ? '#f4eedf' : '#faebe9',
              color: isAccepted ? '#8e7745' : '#af5147',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 16px',
            }}
          >
            {isAccepted ? <ShieldCheck size={28} /> : <AlertTriangle size={28} />}
          </div>

          <div className="eyebrow" style={{ color: isAccepted ? '#8e7745' : '#af5147' }}>
            {isExpired
              ? 'INVITATION EXPIRED'
              : isAccepted
              ? 'ALREADY ACCEPTED'
              : 'INVITATION ISSUE'}
          </div>

          <h1 style={{ fontSize: 22, margin: '8px 0 10px', color: '#343956' }}>
            {isExpired
              ? 'Invitation Link Expired'
              : isAccepted
              ? 'Invitation Already Used'
              : 'Invalid Invitation Link'}
          </h1>

          <p style={{ color: '#74737f', fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>
            {isExpired ? (
              <>
                This invitation link was valid for <strong>48 hours</strong> and has expired. For security,
                staff invitation links cannot be used past their expiration. Please contact your library
                administrator to request a new invitation.
              </>
            ) : isAccepted ? (
              <>
                This invitation has already been accepted. You can sign in using your existing password.
              </>
            ) : (
              verifyError || 'This invitation link is not recognized or may have been revoked.'
            )}
          </p>

          <button type="button" className="button login-submit" onClick={() => onGoToLogin()}>
            Go to staff sign in <ArrowRight size={16} />
          </button>
        </section>
      </main>
    );
  }

  // State 4: Valid Invitation Form
  return (
    <main className="login-page login-page-centered">
      <div className="login-logo">
        <span className="school-seal" aria-label="Frighton University seal">
          <span className="seal-monogram">F</span>
          <i />
          <small>1912</small>
        </span>
        <span>
          <strong>FRIGHTON UNIVERSITY</strong>
        </span>
      </div>

      <section className="login-card" style={{ width: 'min(440px, 100%)', padding: '34px 32px' }}>
        <div className="eyebrow">STAFF ONBOARDING</div>
        <h1 style={{ fontSize: 24, margin: '6px 0 6px', color: '#343956', letterSpacing: '-0.02em' }}>
          Create Librarian Account
        </h1>
        <p style={{ color: '#80808c', fontSize: 12, margin: '0 0 18px', lineHeight: 1.5 }}>
          Set up your staff credentials to activate your circulation desk access.
        </p>

        {invitation?.expiresAt && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 11px',
              borderRadius: 5,
              background: '#f8f4ec',
              border: '1px solid #ebdcc5',
              color: '#897042',
              fontSize: 11,
              marginBottom: 18,
            }}
          >
            <Clock size={15} style={{ flexShrink: 0 }} />
            <span>
              Invitation active • Expires {formatDate(invitation.expiresAt)} (48-hour duration)
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} aria-busy={submitting}>
          {submitError && (
            <p className="login-notice" role="alert" style={{ margin: '0 0 14px' }}>
              <AlertTriangle size={15} /> {submitError}
            </p>
          )}

          {/* Email (read-only) */}
          <label htmlFor="staff-email">Assigned staff email</label>
          <div style={{ position: 'relative', marginBottom: 14 }}>
            <input
              id="staff-email"
              type="email"
              value={invitation?.email || ''}
              readOnly
              disabled
              style={{
                width: '100%',
                height: 42,
                padding: '0 36px 0 11px',
                background: '#f5f4ef',
                border: '1px solid #e2dfd7',
                borderRadius: 5,
                color: '#555866',
                fontSize: 13,
                fontWeight: 600,
              }}
            />
            <Lock
              size={15}
              style={{
                position: 'absolute',
                right: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#9a98a2',
              }}
            />
          </div>

          {/* Name fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div>
              <label htmlFor="first-name">First name *</label>
              <input
                id="first-name"
                type="text"
                required
                maxLength={100}
                placeholder="First name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={submitting}
                style={{
                  width: '100%',
                  height: 42,
                  padding: '0 11px',
                  borderRadius: 5,
                  border: fieldErrors.firstName ? '1px solid #ad5a51' : '1px solid #dfddd7',
                  fontSize: 13,
                }}
              />
              {fieldErrors.firstName && (
                <span style={{ color: '#ad5a51', fontSize: 10, display: 'block', marginTop: 3 }}>
                  {fieldErrors.firstName}
                </span>
              )}
            </div>

            <div>
              <label htmlFor="last-name">Last name *</label>
              <input
                id="last-name"
                type="text"
                required
                maxLength={100}
                placeholder="Last name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={submitting}
                style={{
                  width: '100%',
                  height: 42,
                  padding: '0 11px',
                  borderRadius: 5,
                  border: fieldErrors.lastName ? '1px solid #ad5a51' : '1px solid #dfddd7',
                  fontSize: 13,
                }}
              />
              {fieldErrors.lastName && (
                <span style={{ color: '#ad5a51', fontSize: 10, display: 'block', marginTop: 3 }}>
                  {fieldErrors.lastName}
                </span>
              )}
            </div>
          </div>

          <label htmlFor="middle-name">Middle name (optional)</label>
          <input
            id="middle-name"
            type="text"
            maxLength={100}
            placeholder="Optional"
            value={middleName}
            onChange={(e) => setMiddleName(e.target.value)}
            disabled={submitting}
            style={{
              width: '100%',
              height: 42,
              padding: '0 11px',
              borderRadius: 5,
              border: '1px solid #dfddd7',
              fontSize: 13,
              marginBottom: 14,
            }}
          />

          {/* Password fields */}
          <label htmlFor="create-password">Create password *</label>
          <div className="password-input" style={{ marginBottom: 14 }}>
            <input
              id="create-password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              maxLength={1024}
              placeholder="Minimum 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              style={{
                borderColor: fieldErrors.password ? '#ad5a51' : '#dfddd7',
              }}
            />
            <button
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            {fieldErrors.password && (
              <span style={{ color: '#ad5a51', fontSize: 10, display: 'block', marginTop: 3 }}>
                {fieldErrors.password}
              </span>
            )}
          </div>

          <label htmlFor="confirm-password">Confirm password *</label>
          <div className="password-input" style={{ marginBottom: 20 }}>
            <input
              id="confirm-password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              maxLength={1024}
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={submitting}
              style={{
                borderColor: fieldErrors.confirmPassword ? '#ad5a51' : '#dfddd7',
              }}
            />
            {fieldErrors.confirmPassword && (
              <span style={{ color: '#ad5a51', fontSize: 10, display: 'block', marginTop: 3 }}>
                {fieldErrors.confirmPassword}
              </span>
            )}
          </div>

          <button
            className="button login-submit"
            type="submit"
            disabled={submitting}
            style={{ height: 44 }}
          >
            {submitting ? 'Activating account...' : 'Create librarian account'} <ArrowRight size={16} />
          </button>
        </form>
      </section>
    </main>
  );
}
