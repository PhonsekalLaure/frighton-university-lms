import { useCallback, useEffect, useRef, useState } from 'react';

export function useRemoteData<T>(load: (signal: AbortSignal) => Promise<T>, sessionId: string | undefined) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(sessionId));
  const [error, setError] = useState('');
  const currentSession = useRef(sessionId);
  currentSession.current = sessionId;
  const controller = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    if (!sessionId || currentSession.current !== sessionId) return false;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError('');
    try {
      const next = await load(request.signal);
      if (request.signal.aborted || currentSession.current !== sessionId) return false;
      setData(next);
      return true;
    } catch (cause) {
      if (!request.signal.aborted && currentSession.current === sessionId) setError(cause instanceof Error ? cause.message : 'Unable to load library records.');
      return false;
    } finally {
      if (!request.signal.aborted && currentSession.current === sessionId) setLoading(false);
    }
  }, [load, sessionId]);

  useEffect(() => {
    setData(null);
    setError('');
    if (sessionId) void reload();
    else setLoading(false);
    return () => controller.current?.abort();
  }, [reload, sessionId]);

  return { data: sessionId ? data : null, loading, error, reload };
}
