import { COUNTRIES } from '../data/countries.ts';
import { type CardState, type QuestionKind, INTERVALS, HOUR, isDue, pickKind } from './srs.ts';
import { shuffle } from './distractors.ts';

export type PromptStyle = 'flag' | 'name' | 'both';

export interface QueueItem {
  id: string;
  kind: QuestionKind;
  /** show the study card before the question (first time he meets the country) */
  study: boolean;
  prompt: PromptStyle;
  /** how many times this country has come up in the current session */
  round: number;
}

export interface BuildOptions {
  cards: Record<string, CardState>;
  focusIds: string[];
  now: number;
  newLimit: number;
  size: number;
  rng?: () => number;
  allowMap?: boolean;
}

export function promptFor(kind: QuestionKind, stage: number, rng: () => number): PromptStyle {
  if (kind !== 'type') return 'both';
  // As memory strengthens, lean on the flag alone (he knows all the flags!)
  if (stage >= 3) return rng() < 0.5 ? 'flag' : rng() < 0.5 ? 'name' : 'both';
  return rng() < 0.3 ? 'flag' : 'both';
}

function overdueScore(card: CardState, now: number): number {
  const interval = Math.max(INTERVALS[card.stage], HOUR);
  return (now - card.due) / interval;
}

export interface SessionPlan {
  items: QueueItem[];
  dueCount: number;
  newCount: number;
}

/**
 * A session = due reviews (most overdue first, focus first, mixed across regions)
 * + a few brand-new countries from the next unfinished sub-region of the focus (chunking),
 * spread among the reviews (interleaving).
 */
export function buildSession(o: BuildOptions): SessionPlan {
  const rng = o.rng ?? Math.random;
  const allowMap = o.allowMap ?? true;
  const inFocus = new Set(o.focusIds);
  const all = COUNTRIES.map((c) => c.id);

  const byUrgency = (ids: string[]) =>
    ids
      .filter((id) => isDue(o.cards[id], o.now))
      .sort((a, b) => overdueScore(o.cards[b], o.now) - overdueScore(o.cards[a], o.now));

  const dueFocus = byUrgency(o.focusIds);
  const dueOther = inFocus.size === all.length ? [] : byUrgency(all.filter((id) => !inFocus.has(id)));
  const reviewIds = [...dueFocus, ...dueOther.slice(0, Math.floor(o.size / 3))].slice(0, o.size);

  const unseen = o.focusIds.filter((id) => (o.cards[id]?.stage ?? 0) === 0);
  const room = o.size - reviewIds.length;
  // don't pile on new countries when there's a review backlog
  const newCount = Math.max(0, Math.min(o.newLimit, unseen.length, room));
  const newIds = unseen.slice(0, newCount);

  // mix reviews from different regions instead of one region in a row
  const reviews: QueueItem[] = shuffle(reviewIds, rng)
    .sort((a, b) => overdueScore(o.cards[b], o.now) - overdueScore(o.cards[a], o.now) + (rng() - 0.5) * 2)
    .map((id) => {
      const stage = o.cards[id]?.stage ?? 1;
      const kind = pickKind(stage, rng, allowMap);
      return { id, kind, study: false, prompt: promptFor(kind, stage, rng), round: 1 };
    });
  const fresh: QueueItem[] = newIds.map((id) => ({ id, kind: 'mc', study: true, prompt: 'both', round: 1 }));

  // interleave: a new country, then a couple of reviews, …
  const items: QueueItem[] = [];
  const gap = fresh.length ? Math.max(1, Math.floor(reviews.length / fresh.length)) : 0;
  let r = 0;
  for (const f of fresh) {
    items.push(f);
    for (let k = 0; k < gap && r < reviews.length; k++) items.push(reviews[r++]);
  }
  while (r < reviews.length) items.push(reviews[r++]);

  return { items, dueCount: reviewIds.length, newCount };
}

const MAX_ROUNDS = 4;

/**
 * After each answer, decide whether the country comes back later in this session:
 *  - wrong → again in 3–4 questions (as an easier question if it's shaky)
 *  - a brand-new country answered right once → once more a few questions later, to lock it in
 */
export function requeue(
  items: QueueItem[],
  index: number,
  correct: boolean,
  cardAfter: CardState,
  rng: () => number = Math.random,
  allowMap = true,
): QueueItem[] {
  const cur = items[index];
  if (cur.round >= MAX_ROUNDS) return items;
  let offset: number | null = null;
  if (!correct) offset = 3 + Math.floor(rng() * 2);
  else if (cardAfter.stage < 2) offset = 4 + Math.floor(rng() * 3);
  if (offset === null) return items;
  const kind = pickKind(cardAfter.stage, rng, allowMap);
  const next: QueueItem = { id: cur.id, kind, study: false, prompt: promptFor(kind, cardAfter.stage, rng), round: cur.round + 1 };
  const out = items.slice();
  out.splice(Math.min(out.length, index + 1 + offset), 0, next);
  return out;
}
