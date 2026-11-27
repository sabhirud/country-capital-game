// Prepares the map data and flags used by the app.
//  - Filters world-atlas (Natural Earth 1:50m, public domain) down to the 197 countries,
//    keyed by ISO alpha-2 id, merging a few pieces (Somaliland → Somalia, N. Cyprus → Cyprus,
//    Hong Kong/Macao → China, Åland → Finland). Everything else becomes grey background land.
//  - Simplifies the shapes to keep the download small.
//  - Computes per-country metadata (area, bounding box, "tiny" flag for micro-states).
//  - Copies the 197 needed flag SVGs from flag-icons (MIT) into public/flags.
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as topojsonClient from 'topojson-client';
import * as topojsonServer from 'topojson-server';
import * as topojsonSimplify from 'topojson-simplify';
import { geoArea, geoBounds, geoCentroid } from 'd3-geo';
import { COUNTRIES } from '../src/data/countries.ts';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'src', 'generated');
const flagOut = join(root, 'public', 'flags');
mkdirSync(outDir, { recursive: true });
mkdirSync(flagOut, { recursive: true });

const world = require('world-atlas/countries-50m.json');
const geoms = world.objects.countries.geometries;

const MERGE_INTO = {
  Somaliland: 'Somalia',
  'N. Cyprus': 'Cyprus',
  'Hong Kong': 'China',
  Macao: 'China',
  Åland: 'Finland',
};

const byAtlasName = new Map();
for (const g of geoms) byAtlasName.set(g.properties.name, g);

const countryFeatures = [];
const usedAtlas = new Set();
const missing = [];

for (const c of COUNTRIES) {
  const atlasName = c.atlasName ?? c.name;
  const g = byAtlasName.get(atlasName);
  if (!g) {
    missing.push(c.id);
    continue;
  }
  const parts = [g];
  usedAtlas.add(atlasName);
  for (const [from, to] of Object.entries(MERGE_INTO)) {
    if (to === atlasName && byAtlasName.has(from)) {
      parts.push(byAtlasName.get(from));
      usedAtlas.add(from);
    }
  }
  const geometry = parts.length === 1 ? topojsonClient.feature(world, g).geometry : topojsonClient.merge(world, parts);
  countryFeatures.push({ type: 'Feature', id: c.id, properties: {}, geometry });
}

const otherFeatures = geoms
  .filter((g) => !usedAtlas.has(g.properties.name))
  .map((g) => ({ type: 'Feature', id: g.properties.name, properties: {}, geometry: topojsonClient.feature(world, g).geometry }));

const SIMPLIFY_Q = Number(process.env.GEO_Q ?? 0.25);
const QUANTIZE = Number(process.env.GEO_QUANT ?? 2e4);
let topo = topojsonServer.topology(
  {
    countries: { type: 'FeatureCollection', features: countryFeatures },
    other: { type: 'FeatureCollection', features: otherFeatures },
  },
  1e5,
);
topo = topojsonSimplify.presimplify(topo);
const minWeight = topojsonSimplify.quantile(topo, SIMPLIFY_Q);
topo = topojsonSimplify.simplify(topo, minWeight);
topo = topojsonClient.quantize(topo, QUANTIZE);
// strip empty properties to save bytes
for (const obj of Object.values(topo.objects)) for (const g of obj.geometries) delete g.properties;

writeFileSync(join(outDir, 'world.json'), JSON.stringify(topo));

// ── metadata ─────────────────────────────────────────────────────
const TINY_AREA = 1e-4; // steradians — micro-states and small islands get dot markers
const meta = {};
for (const c of COUNTRIES) {
  const f = countryFeatures.find((x) => x.id === c.id);
  if (!f) {
    meta[c.id] = { hasShape: false, tiny: true, area: 0, bbox: null, centroid: c.coord };
    continue;
  }
  const area = geoArea(f);
  // "core" = the main landmass(es): parts at least 20% the size of the biggest one.
  // Keeps French Guiana, Svalbard, the Dutch Caribbean etc. from stretching a country's bounds.
  const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
  const areas = polys.map((p) => geoArea({ type: 'Polygon', coordinates: p }));
  const maxA = Math.max(...areas);
  const core = { type: 'MultiPolygon', coordinates: polys.filter((_, i) => areas[i] >= maxA * 0.2) };
  const b = geoBounds(core);
  meta[c.id] = {
    hasShape: true,
    tiny: area < TINY_AREA,
    area: Number(area.toExponential(4)),
    bbox: b.map((p) => p.map((v) => Math.round(v * 100) / 100)),
    centroid: geoCentroid(core).map((v) => Math.round(v * 100) / 100),
  };
}
writeFileSync(join(outDir, 'geoMeta.json'), JSON.stringify(meta));

// ── flags ────────────────────────────────────────────────────────
const flagSrc = join(dirname(require.resolve('flag-icons/package.json')), 'flags', '4x3');
let copied = 0;
for (const c of COUNTRIES) {
  const src = join(flagSrc, `${c.id}.svg`);
  if (!existsSync(src)) throw new Error(`Missing flag for ${c.id}`);
  copyFileSync(src, join(flagOut, `${c.id}.svg`));
  copied++;
}

const size = readFileSync(join(outDir, 'world.json')).length;
const tiny = Object.entries(meta).filter(([, m]) => m.tiny).map(([id]) => id);
console.log(
  `geo: ${countryFeatures.length} country shapes, ${otherFeatures.length} background shapes, ` +
    `${(size / 1024).toFixed(0)} KB; missing shapes: ${missing.join(', ') || 'none'}; ` +
    `${tiny.length} tiny: ${tiny.join(' ')}; flags copied: ${copied}`,
);
