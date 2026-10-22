import { AlertTriangle, LoaderCircle, RotateCcw } from 'lucide-react';

export function RemoteState({ loading, error, onRetry }: { loading: boolean; error: string; onRetry: () => void }) {
  if (error) return <div className="staff-panel remote-state" role="alert">
    <AlertTriangle size={22}/><strong>Unable to load records</strong><p>{error}</p>
    <button className="staff-outline" onClick={onRetry}><RotateCcw size={16}/> Try again</button>
  </div>;
  return <div className="staff-panel remote-state" role="status" aria-live="polite">
    <LoaderCircle size={22}/><strong>{loading ? 'Loading library records...' : 'Preparing library records...'}</strong>
  </div>;
}
