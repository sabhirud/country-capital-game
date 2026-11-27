/**
 * Spaced repetition, Leitner style.
 *
 * Each country is one card with a stage 0–6:
 *   0      new (never studied)
 *   1–2    BRONZE  – met it, recognized it (multiple choice)
 *   3–4    SILVER  – recalled it from memory (typed / tapped on the map)
 *   5–6    GOLD    – recalled it again after spaced gaps of several days
 *
 * A correct answer moves the card up one stage — but only as far as the question was hard enough
 * for (recognition questions can't earn silver, only typed recall can earn gold), and only if the
 * card was actually due (re-answering it early in the same day doesn't count). That's what makes
 * gold impossible to cram.
 */

export const DAY = 24 * 60 * 60 * 1000;
export const HOUR = 60 * 60 * 1000;

/** Time until the next review after reaching each stage. */
export const INTERVALS = [0, 0, 20 * HOUR, 2.5 * DAY, 6 * DAY, 14 * DAY, 30 * DAY];
export const MAX_STAGE = 6;

export type QuestionKind =
  | 'mc' // flag + country → pick the capital (4 options)
  | 'flag-pick' // capital → pick the right flag (4 flags)
  | 'map-tap' // capital → tap the country on the map
  | 'type-reverse' // capital → type the country
  | 'type'; // flag (+ maybe name) → type the capital

/** How strong a memory each kind of question demonstrates. */
export const STRENGTH: Record<QuestionKind, 1 | 2 | 3> = {
  mc: 1,
  'flag-pick': 1,
  'map-tap': 2,
  'type-reverse': 2,
  type: 3,
};

/** Highest stage a correct answer of that strength can lift a card to. */
const CAP_BY_STRENGTH = { 1: 2, 2: 4, 3: MAX_STAGE } as const;

export interface CardState {
  stage: number;
  due: number;
  lastSeen: number;
  seen: number;
  correct: number;
  wrong: number;
  /** ids of countries whose capital he gave instead of this one */
  confusedWith?: Record<string, number>;
}

export type Tier = 'none' | 'bronze' | 'silver' | 'gold';

export function newCard(): CardState {
  return { stage: 0, due: 0, lastSeen: 0, seen: 0, correct: 0, wrong: 0 };
}

export function tierOf(card: CardState | undefined): Tier {
  const s = card?.stage ?? 0;
  if (s >= 5) return 'gold';
  if (s >= 3) return 'silver';
  if (s >= 1) return 'bronze';
  return 'none';
}

export const TIER_RANK: Record<Tier, number> = { none: 0, bronze: 1, silver: 2, gold: 3 };

/** Overdue by more than its own interval → the memory is probably fading. */
export function isFading(card: CardState | undefined, now: number): boolean {
  if (!card || card.stage < 3) return false;
  const interval = INTERVALS[card.stage];
  return now > card.due + interval;
}

export function isDue(card: CardState | undefined, now: number): boolean {
  if (!card || card.stage === 0) return false;
  return card.due <= now;
}

/** A card counts as "reviewed on time" if it's due, allowing 20% slack for playing a bit early. */
function onTime(card: CardState, now: number): boolean {
  if (card.stage <= 1) return true;
  const interval = INTERVALS[card.stage];
  return now >= card.due - interval * 0.2;
}

export interface AnswerInput {
  correct: boolean;
  kind: QuestionKind;
  /** a hint was used: counts as a recognition-level answer */
  hinted?: boolean;
  /** practice mode: never moves a card down, only up */
  practice?: boolean;
  /** the id of another country whose answer he gave instead */
  confusedWith?: string;
}

export function applyAnswer(prev: CardState | undefined, a: AnswerInput, now: number): CardState {
  const card: CardState = { ...(prev ?? newCard()) };
  if (card.confusedWith) card.confusedWith = { ...card.confusedWith };
  card.seen += 1;
  card.lastSeen = now;

  if (a.correct) {
    card.correct += 1;
    const strength = a.hinted ? 1 : STRENGTH[a.kind];
    const cap = CAP_BY_STRENGTH[strength];
    if (card.stage === 0) {
      card.stage = 1;
    } else if (onTime(card, now) && card.stage < cap) {
      card.stage += 1;
    }
    card.due = now + INTERVALS[card.stage];
  } else {
    card.wrong += 1;
    if (a.confusedWith) {
      card.confusedWith = card.confusedWith ?? {};
      card.confusedWith[a.confusedWith] = (card.confusedWith[a.confusedWith] ?? 0) + 1;
    }
    if (!a.practice) {
      card.stage = Math.max(1, card.stage - 2);
      card.due = now; // review again soon
    } else if (card.stage === 0) {
      card.stage = 1;
      card.due = now;
    }
  }
  return card;
}

/** Which kinds of question suit a card at this stage. Weighted list. */
export function kindsForStage(stage: number): [QuestionKind, number][] {
  if (stage <= 0) return [['mc', 1]];
  if (stage === 1) return [['mc', 3], ['flag-pick', 2]];
  if (stage === 2) return [['type', 6], ['map-tap', 2], ['type-reverse', 1], ['mc', 1]];
  return [['type', 5], ['map-tap', 2], ['type-reverse', 2], ['flag-pick', 1]];
}

export function pickKind(stage: number, rng: () => number = Math.random, allowMap = true): QuestionKind {
  const opts = kindsForStage(stage).filter(([k]) => allowMap || k !== 'map-tap');
  const total = opts.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [k, w] of opts) {
    r -= w;
    if (r < 0) return k;
  }
  return opts[0][0];
}
