import type { Continent, Country } from './types.ts';
import { CONTINENTS } from './types.ts';
import { africa } from './countries/africa.ts';
import { asia } from './countries/asia.ts';
import { europe } from './countries/europe.ts';
import { northAmerica, southAmerica } from './countries/americas.ts';
import { oceania } from './countries/oceania.ts';

export const COUNTRIES: Country[] = [
  ...africa,
  ...asia,
  ...europe,
  ...northAmerica,
  ...southAmerica,
  ...oceania,
];

export const BY_ID: Record<string, Country> = Object.fromEntries(COUNTRIES.map((c) => [c.id, c]));

export function getCountry(id: string): Country {
  const c = BY_ID[id];
  if (!c) throw new Error(`Unknown country id: ${id}`);
  return c;
}

/** Sub-regions in display order, grouped by continent (order of first appearance in the data). */
export const REGIONS: { continent: Continent; region: string; ids: string[] }[] = (() => {
  const out: { continent: Continent; region: string; ids: string[] }[] = [];
  for (const c of COUNTRIES) {
    let r = out.find((x) => x.region === c.region);
    if (!r) {
      r = { continent: c.continent, region: c.region, ids: [] };
      out.push(r);
    }
    r.ids.push(c.id);
  }
  return out;
})();

export function regionsOf(continent: Continent) {
  return REGIONS.filter((r) => r.continent === continent);
}

export function idsOfContinent(continent: Continent): string[] {
  return COUNTRIES.filter((c) => c.continent === continent).map((c) => c.id);
}

/** A focus is "world", a continent, or a sub-region. */
export type Focus =
  | { kind: 'world' }
  | { kind: 'continent'; continent: Continent }
  | { kind: 'region'; region: string };

export function idsForFocus(focus: Focus): string[] {
  switch (focus.kind) {
    case 'world':
      return COUNTRIES.map((c) => c.id);
    case 'continent':
      return idsOfContinent(focus.continent);
    case 'region':
      return REGIONS.find((r) => r.region === focus.region)?.ids ?? [];
  }
}

export function focusLabel(focus: Focus): string {
  switch (focus.kind) {
    case 'world':
      return 'Whole world';
    case 'continent':
      return focus.continent;
    case 'region':
      return focus.region;
  }
}

export function focusKey(focus: Focus): string {
  return focus.kind === 'world' ? 'world' : focus.kind === 'continent' ? `c:${focus.continent}` : `r:${focus.region}`;
}

export function parseFocusKey(key: string | null | undefined): Focus {
  if (!key || key === 'world') return { kind: 'world' };
  if (key.startsWith('c:')) {
    const c = key.slice(2) as Continent;
    if (CONTINENTS.includes(c)) return { kind: 'continent', continent: c };
  }
  if (key.startsWith('r:')) {
    const r = key.slice(2);
    if (REGIONS.some((x) => x.region === r)) return { kind: 'region', region: r };
  }
  return { kind: 'world' };
}

/** Every accepted answer for a country's capital (primary, spellings, official alternates). */
export function acceptedCapitals(c: Country): string[] {
  const out = [c.capital, ...(c.capitalAliases ?? [])];
  for (const a of c.altCapitals ?? []) out.push(a.name, ...(a.aliases ?? []));
  return out;
}

/** Every accepted name for a country. */
export function acceptedNames(c: Country): string[] {
  return [c.name, ...(c.aliases ?? [])];
}

export { CONTINENTS };
export type { Continent, Country };
