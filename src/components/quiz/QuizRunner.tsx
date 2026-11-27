import { useEffect, useMemo, useRef, useState } from 'react';
import { BY_ID, COUNTRIES, CONTINENTS, REGIONS } from '../../data/countries.ts';
import type { Country } from '../../data/types.ts';
import { checkCapital, checkCountry, isCorrect, type CheckResult } from '../../engine/answer.ts';
import { capitalChoices, flagChoices } from '../../engine/distractors.ts';
import { requeue, type QueueItem } from '../../engine/session.ts';
import { TIER_RANK, type QuestionKind } from '../../engine/srs.ts';
import { recordAnswer, useSave, markCelebrated, getSave, type AnswerOutcome } from '../../store.ts';
import { sfx } from '../../audio/sfx.ts';
import { sayCapital } from '../../audio/speech.ts';
import { burst } from '../../celebrate.ts';
import { continentTier, worldTier, TIER_EMOJI, TIER_LABEL } from '../../progress.ts';
import { Globe } from '../../map/Globe.tsx';
import { FlatMap, type CapitalDot, type MapMark } from '../../map/FlatMap.tsx';
import { Flag } from '../Flag.tsx';
import { Icon } from '../Icon.tsx';
import { CountryCard, SpeakButton } from '../CountryCard.tsx';
import { toast } from '../Toasts.tsx';
import { Summary } from './Summary.tsx';

export type RunMode = 'learn' | 'practice' | 'sweep';

export interface Result {
  id: string;
  kind: QuestionKind;
  correct: boolean;
  hinted: boolean;
  check?: CheckResult;
  chosen?: string;
  typed?: string;
  outcome: AnswerOutcome;
}

interface Props {
  initial: QueueItem[];
  mode: RunMode;
  title: string;
  onExit: () => void;
  onAgain: () => void;
  /** Map Sweep: the countries of the region being swept */
  sweepIds?: string[];
}

type Phase = 'study' | 'ask' | 'feedback' | 'done';

const QUESTION_TEXT: Record<QuestionKind, string> = {
  mc: 'What is the capital?',
  type: 'Type the capital',
  'flag-pick': 'Which flag goes with this capital?',
  'type-reverse': 'Which country has this capital?',
  'map-tap': 'Tap the country on the map',
};

function pattern(word: string) {
  return word
    .split('')
    .map((ch, i) => (i === 0 ? ch : /\s/.test(ch) ? ' ' : /[-'’.]/.test(ch) ? ch : '_'))
    .join(' ');
}

/** Map-tap area: the target's sub-region plus a neighboring one, so the answer isn't simply "the one region shown". */
function mapAreaFor(c: Country, salt: number): string[] {
  const regs = REGIONS.filter((r) => r.continent === c.continent);
  const i = regs.findIndex((r) => r.region === c.region);
  const j = regs.length < 2 ? i : salt % 2 === 0 ? (i + 1) % regs.length : (i - 1 + regs.length) % regs.length;
  return [...new Set([...regs[i].ids, ...regs[j].ids])];
}

function useWide() {
  const q = '(min-width: 900px)';
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setWide(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return wide;
}

export function QuizRunner({ initial, mode, title, onExit, onAgain, sweepIds }: Props) {
  const wide = useWide();
  const save = useSave();
  const [queue, setQueue] = useState<QueueItem[]>(initial);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>(initial[0]?.study ? 'study' : 'ask');
  const [hint, setHint] = useState(0);
  const [typed, setTyped] = useState('');
  const [last, setLast] = useState<Result | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [retype, setRetype] = useState('');
  const [retypeOk, setRetypeOk] = useState(false);
  const feedbackAt = useRef(0);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const item = queue[index];
  const country: Country | null = item ? BY_ID[item.id] : null;
  const card = item ? save.cards[item.id] : undefined;

  // options are fixed per question
  const options = useMemo(() => {
    if (!country) return { capitals: [] as string[], flags: [] as string[] };
    return {
      capitals: capitalChoices(country, Math.random, getSave().cards[country.id]?.confusedWith),
      flags: flagChoices(country),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, item?.id]);

  const typedKind = item && (item.kind === 'type' || item.kind === 'type-reverse');
  const showMcFallback = typedKind && hint >= 3;

  useEffect(() => {
    if (phase === 'study' || phase === 'ask') window.scrollTo({ top: 0, behavior: 'smooth' });
    if (phase === 'study' && country) sayCapital(country);
    if (phase === 'ask' && typedKind && !showMcFallback) setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
    if (phase === 'feedback') setTimeout(() => feedbackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, index]);

  function finish(answer: { correct: boolean; check?: CheckResult; chosen?: string; typed?: string; confusedWith?: string }) {
    if (!item || !country || phase !== 'ask') return;
    const hinted = hint > 0;
    const outcome = recordAnswer(item.id, {
      correct: answer.correct,
      kind: showMcFallback ? 'mc' : item.kind,
      hinted,
      practice: mode !== 'learn',
      confusedWith: answer.confusedWith,
    });
    const res: Result = { id: item.id, kind: item.kind, correct: answer.correct, hinted, check: answer.check, chosen: answer.chosen, typed: answer.typed, outcome };
    setLast(res);
    setResults((r) => [...r, res]);
    if (answer.correct) {
      if (answer.check?.verdict === 'typo') sfx.typo();
      else sfx.correct();
    } else {
      sfx.wrong();
      sayCapital(country);
    }
    if (TIER_RANK[outcome.tierAfter] > TIER_RANK[outcome.tierBefore] && outcome.tierAfter !== 'bronze') {
      const t = outcome.tierAfter;
      setTimeout(() => {
        if (t === 'gold') {
          sfx.gold();
          burst('gold');
        } else sfx.tierUp();
        toast({ text: `${TIER_EMOJI[t]} ${country.name} → ${TIER_LABEL[t]}!`, tone: t === 'none' ? 'info' : t, flag: country.id });
      }, 350);
    }
    if (mode === 'learn' || !answer.correct) setQueue((q) => requeue(q, index, answer.correct, outcome.after, Math.random, true));
    setRetype('');
    setRetypeOk(false);
    feedbackAt.current = performance.now();
    setPhase('feedback');
  }

  function next() {
    if (performance.now() - feedbackAt.current < 300) return;
    const ni = index + 1;
    if (ni >= queue.length) {
      setPhase('done');
      sfx.finish();
      celebrateConquests();
      return;
    }
    setIndex(ni);
    setHint(0);
    setTyped('');
    setLast(null);
    setPhase(queue[ni].study ? 'study' : 'ask');
  }

  function celebrateConquests() {
    const cards = getSave().cards;
    const celebrated = getSave().celebrated;
    let big = false;
    for (const c of CONTINENTS) {
      const t = continentTier(c, cards);
      if (t === 'none' || t === 'bronze') continue;
      if (TIER_RANK[t] > TIER_RANK[(celebrated[c] as keyof typeof TIER_RANK) ?? 'none']) {
        markCelebrated(c, t);
        toast({ text: `${TIER_EMOJI[t]} You conquered ${c} at ${TIER_LABEL[t]}!`, tone: t }, 5000);
        big = true;
      }
    }
    const wt = worldTier(cards);
    if (wt !== 'none' && wt !== 'bronze' && TIER_RANK[wt] > TIER_RANK[(celebrated.world as keyof typeof TIER_RANK) ?? 'none']) {
      markCelebrated('world', wt);
      toast({ text: `🌍 THE WHOLE WORLD at ${TIER_LABEL[wt]}! Legendary.`, tone: wt }, 7000);
      big = true;
    }
    const acc = results.length ? results.filter((r) => r.correct).length / results.length : 0;
    if (big) burst('big');
    else if (acc >= 0.8 && results.length >= 5) burst('small');
  }

  // ── answer handlers ──
  const chooseCapital = (choice: string) => {
    if (!country) return;
    const correct = choice === country.capital;
    const other = COUNTRIES.find((c) => c.capital === choice && c.id !== country.id);
    finish({ correct, chosen: choice, confusedWith: correct ? undefined : other?.id });
  };
  const chooseFlag = (id: string) => {
    if (!country) return;
    finish({ correct: id === country.id, chosen: id, confusedWith: id === country.id ? undefined : id });
  };
  const submitTyped = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!country || !item || !typed.trim()) return;
    const check = item.kind === 'type-reverse' ? checkCountry(typed, country) : checkCapital(typed, country);
    finish({ correct: isCorrect(check), check, typed, confusedWith: check.verdict === 'wrong' ? check.otherCountry?.id : undefined });
  };
  const tapMap = (id: string) => {
    if (!country || phase !== 'ask') return;
    sfx.tap();
    finish({ correct: id === country.id, chosen: id, confusedWith: id === country.id ? undefined : id });
  };

  const needsRetype = phase === 'feedback' && last && !last.correct && typedKind && save.settings.retypeOnWrong && !retypeOk;

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      const inField = tag === 'input' || tag === 'textarea';
      if (e.key === 'Escape') return onExit();
      if (phase === 'study' && (e.key === 'Enter' || e.key === ' ') && tag !== 'button') {
        e.preventDefault();
        setPhase('ask');
      } else if (phase === 'ask' && !inField) {
        const n = Number(e.key);
        if (n >= 1 && n <= 4) {
          if (item?.kind === 'mc' || (showMcFallback && item?.kind === 'type')) chooseCapital(options.capitals[n - 1]);
          else if (item?.kind === 'flag-pick' || (showMcFallback && item?.kind === 'type-reverse')) chooseFlag(options.flags[n - 1]);
        }
        if ((e.key === 'h' || e.key === 'H') && typedKind) setHint((h) => Math.min(3, h + 1));
      } else if (phase === 'feedback' && !inField && tag !== 'button' && (e.key === 'Enter' || e.key === ' ') && !needsRetype) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!item || !country || phase === 'done') {
    return (
      <div className="quiz">
        <Summary results={results} mode={mode} onAgain={onAgain} onExit={onExit} />
      </div>
    );
  }

  // ── visual (globe or map) ──
  const hideLocation = phase === 'ask' && (item.kind === 'flag-pick' || item.kind === 'type-reverse');
  const useFlatMap = item.kind === 'map-tap' || mode === 'sweep';
  let visual: React.ReactNode;
  if (useFlatMap) {
    const fitIds = mode === 'sweep' && sweepIds ? sweepIds : mapAreaFor(country, index);
    const marks: MapMark[] = [];
    const capitals: CapitalDot[] = [];
    if (mode === 'sweep') {
      const done = new Set(results.filter((r) => r.correct).map((r) => r.id));
      for (const id of done) capitals.push({ id, label: BY_ID[id].capital, state: 'ok' });
      if (phase !== 'feedback') marks.push({ id: item.id, state: 'target' });
    }
    if (phase === 'feedback' && last) {
      if (item.kind === 'map-tap' && last.chosen && last.chosen !== item.id) marks.push({ id: last.chosen, state: 'bad' });
      marks.push({ id: item.id, state: last.correct ? 'ok' : 'target' });
      if (!capitals.some((c) => c.id === item.id)) capitals.push({ id: item.id, label: country.capital, state: last.correct ? 'ok' : 'bad' });
    }
    const swept = new Set(results.filter((r) => r.correct).map((r) => r.id));
    visual = (
      <FlatMap
        className="quiz-map"
        fitIds={fitIds}
        aspect={wide ? 1 : 1.15}
        onPick={item.kind === 'map-tap' && phase === 'ask' ? tapMap : undefined}
        marks={marks}
        capitals={capitals}
        classOf={(id) => (mode === 'sweep' ? (swept.has(id) ? 'swept' : fitIds.includes(id) ? 'in-focus' : 'dim') : fitIds.includes(id) ? 'in-focus' : 'dim')}
        ariaLabel={item.kind === 'map-tap' ? 'Map: tap the country' : 'Map'}
      />
    );
  } else {
    visual = (
      <Globe
        focusId={hideLocation ? null : item.id}
        hideHighlight={hideLocation}
        showCapital={phase !== 'ask'}
        autoRotate={hideLocation}
        interactive
      />
    );
  }

  const progress = Math.min(1, index / Math.max(1, queue.length));
  const showName = item.prompt !== 'flag';
  const showFlag = item.prompt !== 'name';

  return (
    <div className="quiz">
      <header className="quiz-top">
        <button className="icon-btn" onClick={onExit} aria-label="Leave session">
          <Icon name="close" />
        </button>
        <div className="quiz-progress" role="progressbar" aria-valuemin={0} aria-valuemax={queue.length} aria-valuenow={index}>
          <div className="qp-fill" style={{ width: `${progress * 100}%` }} />
        </div>
        <span className="quiz-count">
          {Math.min(index + 1, queue.length)}/{queue.length}
        </span>
      </header>
      <div className="quiz-title">{title}</div>

      <div className={`quiz-body ${useFlatMap ? 'with-map' : 'with-globe'}`}>
        <section className="quiz-visual">{visual}</section>

        <section className="quiz-panel">
          {phase === 'study' && (
            <div className="study">
              <div className="study-badge">✨ New country</div>
              <CountryCard c={country} card={card} />
              <button className="btn btn-primary btn-lg" onClick={() => setPhase('ask')} autoFocus>
                Got it, quiz me <Icon name="arrow" />
              </button>
            </div>
          )}

          {(phase === 'ask' || phase === 'feedback') && (
            <div className={`question q-${item.kind}`}>
              <div className="q-label">{showMcFallback ? 'Pick one' : QUESTION_TEXT[item.kind]}</div>

              {(item.kind === 'mc' || item.kind === 'type') && (
                <div className="q-prompt">
                  {showFlag && <Flag id={country.id} size="xl" secret className="q-flag" />}
                  {showName && <div className="q-country">{country.name}</div>}
                  {!showName && <div className="q-country muted">Which country? You know this flag 😉</div>}
                </div>
              )}
              {(item.kind === 'flag-pick' || item.kind === 'type-reverse' || item.kind === 'map-tap') && (
                <div className="q-prompt">
                  <div className="q-capital">{country.capital}</div>
                  <div className="q-sub">{item.kind === 'map-tap' ? `is the capital of… (somewhere in ${country.continent})` : 'is the capital of…'}</div>
                </div>
              )}

              {/* multiple choice: capitals */}
              {(item.kind === 'mc' || (showMcFallback && item.kind === 'type')) && (
                <div className="options">
                  {options.capitals.map((opt, i) => {
                    const state = phase === 'feedback' ? (opt === country.capital ? 'ok' : opt === last?.chosen ? 'bad' : 'off') : '';
                    return (
                      <button key={opt} className={`option ${state}`} disabled={phase !== 'ask'} onClick={() => chooseCapital(opt)}>
                        <kbd>{i + 1}</kbd>
                        <span>{opt}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* multiple choice: flags */}
              {(item.kind === 'flag-pick' || (showMcFallback && item.kind === 'type-reverse')) && (
                <div className="flag-options">
                  {options.flags.map((id, i) => {
                    const state = phase === 'feedback' ? (id === country.id ? 'ok' : id === last?.chosen ? 'bad' : 'off') : '';
                    return (
                      <button key={id} className={`flag-option ${state}`} disabled={phase !== 'ask'} onClick={() => chooseFlag(id)} aria-label={`Option ${i + 1}`}>
                        <kbd>{i + 1}</kbd>
                        <Flag id={id} size="lg" secret />
                        {(phase === 'feedback' || item.kind === 'type-reverse') && <span className="fo-name">{BY_ID[id].name}</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* typed answers */}
              {typedKind && !showMcFallback && (
                <form className="type-form" onSubmit={submitTyped}>
                  <input
                    ref={inputRef}
                    className={`type-input ${phase === 'feedback' ? (last?.correct ? 'ok' : 'bad') : ''}`}
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    disabled={phase !== 'ask'}
                    placeholder={item.kind === 'type-reverse' ? 'Country…' : 'Capital city…'}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="words"
                    spellCheck={false}
                    enterKeyHint="go"
                    aria-label={item.kind === 'type-reverse' ? 'Country name' : 'Capital city'}
                  />
                  {phase === 'ask' && (
                    <div className="type-actions">
                      <button type="button" className="btn btn-ghost" onClick={() => setHint((h) => Math.min(3, h + 1))} title="Hint (H)">
                        <Icon name="bulb" size={18} /> {hint === 0 ? 'Hint' : hint < 3 ? 'More help' : ''}
                      </button>
                      <button type="submit" className="btn btn-primary" disabled={!typed.trim()}>
                        Check <Icon name="arrow" size={18} />
                      </button>
                    </div>
                  )}
                  {phase === 'ask' && hint > 0 && (
                    <div className="hint">
                      {(() => {
                        const ans = item.kind === 'type-reverse' ? country.name : country.capital;
                        if (hint === 1) return <>Starts with <strong>“{ans[0]}”</strong></>;
                        return <span className="pattern">{pattern(ans)}</span>;
                      })()}
                    </div>
                  )}
                </form>
              )}

              {phase === 'ask' && typedKind && hint === 2 && (
                <button className="link-btn" onClick={() => setHint(3)}>
                  Still stuck? Show 4 choices
                </button>
              )}
            </div>
          )}

          {phase === 'feedback' && last && (
            <div className={`feedback ${last.correct ? 'ok' : 'bad'}`} ref={feedbackRef}>
              <div className="fb-banner">
                <span className="fb-icon">
                  <Icon name={last.correct ? 'check' : 'x'} size={26} />
                </span>
                <div>
                  <div className="fb-title">
                    {last.correct ? (last.check?.verdict === 'typo' ? 'Correct! (tiny typo)' : ['Correct!', 'Nice!', 'Spot on!', 'Yes!'][index % 4]) : 'Not quite'}
                  </div>
                  <FeedbackDetail result={last} country={country} />
                </div>
              </div>
              <CountryCard c={country} card={save.cards[country.id]} compact />
              {needsRetype && (
                <form
                  className="retype"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const ok = item.kind === 'type-reverse' ? isCorrect(checkCountry(retype, country)) : isCorrect(checkCapital(retype, country));
                    if (ok) {
                      setRetypeOk(true);
                      sfx.tap();
                      feedbackAt.current = performance.now() - 200;
                    }
                  }}
                >
                  <label>
                    Type <strong>{item.kind === 'type-reverse' ? country.name : country.capital}</strong> once to lock it in:
                  </label>
                  <div className="retype-row">
                    <input
                      autoFocus
                      value={retype}
                      onChange={(e) => setRetype(e.target.value)}
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      enterKeyHint="done"
                      aria-label="Retype the answer"
                    />
                    <button className="btn btn-primary" type="submit">
                      OK
                    </button>
                  </div>
                  <button type="button" className="link-btn" onClick={() => setRetypeOk(true)}>
                    skip
                  </button>
                </form>
              )}
              {!needsRetype && (
                <button className="btn btn-primary btn-lg next-btn" onClick={next} autoFocus>
                  {index + 1 >= queue.length ? 'Finish' : 'Next'} <Icon name="arrow" />
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function FeedbackDetail({ result, country }: { result: Result; country: Country }) {
  const { check, kind, chosen, correct } = result;
  if (correct) {
    if (check?.verdict === 'typo') return <div className="fb-detail">It’s spelled <strong>{check.canonical}</strong>.</div>;
    if (check?.verdict === 'correct' && check.canonical !== country.capital && check.canonical !== country.name)
      return (
        <div className="fb-detail">
          <strong>{check.canonical}</strong> counts! The main capital is <strong>{country.capital}</strong>.
        </div>
      );
    return <div className="fb-detail">{country.capital} is the capital of {country.name}.</div>;
  }
  if (check?.verdict === 'wrong' && check.decoy)
    return (
      <div className="fb-detail">
        {check.decoy} is a famous city in {country.name}, but <strong>not</strong> the capital! It’s <strong>{country.capital}</strong>.
      </div>
    );
  if (check?.verdict === 'wrong' && check.otherCountry) {
    const o = check.otherCountry;
    return kind === 'type-reverse' ? (
      <div className="fb-detail">
        {o.name}’s capital is {o.capital}. <strong>{country.capital}</strong> belongs to <strong>{country.name}</strong>.
      </div>
    ) : (
      <div className="fb-detail">
        <Flag id={o.id} size="xs" /> {o.capital} is the capital of <strong>{o.name}</strong>. {country.name}’s is <strong>{country.capital}</strong>.
      </div>
    );
  }
  if ((kind === 'map-tap' || kind === 'flag-pick') && chosen && BY_ID[chosen]) {
    const o = BY_ID[chosen];
    return (
      <div className="fb-detail">
        That’s <Flag id={o.id} size="xs" /> {o.name} (capital {o.capital}). <strong>{country.capital}</strong> is in <strong>{country.name}</strong>.
      </div>
    );
  }
  if (kind === 'mc' && chosen) {
    const o = COUNTRIES.find((c) => c.capital === chosen);
    return o ? (
      <div className="fb-detail">
        {chosen} is the capital of <Flag id={o.id} size="xs" /> {o.name}. {country.name}’s is <strong>{country.capital}</strong>.
      </div>
    ) : (
      <div className="fb-detail">
        {chosen} is a famous city in {country.name}, but the capital is <strong>{country.capital}</strong>.
      </div>
    );
  }
  return (
    <div className="fb-detail">
      The answer is <strong>{kind === 'type-reverse' ? country.name : country.capital}</strong>. <SpeakButton country={country} label="" />
    </div>
  );
}
