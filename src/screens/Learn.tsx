import { useState } from 'react';
import { focusLabel, idsForFocus, parseFocusKey } from '../data/countries.ts';
import { buildSession, type QueueItem } from '../engine/session.ts';
import { getSave } from '../store.ts';
import { QuizRunner } from '../components/quiz/QuizRunner.tsx';
import { navigate } from '../router.ts';
import { nextDueText } from '../progress.ts';
import { Icon } from '../components/Icon.tsx';

function plan(forceNew = false): QueueItem[] {
  const s = getSave();
  const focusIds = idsForFocus(parseFocusKey(s.focus));
  if (forceNew) {
    // learn new countries even though nothing is due
    const unseen = focusIds.filter((id) => (s.cards[id]?.stage ?? 0) === 0).slice(0, s.settings.newPerSession);
    return unseen.map((id) => ({ id, kind: 'mc', study: true, prompt: 'both', round: 1 }));
  }
  return buildSession({
    cards: s.cards,
    focusIds,
    now: Date.now(),
    newLimit: s.settings.newPerSession,
    size: s.settings.sessionSize,
  }).items;
}

export function Learn() {
  const [run, setRun] = useState(0);
  const [items, setItems] = useState<QueueItem[]>(() => plan());
  const s = getSave();
  const label = focusLabel(parseFocusKey(s.focus));

  if (items.length === 0) {
    const unseenLeft = idsForFocus(parseFocusKey(s.focus)).some((id) => (s.cards[id]?.stage ?? 0) === 0);
    const next = nextDueText(s.cards);
    return (
      <div className="screen empty-state">
        <div className="big-emoji">🏆</div>
        <h1>All caught up!</h1>
        <p>
          No reviews due in <strong>{label}</strong> right now{next ? ` (next one ${next})` : ''}. Spacing is what turns silver into gold,
          so coming back later is a good thing.
        </p>
        <div className="row-actions">
          {unseenLeft && (
            <button
              className="btn btn-primary btn-lg"
              onClick={() => {
                setItems(plan(true));
                setRun((r) => r + 1);
              }}
            >
              <Icon name="play" /> Learn {s.settings.newPerSession} new anyway
            </button>
          )}
          <button className="btn btn-ghost btn-lg" onClick={() => navigate('/practice')}>
            <Icon name="zap" /> Practice modes
          </button>
          <button className="btn btn-ghost btn-lg" onClick={() => navigate('/')}>
            <Icon name="map" /> Map
          </button>
        </div>
      </div>
    );
  }

  return (
    <QuizRunner
      key={run}
      initial={items}
      mode="learn"
      title={`Learn · ${label}`}
      onExit={() => navigate('/')}
      onAgain={() => {
        setItems(plan());
        setRun((r) => r + 1);
      }}
    />
  );
}
