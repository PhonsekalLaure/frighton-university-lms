import { useEffect, useRef, useState } from 'react';
import { ApiError, getSession, signIn, signOut, type Librarian } from '../services/auth';

export function useAuth() {
  const [librarian, setLibrarian] = useState<Librarian | null>(null);
  const [checking, setChecking] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const generation = useRef(0);

  useEffect(() => {
    let active = true;
    const current = generation.current;
    getSession().then((profile) => {
      if (active && generation.current === current) setLibrarian(profile);
    }).catch((error: unknown) => {
      if (active && !(error instanceof ApiError && error.status === 401)) {
        setSessionError(error instanceof Error ? error.message : 'Unable to verify your session.');
      }
    }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!librarian) return;
    let active = true;
    const current = generation.current;
    const check = () => {
      getSession().catch((error: unknown) => {
        if (!active || generation.current !== current) return;
        generation.current += 1;
        setLibrarian(null);
        setSessionError(error instanceof Error ? error.message : 'Please sign in again.');
      });
    };
    const interval = window.setInterval(check, 60000);
    window.addEventListener('focus', check);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', check);
    };
  }, [librarian]);

  useEffect(() => {
    const expired = () => {
      generation.current += 1;
      setLibrarian(null);
      setSessionError('Your session has expired. Please sign in again.');
    };
    window.addEventListener('lms:session-expired', expired);
    return () => window.removeEventListener('lms:session-expired', expired);
  }, []);

  const login = async (email: string, password: string, remember: boolean) => {
    setSessionError('');
    const profile = await signIn(email, password, remember);
    generation.current += 1;
    setLibrarian(profile);
  };

  const logout = async () => {
    await signOut();
    generation.current += 1;
    setLibrarian(null);
    setSessionError('');
  };

  return { librarian, checking, sessionError, login, logout };
}
