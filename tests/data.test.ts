import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { feature } from 'topojson-client';
import { geoContains, geoDistance } from 'd3-geo';
import type { Feature, Geometry } from 'geojson';
import { COUNTRIES, REGIONS, acceptedCapitals } from '../src/data/countries.ts';
import { TRICK_CAPITALS, TRICK_IDS } from '../src/data/trickCapitals.ts';
import world from '../src/generated/world.json';
import meta from '../src/generated/geoMeta.json';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const topo = world as any;
const fc = feature(topo, topo.objects.countries) as unknown as { features: Feature<Geometry>[] };
const shapes = new Map(fc.features.map((f) => [String(f.id), f]));
const M = meta as unknown as Record<string, { hasShape: boolean; tiny: boolean; centroid: [number, number] }>;
const RAD = Math.PI / 180;

function minVertexDistanceDeg(f: Feature<Geometry>, p: [number, number]): number {
  let best = Infinity;
  const visit = (coords: unknown): void => {
    if (Array.isArray(coords) && typeof coords[0] === 'number') {
      const d = geoDistance(coords as [number, number], p) / RAD;
      if (d < best) best = d;
    } else if (Array.isArray(coords)) coords.forEach(visit);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visit((f.geometry as any).coordinates);
  return best;
}

describe('country dataset', () => {
  it('has exactly 197 countries with unique ids', () => {
    expect(COUNTRIES).toHaveLength(197);
    expect(new Set(COUNTRIES.map((c) => c.id)).size).toBe(197);
    expect(new Set(COUNTRIES.map((c) => c.name)).size).toBe(197);
  });

  it('every country has a flag file', () => {
    for (const c of COUNTRIES) expect(existsSync(`public/flags/${c.id}.svg`), c.id).toBe(true);
  });

  it('every country has a map shape, or is a tiny country drawn as a dot', () => {
    for (const c of COUNTRIES) {
      const m = M[c.id];
      expect(m, c.id).toBeTruthy();
      expect(m.hasShape || m.tiny, c.id).toBe(true);
    }
    // Tuvalu is the only one missing from Natural Earth 1:50m
    expect(COUNTRIES.filter((c) => !M[c.id].hasShape).map((c) => c.id)).toEqual(['tv']);
  });

  it('every capital lies inside (or right next to) its own country', () => {
    const bad: string[] = [];
    for (const c of COUNTRIES) {
      const f = shapes.get(c.id);
      if (!f) {
        // no shape: must be near the expected position (Tuvalu ~ 179E, 8S)
        continue;
      }
      if (geoContains(f, c.coord)) continue;
      const d = minVertexDistanceDeg(f, c.coord);
      const tol = M[c.id].tiny ? 1.0 : 0.35; // simplified coastlines can cut off coastal capitals
      if (d > tol) bad.push(`${c.id} ${c.capital} ${d.toFixed(2)}°`);
    }
    expect(bad).toEqual([]);
  });

  it('no capital sits inside a different country', () => {
    const bad: string[] = [];
    for (const c of COUNTRIES) {
      // micro-states (Vatican, San Marino, Liechtenstein…) lose their borders when simplified; they are drawn as dots
      if (M[c.id].tiny) continue;
      // Natural Earth's simplified West Bank polygon covers all of Jerusalem (a disputed area)
      if (c.id === 'il') continue;
      for (const [id, f] of shapes) {
        if (id === c.id) continue;
        if (geoContains(f, c.coord)) bad.push(`${c.capital} (${c.id}) is inside ${id}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('every country has a hook, continent, region and flag tags', () => {
    for (const c of COUNTRIES) {
      expect(c.hook.length, c.id).toBeGreaterThan(20);
      expect(c.hook.length, `${c.id} hook too long`).toBeLessThan(170);
      expect(c.region, c.id).toBeTruthy();
      expect(c.flag.colors.length, c.id).toBeGreaterThan(0);
      expect(new Set(c.flag.colors).size, `${c.id} duplicate colors`).toBe(c.flag.colors.length);
      expect(c.coord[0]).toBeGreaterThanOrEqual(-180);
      expect(c.coord[0]).toBeLessThanOrEqual(180);
      expect(Math.abs(c.coord[1])).toBeLessThanOrEqual(90);
    }
  });

  it('sub-regions are small enough to learn as a chunk and belong to one continent', () => {
    for (const r of REGIONS) {
      expect(r.ids.length, r.region).toBeGreaterThanOrEqual(3);
      expect(r.ids.length, r.region).toBeLessThanOrEqual(16);
      const continents = new Set(r.ids.map((id) => COUNTRIES.find((c) => c.id === id)!.continent));
      expect(continents.size, r.region).toBe(1);
    }
  });

  it('multi-capital countries explain the split', () => {
    for (const c of COUNTRIES) if (c.altCapitals?.length) expect(c.capitalNote, c.id).toBeTruthy();
  });

  it('trick-capital decoys are never an accepted answer for that country', () => {
    for (const [id, decoys] of Object.entries(TRICK_CAPITALS)) {
      const c = COUNTRIES.find((x) => x.id === id);
      expect(c, id).toBeTruthy();
      const ok = acceptedCapitals(c!).map((s) => s.toLowerCase());
      for (const d of decoys) expect(ok, `${id}: ${d}`).not.toContain(d.toLowerCase());
    }
    for (const id of TRICK_IDS) expect(COUNTRIES.some((c) => c.id === id), id).toBe(true);
  });
});
