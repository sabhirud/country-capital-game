import { useMemo, useRef, useState } from 'react';
import { search } from '../engine/search.ts';
import { Flag } from './Flag.tsx';
import { Icon } from './Icon.tsx';

export function SearchBox({ onSelect, autoFocus = false }: { onSelect: (id: string) => void; autoFocus?: boolean }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const hits = useMemo(() => search(q), [q]);
  const ref = useRef<HTMLInputElement>(null);

  const choose = (id: string) => {
    onSelect(id);
    setQ('');
    setOpen(false);
    ref.current?.blur();
  };

  return (
    <div className="searchbox" role="combobox" aria-expanded={open && hits.length > 0} aria-haspopup="listbox">
      <Icon name="search" className="sb-icon" />
      <input
        ref={ref}
        value={q}
        autoFocus={autoFocus}
        placeholder="Search a country or capital…"
        aria-label="Search a country or capital"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(hits.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === 'Enter' && hits[active]) {
            choose(hits[active].country.id);
          } else if (e.key === 'Escape') {
            setQ('');
          }
        }}
      />
      {open && hits.length > 0 && (
        <ul className="sb-results" role="listbox">
          {hits.map((h, i) => (
            <li
              key={h.country.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(h.country.id);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <Flag id={h.country.id} size="sm" />
              <span className="sbr-text">
                <strong>{h.country.name}</strong>
                <span>{h.country.capital}</span>
              </span>
              <span className="sbr-via">{h.via === 'capital' ? 'capital' : h.via === 'alias' ? 'also called' : ''}</span>
            </li>
          ))}
        </ul>
      )}
      {open && q.trim().length > 1 && hits.length === 0 && <div className="sb-empty">No match. Try another spelling.</div>}
    </div>
  );
}
