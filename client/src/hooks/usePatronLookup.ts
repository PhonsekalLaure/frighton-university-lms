import { useEffect, useState } from 'react';
import type { Patron } from '../types/library';
import { verifyPatron } from '../services/library';

export function usePatronLookup(studentNumber: string, enabled: boolean, revision = 0) {
  const id = studentNumber.trim().toUpperCase();
  const [result, setResult] = useState<{ id: string; patron: Patron | null; error: string; loading: boolean }>({
    id: '', patron: null, error: '', loading: false,
  });
  useEffect(() => {
    if (!id || !enabled) return;
    const controller = new AbortController();
    setResult({ id, patron: null, error: '', loading: true });
    const timer = window.setTimeout(() => {
      verifyPatron(id, controller.signal).then((patron) => {
        if (!controller.signal.aborted) setResult({ id, patron, error: '', loading: false });
      }).catch((error: unknown) => {
        if (!controller.signal.aborted) setResult({ id, patron: null, error: error instanceof Error ? error.message : 'Student lookup failed.', loading: false });
      });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [id, enabled, revision]);
  return enabled && id && result.id === id ? result : { id, patron: null, error: '', loading: Boolean(enabled && id) };
}
