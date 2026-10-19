import { useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';

export function LoginPage({ onViewOverview }: { onViewOverview: () => void }) {
  const [showPassword, setShowPassword] = useState(false);
  const submit = (event: FormEvent<HTMLFormElement>) => event.preventDefault();

  return <main className="login-page login-page-centered">
    <div className="login-logo">
      <span className="school-seal" aria-label="Frighton University seal"><span className="seal-monogram">F</span><i/><small>1912</small></span>
      <span><strong>FRIGHTON UNIVERSITY</strong></span>
    </div>
    <section className="login-card">
      <div className="eyebrow">STUDENT & LIBRARY PORTAL</div>
      <h1>Sign in</h1>
      <form onSubmit={submit}>
        <label htmlFor="campus-id">University email or ID</label>
        <input id="campus-id" name="username" autoComplete="username" placeholder="name@frighton.edu" required/>
        <label htmlFor="campus-password">Password</label>
        <div className="password-input"><input id="campus-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" required/><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div>
        <label className="remember-row"><input type="checkbox" name="remember"/> Keep me signed in</label>
        <button className="button login-submit" type="submit">Sign in <ArrowRight size={16}/></button>
        <button className="overview-button" type="button" onClick={onViewOverview}>View LMS overview</button>
      </form>
    </section>
  </main>;
}
