import { useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';

interface LoginPageProps {
  onSignIn: (email: string, password: string, remember: boolean) => Promise<void>;
  sessionError?: string;
}

export function LoginPage({ onSignIn, sessionError = '' }: LoginPageProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true);
    setError('');
    try {
      await onSignIn(String(data.get('email') || '').trim(), String(data.get('password') || ''), data.get('remember') === 'on');
      form.reset();
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Unable to sign in. Please try again.');
    } finally {
      setPending(false);
    }
  };

  return <main className="login-page login-page-centered">
    <div className="login-logo">
      <span className="school-seal" aria-label="Frighton University seal"><span className="seal-monogram">F</span><i/><small>1912</small></span>
      <span><strong>FRIGHTON UNIVERSITY</strong></span>
    </div>
    <section className="login-card">
      <div className="eyebrow">LIBRARIAN PORTAL</div>
      <h1>Sign in</h1>
      <form onSubmit={submit} aria-busy={pending}>
        <label htmlFor="campus-email">Staff email</label>
        <input id="campus-email" name="email" type="email" autoComplete="username" placeholder="name@frighton.edu" maxLength={254} required disabled={pending} aria-describedby={error || sessionError ? 'login-error' : undefined}/>
        <label htmlFor="campus-password">Password</label>
        <div className="password-input"><input id="campus-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" maxLength={1024} required disabled={pending}/><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div>
        <label className="remember-row"><input type="checkbox" name="remember" disabled={pending}/> Keep me signed in</label>
        {(error || sessionError) && <p id="login-error" className="login-notice" role="alert">{error || sessionError}</p>}
        <button className="button login-submit" type="submit" disabled={pending}>{pending ? 'Signing in...' : 'Sign in'} <ArrowRight size={16}/></button>
        </form>
    </section>
  </main>;
}
