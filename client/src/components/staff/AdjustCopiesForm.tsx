import { useState, type FormEvent } from 'react';
import type { BookRecord } from '../../types/library';
import { ApiError } from '../../services/api';
import { Field, FormActions } from './StaffUI';

interface Props {
  book: BookRecord;
  pending: boolean;
  onSave: (total: number) => Promise<void>;
  onCancel: () => void;
}

export function AdjustCopiesForm({ book, pending, onSave, onCancel }: Props) {
  const [total, setTotal] = useState(String(book.total));
  const [error, setError] = useState('');
  const allocated = book.total - book.available;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!/^[0-9]+$/.test(total) || Number(total) > 1000000) {
      setError('Enter total copies as a whole number from 0 to 1,000,000.');
      return;
    }
    if (Number(total) < allocated) {
      setError('At least ' + allocated + ' copies are checked out or reserved.');
      return;
    }
    setError('');
    try { await onSave(Number(total)); }
    catch (cause) {
      setError(cause instanceof ApiError ? cause.fields.total || cause.message
        : cause instanceof Error ? cause.message : 'Unable to adjust copies.');
    }
  }

  return <form className="staff-form" noValidate onSubmit={(event) => { void submit(event); }}>
    <p className="field-hint">{book.total} total ? {book.available} available ? {allocated} checked out or reserved</p>
    <Field label="New total copies *">
      <input name="total" value={total} inputMode="numeric" required disabled={pending}
        aria-invalid={Boolean(error)} aria-describedby="copies-error"
        onChange={(event) => { setTotal(event.target.value); setError(''); }}/>
    </Field>
    {error && <p className="field-error" id="copies-error" role="alert">{error}</p>}
    <FormActions onCancel={onCancel} pending={pending} submit="Save copies"/>
  </form>;
}
