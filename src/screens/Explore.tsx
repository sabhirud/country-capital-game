import { useMemo, useState } from 'react';
import { BY_ID, COUNTRIES, CONTINENTS, regionsOf } from '../data/countries.ts';
import type { Continent } from '../data/types.ts';
import { tierOf } from '../engine/srs.ts';
import { useSave } from '../store.ts';
import { Globe } from '../map/Globe.tsx';
import { SearchBox } from '../components/SearchBox.tsx';
import { CountryCard } from '../components/CountryCard.tsx';
import { Flag } from '../components/Flag.tsx';
import { Icon } from '../components/Icon.tsx';
import { navigate } from '../router.ts';
import { sayCapital } from '../audio/speech.ts';

const TIER_VAR: Record<string, string> = { bronze: '--bronze', silver: '--silver', gold: '--gold' };

export function Explore({ id }: { id?: string }) {
  const save = useSave();
  const selected = id && BY_ID[id] ? BY_ID[id] : null;
  const [showTiers, setShowTiers] = useState(true);
  const [tab, setTab] = useState<Continent>(selected?.continent ?? 'Africa');

  const colors = useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const out: Record<string, string> = {};
    for (const [t, v] of Object.entries(TIER_VAR)) out[t] = cs.getPropertyValue(v).trim();
    return out;
    // recompute when theme flips
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save.settings.theme]);

  const colorOf = useMemo(
    () => (showTiers ? (cid: string) => colors[tierOf(save.cards[cid])] || null : undefined),
    [showTiers, save.cards, colors],
  );

  const select = (cid: string) => {
    navigate(`/explore/${cid}`);
    setTab(BY_ID[cid].continent);
    sayCapital(BY_ID[cid]);
  };

  return (
    <div className="screen explore">
      <header className="screen-head">
        <h1>Explore</h1>
        <SearchBox onSelect={select} />
      </header>

      <div className="explore-main">
        <div className="explore-globe card">
          <Globe focusId={selected?.id ?? null} colorOf={colorOf} autoRotate={!selected} onPick={select} interactive />
          <label className="globe-toggle">
            <input type="checkbox" checked={showTiers} onChange={(e) => setShowTiers(e.target.checked)} /> Show my conquest colors
          </label>
          <p className="globe-hint">Drag to spin · pinch or scroll to zoom · tap a country</p>
        </div>
        <div className="explore-side">
          {selected ? (
            <CountryCard c={selected} card={save.cards[selected.id]}>
              <div className="cc-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/explore`)}>
                  <Icon name="close" size={16} /> Close
                </button>
              </div>
            </CountryCard>
          ) : (
            <div className="card explore-intro">
              <h2>🔭 Explore the world</h2>
              <p>Search by country or capital, tap the globe, or browse the flags below. Every card has the capital, how to say it, and a memory hook.</p>
              <p>
                Want to identify a flag by its look? Try the{' '}
                <a href="#/flags" className="link">
                  Flag Finder
                </a>
                .
              </p>
            </div>
          )}
        </div>
      </div>

      <section className="browse">
        <div className="tabs" role="tablist">
          {CONTINENTS.map((c) => (
            <button key={c} role="tab" aria-selected={tab === c} className={`tab ${tab === c ? 'active' : ''}`} onClick={() => setTab(c)}>
              {c}
            </button>
          ))}
        </div>
        {regionsOf(tab).map((r) => (
          <div key={r.region} className="browse-region">
            <h3>{r.region}</h3>
            <div className="flag-grid">
              {r.ids.map((cid) => {
                const c = BY_ID[cid];
                const t = tierOf(save.cards[cid]);
                return (
                  <button key={cid} className={`flag-tile ${selected?.id === cid ? 'selected' : ''}`} onClick={() => select(cid)}>
                    <Flag id={cid} size="md" />
                    <span className="ft-name">{c.name}</span>
                    <span className="ft-cap">{c.capital}</span>
                    {t !== 'none' && <span className={`ft-tier tier-${t}`} aria-label={t} />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <p className="muted small center">{COUNTRIES.length} countries · 193 UN members + Vatican City, Palestine, Kosovo and Taiwan</p>
      </section>
    </div>
  );
}
