import { useState } from 'react';
import { BY_ID, REGIONS, focusLabel, idsForFocus, parseFocusKey } from '../data/countries.ts';
import { TRICK_IDS } from '../data/trickCapitals.ts';
import { shuffle } from '../engine/distractors.ts';
import type { QueueItem, PromptStyle } from '../engine/session.ts';
import type { QuestionKind } from '../engine/srs.ts';
import { getSave, setFocus, useSave } from '../store.ts';
import { QuizRunner } from '../components/quiz/QuizRunner.tsx';
import { FocusPicker } from '../components/FocusPicker.tsx';
import { Icon } from '../components/Icon.tsx';
import { navigate } from '../router.ts';

interface ModeDef {
  key: string;
  title: string;
  desc: string;
  icon: string;
  usesFocus: boolean;
}

export const MODES: ModeDef[] = [
  { key: 'flag-capital', title: 'Flag → Capital', desc: 'See a flag, type its capital. Uses your flag superpower.', icon: 'flag', usesFocus: true },
  { key: 'country-capital', title: 'Country → Capital', desc: 'Name only, no flag. Pick from 4, then type.', icon: 'keyboard', usesFocus: true },
  { key: 'capital-country', title: 'Capital → Country', desc: 'Reverse it: which country owns this capital?', icon: 'shuffle', usesFocus: true },
  { key: 'capital-flag', title: 'Capital → Flag', desc: 'Pick the right flag out of 4 look-alike neighbors.', icon: 'target', usesFocus: true },
  { key: 'map-pin', title: 'Map Pin', desc: 'Given a capital, tap its country on the map.', icon: 'pin', usesFocus: true },
  { key: 'sweep', title: 'Map Sweep', desc: 'Clear a whole region: name every capital as the map fills in.', icon: 'sweep', usesFocus: true },
  { key: 'tricks', title: 'Trick Capitals', desc: 'Sydney? Istanbul? Lagos? Beat the classic traps.', icon: 'trick', usesFocus: false },
  { key: 'weak', title: 'Weak Spots', desc: 'Your most-missed capitals, hammered until they stick.', icon: 'weak', usesFocus: false },
];

const ROUND = 15;

function mk(id: string, kind: QuestionKind, prompt: PromptStyle = 'both'): QueueItem {
  return { id, kind, prompt, study: false, round: 1 };
}

function sweepRegionFor(focusKeyStr: string): string {
  const f = parseFocusKey(focusKeyStr);
  if (f.kind === 'region') return f.region;
  const cards = getSave().cards;
  const regions = f.kind === 'continent' ? REGIONS.filter((r) => r.continent === f.continent) : REGIONS;
  // the region with the most not-yet-solid countries, so sweeps target what needs work
  return [...regions].sort((a, b) => weakness(b.ids) - weakness(a.ids))[0].region;
  function weakness(ids: string[]) {
    return ids.reduce((s, id) => s + (6 - (cards[id]?.stage ?? 0)), 0) / ids.length;
  }
}

export function buildPractice(mode: string, focusKeyStr: string): { items: QueueItem[]; sweepIds?: string[]; title: string } {
  const focusIds = idsForFocus(parseFocusKey(focusKeyStr));
  const pick = (ids: string[]) => shuffle(ids).slice(0, ROUND);
  const cards = getSave().cards;
  switch (mode) {
    case 'flag-capital':
      return { items: pick(focusIds).map((id) => mk(id, 'type', 'flag')), title: 'Flag → Capital' };
    case 'country-capital':
      return { items: pick(focusIds).map((id, i) => mk(id, i % 2 ? 'type' : 'mc', 'name')), title: 'Country → Capital' };
    case 'capital-country':
      return { items: pick(focusIds).map((id) => mk(id, 'type-reverse')), title: 'Capital → Country' };
    case 'capital-flag':
      return { items: pick(focusIds).map((id) => mk(id, 'flag-pick')), title: 'Capital → Flag' };
    case 'map-pin':
      return { items: pick(focusIds).map((id) => mk(id, 'map-tap')), title: 'Map Pin' };
    case 'tricks':
      return { items: shuffle(TRICK_IDS).slice(0, ROUND).map((id, i) => mk(id, i % 3 === 2 ? 'type' : 'mc', 'both')), title: 'Trick Capitals' };
    case 'weak': {
      const seen = Object.entries(cards).filter(([, c]) => c.seen > 0);
      const ranked = seen
        .map(([id, c]) => ({ id, score: c.wrong * 2 - c.correct * 0.5 + (6 - c.stage) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, ROUND)
        .map((x) => x.id);
      return { items: shuffle(ranked).map((id) => mk(id, (cards[id]?.stage ?? 0) >= 2 ? 'type' : 'mc', 'both')), title: 'Weak Spots' };
    }
    case 'sweep': {
      const region = sweepRegionFor(focusKeyStr);
      const ids = REGIONS.find((r) => r.region === region)!.ids;
      return { items: shuffle(ids).map((id) => mk(id, 'type', 'both')), sweepIds: ids, title: `Map Sweep · ${region}` };
    }
  }
  return { items: [], title: '' };
}

export function Practice({ mode }: { mode?: string }) {
  const save = useSave();
  const [run, setRun] = useState(0);
  const [built, setBuilt] = useState(() => (mode ? buildPractice(mode, save.focus) : null));

  if (mode && built) {
    if (built.items.length === 0) {
      return (
        <div className="screen empty-state">
          <div className="big-emoji">🌱</div>
          <h1>Nothing here yet</h1>
          <p>{mode === 'weak' ? 'Answer some questions first. Your weak spots will show up here.' : 'No countries in this focus.'}</p>
          <button className="btn btn-primary btn-lg" onClick={() => navigate('/practice')}>
            Back
          </button>
        </div>
      );
    }
    return (
      <QuizRunner
        key={run}
        initial={built.items}
        mode={mode === 'sweep' ? 'sweep' : 'practice'}
        title={built.title}
        sweepIds={built.sweepIds}
        onExit={() => navigate('/practice')}
        onAgain={() => {
          setBuilt(buildPractice(mode, getSave().focus));
          setRun((r) => r + 1);
        }}
      />
    );
  }

  const focus = parseFocusKey(save.focus);
  const seenAny = Object.values(save.cards).some((c) => c.seen > 0);
  return (
    <div className="screen practice">
      <header className="screen-head">
        <h1>Practice</h1>
        <p className="muted">Free play. Practice can only move countries up, never down. Focus: <strong>{focusLabel(focus)}</strong></p>
      </header>
      <FocusPicker value={save.focus} onChange={setFocus} cards={save.cards} />
      <div className="mode-grid">
        {MODES.map((m) => {
          const disabled = m.key === 'weak' && !seenAny;
          return (
            <button key={m.key} className="mode-card" disabled={disabled} onClick={() => navigate(`/practice/${m.key}`)}>
              <span className="mode-icon">
                <Icon name={m.icon} size={26} />
              </span>
              <span className="mode-title">{m.title}</span>
              <span className="mode-desc">{disabled ? 'Unlocks after your first session.' : m.desc}</span>
              {m.usesFocus && <span className="mode-focus">{m.key === 'sweep' ? `Region: ${sweepRegionFor(save.focus)}` : focusLabel(focus)}</span>}
            </button>
          );
        })}
      </div>
      <p className="muted small center">
        Tip: trick capitals include {['au', 'tr', 'ca', 'br', 'ng'].map((id) => BY_ID[id].name).join(', ')} and more.
      </p>
    </div>
  );
}
