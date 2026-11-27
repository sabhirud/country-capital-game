import { COUNTRIES, acceptedCapitals, acceptedNames } from '../data/countries.ts';
import type { Country } from '../data/types.ts';
import { levenshtein, normalize } from './answer.ts';

export interface SearchHit {
  country: Country;
  score: number;
  /** what matched, e.g. "capital" */
  via: 'country' | 'capital' | 'alias';
}

const index = COUNTRIES.map((c) => ({
  c,
  names: acceptedNames(c).map(normalize),
  caps: acceptedCapitals(c).map(normalize),
}));

function scoreTerm(q: string, term: string): number {
  if (term === q) return 100;
  if (term.startsWith(q)) return 85 - Math.min(20, term.length - q.length);
  if (term.split(' ').some((w) => w.startsWith(q))) return 70;
  if (q.length >= 3 && term.includes(q)) return 55;
  if (q.length >= 4) {
    const tol = q.length >= 7 ? 2 : 1;
    const d = levenshtein(q, term.slice(0, q.length + 1), tol);
    if (d <= tol) return 40 - d * 5;
  }
  return 0;
}

/** Search countries by country name, capital or alternate name (typo-tolerant). */
export function search(query: string, limit = 8): SearchHit[] {
  const q = normalize(query);
  if (!q) return [];
  const hits: SearchHit[] = [];
  for (const { c, names, caps } of index) {
    let best = 0;
    let via: SearchHit['via'] = 'country';
    names.forEach((n, i) => {
      const s = scoreTerm(q, n);
      if (s > best) {
        best = s;
        via = i === 0 ? 'country' : 'alias';
      }
    });
    caps.forEach((n) => {
      const s = scoreTerm(q, n) - 1; // tie → prefer the country
      if (s > best) {
        best = s;
        via = 'capital';
      }
    });
    if (best > 0) hits.push({ country: c, score: best, via });
  }
  return hits.sort((a, b) => b.score - a.score || a.country.name.localeCompare(b.country.name)).slice(0, limit);
}
