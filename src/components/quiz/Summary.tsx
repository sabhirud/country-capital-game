import { BY_ID } from '../../data/countries.ts';
import { TIER_RANK, tierOf } from '../../engine/srs.ts';
import { useSave } from '../../store.ts';
import { FlatMap } from '../../map/FlatMap.tsx';
import { Flag } from '../Flag.tsx';
import { Icon } from '../Icon.tsx';
import { TIER_EMOJI, TIER_LABEL, classForCard, nextDueText } from '../../progress.ts';
import type { Result, RunMode } from './QuizRunner.tsx';

export function Summary({ results, mode, onAgain, onExit }: { results: Result[]; mode: RunMode; onAgain: () => void; onExit: () => void }) {
  const save = useSave();
  if (results.length === 0) {
    return (
      <div className="summary">
        <h1>Nothing to do here</h1>
        <button className="btn btn-primary btn-lg" onClick={onExit}>
          Back
        </button>
      </div>
    );
  }
  const correct = results.filter((r) => r.correct).length;
  const acc = Math.round((correct / results.length) * 100);

  // one row per country: first tier before, final tier after, whether he ever missed it
  const rows = new Map<string, { id: string; before: number; missed: boolean; firstTryRight: boolean }>();
  for (const r of results) {
    const row = rows.get(r.id);
    if (!row) rows.set(r.id, { id: r.id, before: TIER_RANK[r.outcome.tierBefore], missed: !r.correct, firstTryRight: r.correct });
    else if (!r.correct) row.missed = true;
  }
  const list = [...rows.values()];
  const ups = list.filter((r) => TIER_RANK[tierOf(save.cards[r.id])] > r.before);
  const ids = list.map((r) => r.id);
  const next = nextDueText(save.cards);
  const headline = acc === 100 ? 'Flawless! 🎯' : acc >= 85 ? 'Great session! 🔥' : acc >= 60 ? 'Good work 💪' : 'Tough round — that’s how memories grow 🌱';

  return (
    <div className="summary">
      <div className="sum-hero">
        <div className="sum-score">
          <span className="sum-acc">{acc}%</span>
          <span className="sum-of">
            {correct} / {results.length} correct
          </span>
        </div>
        <h1>{headline}</h1>
        {ups.length > 0 && (
          <p className="sum-ups">
            {ups.length} {ups.length === 1 ? 'country' : 'countries'} moved up a tier
          </p>
        )}
      </div>

      <div className="sum-map card">
        <FlatMap fitIds={ids} classOf={(id) => (rows.has(id) ? classForCard(save.cards[id]) : 'dim')} interactive={false} capitals={ids.map((id) => ({ id }))} />
      </div>

      <ul className="sum-list">
        {list.map((r) => {
          const c = BY_ID[r.id];
          const t = tierOf(save.cards[r.id]);
          const up = TIER_RANK[t] > r.before;
          return (
            <li key={r.id} className={r.missed ? 'missed' : ''}>
              <Flag id={r.id} size="sm" />
              <div className="sl-text">
                <strong>{c.capital}</strong>
                <span>{c.name}</span>
              </div>
              <span className={`tier-badge tier-${t} ${up ? 'up' : ''}`} title={TIER_LABEL[t]} aria-label={`${TIER_LABEL[t]}${up ? ', moved up' : ''}`}>
                {up && '▲ '}
                {TIER_EMOJI[t]}
              </span>
            </li>
          );
        })}
      </ul>

      {mode === 'learn' && (
        <p className="sum-tip">
          🧠 Spacing beats cramming: these come back right when you’re about to forget them{next ? ` — next review ${next}` : ''}.
        </p>
      )}

      <div className="sum-actions">
        <button className="btn btn-primary btn-lg" onClick={onAgain}>
          <Icon name="play" /> {mode === 'learn' ? 'Keep going' : 'Play again'}
        </button>
        <button className="btn btn-ghost btn-lg" onClick={onExit}>
          <Icon name="map" /> Back to the map
        </button>
      </div>
    </div>
  );
}
