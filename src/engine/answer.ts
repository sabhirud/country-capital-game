import { COUNTRIES, acceptedCapitals, acceptedNames } from '../data/countries.ts';
import type { Country } from '../data/types.ts';
import { TRICK_CAPITALS } from '../data/trickCapitals.ts';

/** Lower-case, strip accents/punctuation, unify "saint"/"st", drop leading "the". */
export function normalize(s: string): string {
  let t = s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[’'`ʻ‘]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[.,\-_/()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  t = t.replace(/^the /, '');
  t = t.replace(/\bsaint\b/g, 'st').replace(/\bste?\b/g, 'st');
  return t;
}

/**
 * Edit distance with adjacent transpositions (optimal string alignment), so "Tokoy" is 1 away from "Tokyo".
 * Returns max + 1 as soon as the distance is known to exceed `max`.
 */
export function levenshtein(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = a.length;
  const m = b.length;
  let prev2: number[] = [];
  let prev: number[] = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[m];
}

/** How many typos we forgive for an answer of this length. */
export function typoTolerance(len: number): number {
  if (len <= 3) return 0;
  if (len <= 6) return 1;
  return 2;
}

export type CheckResult =
  | { verdict: 'correct'; canonical: string }
  | { verdict: 'typo'; canonical: string; typed: string }
  | { verdict: 'wrong'; otherCountry?: Country; decoy?: string };

const capitalIndex: { norm: string; country: Country; display: string }[] = COUNTRIES.flatMap((c) =>
  acceptedCapitals(c).map((cap) => ({ norm: normalize(cap), country: c, display: cap })),
);
const nameIndex: { norm: string; country: Country; display: string }[] = COUNTRIES.flatMap((c) =>
  acceptedNames(c).map((n) => ({ norm: normalize(n), country: c, display: n })),
);

function check(
  input: string,
  target: Country,
  accepted: string[],
  index: { norm: string; country: Country; display: string }[],
  decoys: string[],
): CheckResult {
  const typed = normalize(input);
  if (!typed) return { verdict: 'wrong' };
  const acc = accepted.map((a) => ({ a, n: normalize(a) }));

  const exact = acc.find((x) => x.n === typed);
  if (exact) return { verdict: 'correct', canonical: exact.a };

  // Exactly another country's answer → definitely wrong, and worth telling him which country it belongs to.
  const other = index.find((x) => x.norm === typed && x.country.id !== target.id);
  if (other) return { verdict: 'wrong', otherCountry: other.country };

  const decoy = decoys.find((d) => normalize(d) === typed);
  if (decoy) return { verdict: 'wrong', decoy };

  let best: { a: string; d: number } | null = null;
  for (const x of acc) {
    const tol = typoTolerance(x.n.length);
    const d = levenshtein(typed, x.n, tol);
    if (d <= tol && (!best || d < best.d)) best = { a: x.a, d };
  }
  if (best) {
    // make sure the typo isn't actually closer to some other country's answer
    const closerOther = index.find(
      (x) => x.country.id !== target.id && levenshtein(typed, x.norm, best!.d) < best!.d,
    );
    if (!closerOther) return { verdict: 'typo', canonical: best.a, typed: input.trim() };
  }

  // A near miss on another country's answer ("Brazzavile") → still tell him whose it is.
  const nearOther = index.find(
    (x) => x.country.id !== target.id && levenshtein(typed, x.norm, typoTolerance(x.norm.length)) <= typoTolerance(x.norm.length),
  );
  if (nearOther) return { verdict: 'wrong', otherCountry: nearOther.country };
  return { verdict: 'wrong' };
}

export function checkCapital(input: string, target: Country): CheckResult {
  return check(input, target, acceptedCapitals(target), capitalIndex, TRICK_CAPITALS[target.id] ?? []);
}

export function checkCountry(input: string, target: Country): CheckResult {
  return check(input, target, acceptedNames(target), nameIndex, []);
}

export function isCorrect(r: CheckResult): boolean {
  return r.verdict === 'correct' || r.verdict === 'typo';
}
