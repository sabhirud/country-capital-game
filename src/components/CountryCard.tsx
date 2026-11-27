import type { Country } from '../data/types.ts';
import { Flag } from './Flag.tsx';
import { Icon } from './Icon.tsx';
import { sayCapital, canSpeak } from '../audio/speech.ts';
import { tierOf, type CardState } from '../engine/srs.ts';
import { TIER_EMOJI, TIER_LABEL } from '../progress.ts';

export function SpeakButton({ country, label = 'Hear it' }: { country: Country; label?: string }) {
  if (!canSpeak()) return null;
  return (
    <button className="btn btn-ghost btn-sm speak" onClick={() => sayCapital(country, true)} aria-label={`Hear how to say ${country.capital}`}>
      <Icon name="speaker" size={18} /> {label}
    </button>
  );
}

/** Flag + country + capital + memory hook. */
export function CountryCard({ c, card, compact = false, children }: { c: Country; card?: CardState; compact?: boolean; children?: React.ReactNode }) {
  const tier = tierOf(card);
  return (
    <article className={`country-card ${compact ? 'compact' : ''}`}>
      <div className="cc-head">
        <Flag id={c.id} size={compact ? 'md' : 'lg'} />
        <div className="cc-title">
          <div className="cc-region">
            {c.continent} · {c.region}
          </div>
          <h2 className="cc-name">{c.name}</h2>
          {card && card.stage > 0 && (
            <span className={`tier-badge tier-${tier}`}>
              {TIER_EMOJI[tier]} {TIER_LABEL[tier]}
            </span>
          )}
        </div>
      </div>
      <div className="cc-capital">
        <span className="cc-label">Capital</span>
        <span className="cc-capital-name">{c.capital}</span>
        {c.say && <span className="cc-say">/{c.say}/</span>}
        <SpeakButton country={c} />
      </div>
      {c.altCapitals && c.altCapitals.length > 0 && (
        <ul className="cc-alts">
          {c.altCapitals.map((a) => (
            <li key={a.name}>
              <strong>{a.name}</strong> — {a.role}
            </li>
          ))}
        </ul>
      )}
      {c.capitalNote && <p className="cc-note">ℹ️ {c.capitalNote}</p>}
      <p className="cc-hook">💡 {c.hook}</p>
      {children}
    </article>
  );
}
