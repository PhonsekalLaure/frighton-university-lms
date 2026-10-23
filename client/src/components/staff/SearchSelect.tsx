import { useEffect, useId, useState } from 'react';
import { LoaderCircle, Search } from 'lucide-react';

export type SearchOption = { value: string; label: string; detail: string };
type Props = {
  value: string;
  selectedLabel: string;
  onSelect: (value: string) => void;
  search: (query: string, signal: AbortSignal) => Promise<SearchOption[]>;
  label: string;
  placeholder: string;
  emptyMessage: string;
  minLength?: number;
  required?: boolean;
  disabled?: boolean;
};

export function SearchSelect({ value, selectedLabel, onSelect, search, label, placeholder, emptyMessage,
  minLength = 1, required = false, disabled = false }: Props) {
  const id = useId();
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [result, setResult] = useState<{ query: string; options: SearchOption[]; error: string } | null>(null);
  const term = query?.trim() ?? '';
  const ready = term.length >= minLength;
  const current = result?.query === term ? result : null;
  const options = current?.options ?? [];
  const expanded = open && ready && !disabled;
  const loading = ready && !current;

  // A selection supplied by another workflow replaces any unfinished search.
  useEffect(() => { if (value) setQuery(null); }, [value]);

  useEffect(() => {
    setActive(-1);
    setResult(null);
    if (!ready || disabled) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void search(term, controller.signal).then((matches) => {
        if (!controller.signal.aborted) setResult({ query: term, options: matches, error: '' });
      }).catch((error: unknown) => {
        if (!controller.signal.aborted) setResult({
          query: term, options: [], error: error instanceof Error ? error.message : 'Unable to load suggestions.',
        });
      });
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [term, ready, disabled, search]);

  const choose = (option: SearchOption) => {
    onSelect(option.value);
    setQuery(null); setOpen(false); setActive(-1);
  };

  return <div className="circulation-search" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <div className="input-with-icon">
      <Search size={17}/>
      <input
        value={query ?? selectedLabel} placeholder={placeholder} aria-label={label}
        role="combobox" aria-autocomplete="list" aria-expanded={expanded}
        aria-controls={expanded ? id : undefined}
        aria-activedescendant={expanded && active >= 0 && options[active] ? id + '-' + active : undefined}
        aria-describedby={id + '-hint'} autoComplete="off" required={required} disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value); setResult(null); setActive(-1); setOpen(true); onSelect('');
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') { setOpen(false); setActive(-1); }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true);
            if (options.length) setActive(event.key === 'ArrowDown'
              ? (active + 1) % options.length : (active <= 0 ? options.length - 1 : active - 1));
          }
          if (event.key === 'Enter' && (query !== null || expanded)) {
            event.preventDefault();
            if (expanded && options.length) choose(options[active >= 0 ? active : 0]);
          }
        }}
      />
      {expanded && loading && <LoaderCircle className="spin" size={15} aria-hidden="true"/>}
    </div>
    {expanded && <div className="circulation-search-results" id={id} role="listbox" aria-label={label + ' suggestions'} aria-busy={loading}>
      {options.map((option, index) => <div
        id={id + '-' + index} key={option.value} role="option"
        aria-selected={active === index} className={active === index ? 'suggestion-active' : ''}
        onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}
        onMouseEnter={() => setActive(index)}
      ><strong>{option.label}</strong><small>{option.detail}</small></div>)}
      {loading && <p role="status">Searching...</p>}
      {current?.error && <p role="alert">{current.error}</p>}
      {!loading && !current?.error && options.length === 0 && <p role="status">{emptyMessage}</p>}
    </div>}
    <small className="field-hint" id={id + '-hint'}>
      {value ? 'Selection confirmed. Type to search again.' : minLength > 1
        ? 'Type at least two characters, then select a suggestion.'
        : minLength === 0 ? 'Choose an active borrower or type to filter the list.' : 'Type to search, then select a suggestion.'}
    </small>
  </div>;
}