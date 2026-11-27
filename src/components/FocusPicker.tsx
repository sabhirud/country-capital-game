import { CONTINENTS, focusKey, parseFocusKey, regionsOf, idsForFocus, type Focus } from '../data/countries.ts';
import { countTiers } from '../progress.ts';
import type { CardState } from '../engine/srs.ts';

function Mini({ ids, cards }: { ids: string[]; cards: Record<string, CardState> }) {
  const t = countTiers(ids, cards);
  const pct = (n: number) => `${(n / Math.max(1, t.total)) * 100}%`;
  return (
    <span className="mini-bar" aria-hidden="true">
      <span className="mb-gold" style={{ width: pct(t.gold) }} />
      <span className="mb-silver" style={{ width: pct(t.silver) }} />
      <span className="mb-bronze" style={{ width: pct(t.bronze) }} />
    </span>
  );
}

/** World / continent / sub-region chooser. */
export function FocusPicker({ value, onChange, cards }: { value: string; onChange: (key: string) => void; cards: Record<string, CardState> }) {
  const focus = parseFocusKey(value);
  const activeContinent = focus.kind === 'continent' ? focus.continent : focus.kind === 'region' ? regionContinent(focus) : null;
  const chip = (f: Focus, label: string) => {
    const k = focusKey(f);
    const active = k === value;
    return (
      <button key={k} className={`chip ${active ? 'active' : ''}`} onClick={() => onChange(k)} aria-pressed={active}>
        <span>{label}</span>
        <Mini ids={idsForFocus(f)} cards={cards} />
      </button>
    );
  };
  return (
    <div className="focus-picker">
      <div className="chip-row" role="group" aria-label="Choose what to focus on">
        {chip({ kind: 'world' }, '🌍 World')}
        {CONTINENTS.map((c) => chip({ kind: 'continent', continent: c }, c))}
      </div>
      {activeContinent && (
        <div className="chip-row sub" role="group" aria-label={`Regions of ${activeContinent}`}>
          {regionsOf(activeContinent).map((r) => chip({ kind: 'region', region: r.region }, `${r.region} · ${r.ids.length}`))}
        </div>
      )}
    </div>
  );
}

function regionContinent(f: Extract<Focus, { kind: 'region' }>) {
  for (const c of CONTINENTS) if (regionsOf(c).some((r) => r.region === f.region)) return c;
  return null;
}
