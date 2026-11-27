import { useMemo, useState } from 'react';
import { COUNTRIES } from '../data/countries.ts';
import type { FlagColor, FlagSymbol } from '../data/types.ts';
import { Flag } from '../components/Flag.tsx';
import { navigate } from '../router.ts';

const COLORS: { key: FlagColor; label: string; hex: string }[] = [
  { key: 'red', label: 'Red', hex: '#d62828' },
  { key: 'white', label: 'White', hex: '#ffffff' },
  { key: 'blue', label: 'Blue', hex: '#1d4ed8' },
  { key: 'green', label: 'Green', hex: '#15803d' },
  { key: 'yellow', label: 'Yellow / gold', hex: '#facc15' },
  { key: 'black', label: 'Black', hex: '#111111' },
  { key: 'orange', label: 'Orange', hex: '#f97316' },
];

const SYMBOLS: { key: FlagSymbol; label: string; emoji: string }[] = [
  { key: 'h-stripes', label: 'Horizontal stripes', emoji: '☰' },
  { key: 'v-stripes', label: 'Vertical stripes', emoji: '⫴' },
  { key: 'diagonal', label: 'Diagonal', emoji: '⟋' },
  { key: 'triangle', label: 'Triangle', emoji: '◀' },
  { key: 'cross', label: 'Cross', emoji: '✚' },
  { key: 'nordic-cross', label: 'Nordic cross', emoji: '╋' },
  { key: 'star', label: 'Star', emoji: '★' },
  { key: 'crescent', label: 'Crescent', emoji: '☪' },
  { key: 'sun', label: 'Sun', emoji: '☀' },
  { key: 'disc', label: 'Circle', emoji: '●' },
  { key: 'emblem', label: 'Coat of arms', emoji: '🛡' },
  { key: 'animal', label: 'Animal', emoji: '🦅' },
  { key: 'plant', label: 'Plant / leaf', emoji: '🌿' },
  { key: 'weapon', label: 'Weapon', emoji: '⚔' },
  { key: 'union-jack', label: 'Union Jack', emoji: '🇬🇧' },
  { key: 'text', label: 'Writing', emoji: '✍' },
  { key: 'map', label: 'Map', emoji: '🗺' },
];

export function FlagFinder() {
  const [colors, setColors] = useState<FlagColor[]>([]);
  const [symbols, setSymbols] = useState<FlagSymbol[]>([]);
  const [exact, setExact] = useState(false);

  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const matches = useMemo(
    () =>
      COUNTRIES.filter((c) => {
        if (!colors.every((k) => c.flag.colors.includes(k))) return false;
        if (exact && colors.length && c.flag.colors.some((k) => !colors.includes(k))) return false;
        return symbols.every((s) => c.flag.symbols.includes(s));
      }).sort((a, b) => a.name.localeCompare(b.name)),
    [colors, symbols, exact],
  );

  return (
    <div className="screen flagfinder">
      <header className="screen-head">
        <h1>Flag Finder</h1>
        <p className="muted">Seen a flag and can’t place it? Pick what you see.</p>
      </header>

      <div className="card ff-panel">
        <div className="ff-group">
          <h3>Colors</h3>
          <div className="chip-row wrap">
            {COLORS.map((c) => (
              <button key={c.key} className={`chip color-chip ${colors.includes(c.key) ? 'active' : ''}`} aria-pressed={colors.includes(c.key)} onClick={() => setColors(toggle(colors, c.key))}>
                <span className="swatch" style={{ background: c.hex }} />
                {c.label}
              </button>
            ))}
          </div>
          <label className="ff-exact">
            <input type="checkbox" checked={exact} onChange={(e) => setExact(e.target.checked)} /> Only these colors
          </label>
        </div>
        <div className="ff-group">
          <h3>Shapes &amp; symbols</h3>
          <div className="chip-row wrap">
            {SYMBOLS.map((s) => (
              <button key={s.key} className={`chip ${symbols.includes(s.key) ? 'active' : ''}`} aria-pressed={symbols.includes(s.key)} onClick={() => setSymbols(toggle(symbols, s.key))}>
                <span className="sym" aria-hidden="true">
                  {s.emoji}
                </span>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="ff-status">
          <strong>{matches.length}</strong> {matches.length === 1 ? 'flag matches' : 'flags match'}
          {(colors.length > 0 || symbols.length > 0) && (
            <button
              className="link-btn"
              onClick={() => {
                setColors([]);
                setSymbols([]);
                setExact(false);
              }}
            >
              clear
            </button>
          )}
        </div>
      </div>

      <div className="flag-grid big">
        {matches.map((c) => (
          <button key={c.id} className="flag-tile" onClick={() => navigate(`/explore/${c.id}`)}>
            <Flag id={c.id} size="md" />
            <span className="ft-name">{c.name}</span>
            <span className="ft-cap">{c.capital}</span>
          </button>
        ))}
      </div>
      {matches.length === 0 && <p className="muted center">No flag has all of those. Try removing one.</p>}
    </div>
  );
}
