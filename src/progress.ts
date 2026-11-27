import { COUNTRIES, CONTINENTS, idsOfContinent } from './data/countries.ts';
import type { Continent } from './data/types.ts';
import { isDue, isFading, tierOf, TIER_RANK, type CardState, type Tier } from './engine/srs.ts';

export interface TierCounts {
  none: number;
  bronze: number;
  silver: number;
  gold: number;
  fading: number;
  due: number;
  total: number;
}

export function countTiers(ids: string[], cards: Record<string, CardState>, now = Date.now()): TierCounts {
  const out: TierCounts = { none: 0, bronze: 0, silver: 0, gold: 0, fading: 0, due: 0, total: ids.length };
  for (const id of ids) {
    const c = cards[id];
    out[tierOf(c)] += 1;
    if (isFading(c, now)) out.fading += 1;
    if (isDue(c, now)) out.due += 1;
  }
  return out;
}

/** The lowest tier every country of the continent has reached. */
export function continentTier(continent: Continent, cards: Record<string, CardState>): Tier {
  let min: Tier = 'gold';
  for (const id of idsOfContinent(continent)) {
    const t = tierOf(cards[id]);
    if (TIER_RANK[t] < TIER_RANK[min]) min = t;
  }
  return min;
}

export function worldTier(cards: Record<string, CardState>): Tier {
  let min: Tier = 'gold';
  for (const c of COUNTRIES) {
    const t = tierOf(cards[c.id]);
    if (TIER_RANK[t] < TIER_RANK[min]) min = t;
  }
  return min;
}

export { CONTINENTS };

export const TIER_LABEL: Record<Tier, string> = { none: 'Not met yet', bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };
export const TIER_EMOJI: Record<Tier, string> = { none: '·', bronze: '🥉', silver: '🥈', gold: '🥇' };

export function classForCard(c: CardState | undefined, now = Date.now()): string {
  const t = tierOf(c);
  return `tier-${t}${isFading(c, now) ? ' fading' : ''}`;
}

/** Readable "in 3 hours" / "tomorrow" for the next due review. */
export function nextDueText(cards: Record<string, CardState>, now = Date.now()): string | null {
  let next = Infinity;
  for (const c of Object.values(cards)) if (c.stage > 0 && c.due > now && c.due < next) next = c.due;
  if (!Number.isFinite(next)) return null;
  const h = (next - now) / 3_600_000;
  if (h < 1) return `in ${Math.max(1, Math.round(h * 60))} min`;
  if (h < 20) return `in ${Math.round(h)} h`;
  const d = Math.round(h / 24);
  return d <= 1 ? 'tomorrow' : `in ${d} days`;
}
