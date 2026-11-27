import { COUNTRIES, acceptedCapitals } from '../data/countries.ts';
import type { Country } from '../data/types.ts';
import { TRICK_CAPITALS } from '../data/trickCapitals.ts';
import { normalize } from './answer.ts';

export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Four capital options (one correct), with smart wrong answers:
 * his own past confusions first, then a famous "decoy" city (Sydney for Australia),
 * then capitals from the same sub-region and continent — so he must really know it.
 */
export function capitalChoices(
  target: Country,
  rng: () => number = Math.random,
  confusedWith?: Record<string, number>,
): string[] {
  const banned = new Set(acceptedCapitals(target).map(normalize));
  const picked: string[] = [];
  const add = (name: string) => {
    const n = normalize(name);
    if (banned.has(n) || picked.length >= 3) return;
    banned.add(n);
    picked.push(name);
  };

  const confusions = Object.entries(confusedWith ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => COUNTRIES.find((c) => c.id === id))
    .filter((c): c is Country => !!c);
  if (confusions[0]) add(confusions[0].capital);

  const decoys = TRICK_CAPITALS[target.id];
  if (decoys?.length && rng() < 0.65) add(decoys[Math.floor(rng() * decoys.length)]);

  const others = COUNTRIES.filter((c) => c.id !== target.id);
  const sameRegion = shuffle(others.filter((c) => c.region === target.region), rng);
  const sameContinent = shuffle(others.filter((c) => c.continent === target.continent && c.region !== target.region), rng);
  const rest = shuffle(others.filter((c) => c.continent !== target.continent), rng);
  for (const c of [...sameRegion.slice(0, 2), ...sameContinent, ...rest]) add(c.capital);

  return shuffle([target.capital, ...picked], rng);
}

/** Four country ids for "which flag has this capital?" — neighbors, so geography matters. */
export function flagChoices(target: Country, rng: () => number = Math.random): string[] {
  const scored = COUNTRIES.filter((c) => c.id !== target.id).map((c) => {
    const sharedColors = c.flag.colors.filter((x) => target.flag.colors.includes(x)).length;
    const colorSim = sharedColors / new Set([...c.flag.colors, ...target.flag.colors]).size;
    const score =
      (c.region === target.region ? 2 : 0) + (c.continent === target.continent ? 1 : 0) + colorSim * 0.6 + rng() * 1.4;
    return { id: c.id, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return shuffle([target.id, ...scored.slice(0, 3).map((s) => s.id)], rng);
}
