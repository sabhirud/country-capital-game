import { BY_ID, COUNTRIES, CONTINENTS, idsOfContinent } from '../data/countries.ts';
import { DAY } from '../engine/srs.ts';
import { todayKey } from '../engine/storage.ts';
import { useSave } from '../store.ts';
import { countTiers } from '../progress.ts';
import { Flag } from '../components/Flag.tsx';
import { Icon } from '../components/Icon.tsx';
import { navigate } from '../router.ts';

export function Stats() {
  const save = useSave();
  const now = Date.now();
  const all = countTiers(COUNTRIES.map((c) => c.id), save.cards, now);
  const answered = save.days.reduce((s, d) => s + d.answered, 0);
  const correct = save.days.reduce((s, d) => s + d.correct, 0);
  const acc = answered ? Math.round((correct / answered) * 100) : 0;

  // reviews due per day for the next 7 days
  const forecast = Array.from({ length: 7 }, (_, i) => {
    const start = i === 0 ? -Infinity : new Date(new Date(now).setHours(0, 0, 0, 0)).getTime() + i * DAY;
    const end = new Date(new Date(now).setHours(0, 0, 0, 0)).getTime() + (i + 1) * DAY;
    const n = Object.values(save.cards).filter((c) => c.stage > 0 && c.due >= start && c.due < end).length;
    const label = i === 0 ? 'Today' : new Date(end - DAY).toLocaleDateString(undefined, { weekday: 'short' });
    return { label, n };
  });
  const fmax = Math.max(1, ...forecast.map((f) => f.n));

  // last 14 days of activity
  const byDay = new Map(save.days.map((d) => [d.date, d]));
  const activity = Array.from({ length: 14 }, (_, i) => {
    const t = now - (13 - i) * DAY;
    const k = todayKey(t);
    const d = byDay.get(k);
    return { k, n: d?.answered ?? 0, c: d?.correct ?? 0, label: new Date(t).toLocaleDateString(undefined, { day: 'numeric' }) };
  });
  const amax = Math.max(1, ...activity.map((a) => a.n));

  const toughest = Object.entries(save.cards)
    .filter(([, c]) => c.wrong > 0)
    .sort((a, b) => b[1].wrong - a[1].wrong || a[1].stage - b[1].stage)
    .slice(0, 8);

  return (
    <div className="screen stats">
      <header className="screen-head row">
        <h1>Progress</h1>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/settings')}>
          <Icon name="gear" size={18} /> Settings
        </button>
      </header>

      <div className="tiles">
        <div className="tile">
          <span className="tile-num">{all.silver + all.gold}</span>
          <span className="tile-label">conquered (silver+)</span>
        </div>
        <div className="tile gold">
          <span className="tile-num">{all.gold}</span>
          <span className="tile-label">gold</span>
        </div>
        <div className="tile">
          <span className="tile-num">{197 - all.none}</span>
          <span className="tile-label">countries met</span>
        </div>
        <div className="tile">
          <span className="tile-num">{acc}%</span>
          <span className="tile-label">accuracy · {answered} answers</span>
        </div>
      </div>

      <section className="card">
        <h2>By continent</h2>
        <div className="cont-bars">
          {CONTINENTS.map((ct) => {
            const t = countTiers(idsOfContinent(ct), save.cards, now);
            const pct = (n: number) => `${(n / t.total) * 100}%`;
            return (
              <div key={ct} className="cb-row">
                <span className="cb-name">{ct}</span>
                <span className="cr-bar">
                  <span className="mb-gold" style={{ width: pct(t.gold) }} />
                  <span className="mb-silver" style={{ width: pct(t.silver) }} />
                  <span className="mb-bronze" style={{ width: pct(t.bronze) }} />
                </span>
                <span className="cb-detail">
                  🥇{t.gold} 🥈{t.silver} 🥉{t.bronze} · {t.none} to go
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="two-col">
        <section className="card">
          <h2>Reviews coming up</h2>
          <div className="bars">
            {forecast.map((f) => (
              <div key={f.label} className="bar-col">
                <span className="bar-n">{f.n || ''}</span>
                <span className="bar" style={{ height: `${(f.n / fmax) * 100}%` }} />
                <span className="bar-label">{f.label}</span>
              </div>
            ))}
          </div>
          <p className="muted small">Short daily sessions beat one long one. Aim to clear "Today".</p>
        </section>
        <section className="card">
          <h2>Last 14 days</h2>
          <div className="bars">
            {activity.map((a) => (
              <div key={a.k} className="bar-col" title={`${a.n} answers, ${a.c} correct`}>
                <span className="bar-n">{a.n || ''}</span>
                <span className="bar act" style={{ height: `${(a.n / amax) * 100}%` }} />
                <span className="bar-label">{a.label}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card">
        <h2>Toughest capitals</h2>
        {toughest.length === 0 ? (
          <p className="muted">No misses yet. Impressive (or you haven’t started 😄).</p>
        ) : (
          <ul className="tough-list">
            {toughest.map(([id, c]) => (
              <li key={id}>
                <button className="tough" onClick={() => navigate(`/explore/${id}`)}>
                  <Flag id={id} size="sm" />
                  <span>
                    <strong>{BY_ID[id].capital}</strong> · {BY_ID[id].name}
                  </span>
                  <span className="muted small">
                    missed {c.wrong}×{c.confusedWith ? ` · mixed up with ${Object.keys(c.confusedWith).map((x) => BY_ID[x]?.capital).filter(Boolean).slice(0, 2).join(', ')}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {toughest.length > 0 && (
          <button className="btn btn-primary" onClick={() => navigate('/practice/weak')}>
            <Icon name="weak" size={18} /> Drill weak spots
          </button>
        )}
      </section>
    </div>
  );
}
