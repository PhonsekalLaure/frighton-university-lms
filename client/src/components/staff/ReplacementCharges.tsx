import { useEffect, useState, type FormEvent } from 'react';
import { apiRequest } from '../../services/api';
import { money, formatDate } from '../../utils/library';
type Charge = {
  id: string;
  reason: string;
  amount: number;
  assessed_at: string;
  assessed_by: string;
  settled_at: string | null;
  settled_by: string | null;
  settlement_reference: string | null;
};
export function ReplacementCharges({ studentNumber }: { studentNumber: string }) {
  const [charges, setCharges] = useState<Charge[]>(),
    [readError, setReadError] = useState(''),
    [operationError, setOperationError] = useState(''),
    [pending, setPending] = useState(false),
    [revision, setRevision] = useState(0);
  const [amount, setAmount] = useState(''),
    [reason, setReason] = useState(''),
    [settling, setSettling] = useState(''),
    [reference, setReference] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setCharges(undefined);
    apiRequest<Charge[]>('/v1/replacement-charges?studentNumber=' + encodeURIComponent(studentNumber), {
      signal: controller.signal,
    }).then(
      (data) => {
        if (!controller.signal.aborted) {
          setCharges(data);
          setReadError('');
        }
      },
      (e) => {
        if (!controller.signal.aborted) setReadError(e.message);
      },
    );
    return () => controller.abort();
  }, [studentNumber, revision]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      !window.confirm(
        settling
          ? 'Confirm this payment was collected offline?'
          : 'Record this replacement charge on the student account?',
      )
    )
      return;
    setPending(true);
    setOperationError('');
    try {
      await apiRequest(
        settling ? '/v1/replacement-charges/' + settling + '/settle' : '/v1/replacement-charges',
        {
          method: 'POST',
          body: JSON.stringify(settling ? { reference } : { studentNumber, reason, amount: Number(amount) }),
        },
      );
      setSettling('');
      setReference('');
      setReason('');
      setAmount('');
      setRevision((r) => r + 1);
    } catch (e) {
      setOperationError(
        e instanceof Error ? e.message : 'The charge outcome could not be confirmed. Reload before retrying.',
      );
      setRevision((r) => r + 1);
    } finally {
      setPending(false);
    }
  }
  const error = operationError || readError;
  return (
    <section className="staff-panel replacement-charges">
      <h2>Replacement charges</h2>
      <p>Student {studentNumber} · payments are collected offline.</p>
      {error && (
        <p role="alert" className="inline-warning">
          {error} <button onClick={() => setRevision((r) => r + 1)}>Reload charges</button>
        </p>
      )}
      {!charges && !error ? (
        <p role="status">Loading charges…</p>
      ) : charges?.length ? (
        charges.map((c) => (
          <article key={c.id}>
            <strong>
              {money(Number(c.amount))} · {c.reason}
            </strong>
            <p>
              Assessed {formatDate(c.assessed_at)} · Staff {c.assessed_by}
            </p>
            {c.settled_at ? (
              <p>
                Settled {formatDate(c.settled_at)} · {c.settlement_reference} · Staff {c.settled_by}
              </p>
            ) : (
              <button
                className="staff-outline"
                disabled={pending}
                onClick={() => {
                  setSettling(c.id);
                  setReference('');
                }}
              >
                Record offline settlement
              </button>
            )}
          </article>
        ))
      ) : charges ? (
        <p>No replacement charges recorded.</p>
      ) : null}
      <form onSubmit={submit}>
        <fieldset disabled={pending || !charges} className="staff-form">
          <legend>{settling ? 'Record collected payment' : 'Assess a replacement charge'}</legend>
          {settling ? (
            <label className="staff-field">
              Payment receipt/reference
              <input
                required
                maxLength={200}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </label>
          ) : (
            <>
              <label className="staff-field">
                Reason
                <input required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
              <label className="staff-field">
                Amount (PHP)
                <input
                  required
                  type="number"
                  min="0.01"
                  max="9999999999.99"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
            </>
          )}
          <button className="staff-primary" type="submit">
            {pending ? 'Saving…' : settling ? 'Confirm offline settlement' : 'Record charge'}
          </button>
          {settling && (
            <button type="button" className="staff-outline" onClick={() => setSettling('')}>
              Cancel
            </button>
          )}
        </fieldset>
      </form>
    </section>
  );
}
