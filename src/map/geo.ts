import { useEffect, useState } from 'react';
import { feature, mesh } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry, MultiLineString } from 'geojson';
import metaJson from '../generated/geoMeta.json';

export interface GeoMeta {
  hasShape: boolean;
  tiny: boolean;
  area: number;
  bbox: [[number, number], [number, number]] | null;
  centroid: [number, number];
}

export const GEO_META = metaJson as unknown as Record<string, GeoMeta>;

export interface World {
  countries: Feature<Geometry>[];
  byId: Map<string, Feature<Geometry>>;
  other: Feature<Geometry>[];
  /** land that isn't one of the 197 (Greenland, W. Sahara, …) minus Antarctica */
  otherNoAntarctica: Feature<Geometry>[];
  borders: MultiLineString;
  all: FeatureCollection<Geometry>;
}

let cache: World | null = null;
let pending: Promise<World> | null = null;

export function loadWorld(): Promise<World> {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = import('../generated/world.json').then((mod) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const topo = ((mod as any).default ?? mod) as any;
      const countries = (feature(topo, topo.objects.countries) as unknown as FeatureCollection<Geometry>).features;
      const other = (feature(topo, topo.objects.other) as unknown as FeatureCollection<Geometry>).features;
      const borders = mesh(topo, topo.objects.countries, (a: unknown, b: unknown) => a !== b) as MultiLineString;
      cache = {
        countries,
        byId: new Map(countries.map((f) => [String(f.id), f])),
        other,
        otherNoAntarctica: other.filter((f) => f.id !== 'Antarctica'),
        borders,
        all: { type: 'FeatureCollection', features: [...countries, ...other] },
      };
      return cache;
    });
  }
  return pending;
}

export function useWorld(): World | null {
  const [w, setW] = useState<World | null>(cache);
  useEffect(() => {
    if (!w) loadWorld().then(setW);
  }, [w]);
  return w;
}
