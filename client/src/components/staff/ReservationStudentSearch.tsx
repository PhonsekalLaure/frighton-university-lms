import { LoaderCircle, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { searchReservationStudents, type ReservationStudent } from '../../services/reservations';

export function ReservationStudentSearch({ onSelect }: { onSelect: (studentNumber: string) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ReservationStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(false);

  useEffect(() => {
    const value = query.trim();
    if (selected || value.length < 2) {
      setResults([]); setLoading(false); setError('');
      return;
    }
    const request = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true); setError('');
      void searchReservationStudents(value, request.signal)
        .then((students) => { setResults(students); setOpen(true); })
        .catch((cause: unknown) => {
          if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to search students.');
        })
        .finally(() => { if (!request.signal.aborted) setLoading(false); });
    }, 250);
    return () => { window.clearTimeout(timer); request.abort(); };
  }, [query, selected]);

  const choose = (student: ReservationStudent) => {
    setQuery(`${student.name} - ${student.studentNumber}`);
    setSelected(true); setOpen(false); setResults([]); setError('');
    onSelect(student.studentNumber);
  };

  return <div className="reservation-student-search">
    <div className="reservation-student-input">
      <Search size={15}/>
      <input value={query} onFocus={() => { if (results.length) setOpen(true); }} onChange={(event) => {
        setQuery(event.target.value); setSelected(false); setOpen(true); onSelect('');
      }} placeholder="Search name or student ID" autoComplete="off" role="combobox" aria-expanded={open && results.length > 0} aria-controls="reservation-student-results" aria-autocomplete="list" required/>
      {loading && <LoaderCircle className="spin" size={14}/>}
    </div>
    {open && !loading && !error && query.trim().length >= 2 && <div className="reservation-student-results" id="reservation-student-results" role="listbox">
      {results.map((student) => <button type="button" role="option" aria-selected="false" key={student.studentNumber} onClick={() => choose(student)}>
        <span><strong>{student.name}</strong><small>{student.studentNumber}</small></span>
        <small>{student.program || 'Active student'}</small>
      </button>)}
      {results.length === 0 && !error && <p>No active students found.</p>}
    </div>}
    {error && <small className="field-hint reservation-search-error" role="alert">{error}</small>}
    {!error && <small className="field-hint">Type at least two characters, then select a student.</small>}
  </div>;
}
