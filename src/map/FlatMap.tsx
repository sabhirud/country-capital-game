import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { geoEqualEarth, geoPath, type GeoProjection } from 'd3-geo';
import { select } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { interpolateZoom } from 'd3-interpolate';
import type { Feature, Geometry } from 'geojson';
import { GEO_META, useWorld, type World } from './geo.ts';
import { BY_ID } from '../data/countries.ts';

export interface MapMark {
  id: string;
  state: 'ok' | 'bad' | 'target';
}

export interface CapitalDot {
  id: string;
  label?: string;
  state?: 'ok' | 'bad' | 'new';
}

interface Props {
  classOf?: (id: string) => string | undefined;
  marks?: MapMark[];
  onPick?: (id: string) => void;
  fitIds?: string[] | null;
  capitals?: CapitalDot[];
  tooltip?: (id: string) => string | null;
  interactive?: boolean;
  showTinyDots?: boolean;
  className?: string;
  ariaLabel?: string;
  /** width / height of the map frame; taller frames give zoomed regions more room */
  aspect?: number;
}

const W = 1000;

/** Pick a central meridian so a set of countries spanning the antimeridian (Pacific) isn't split. */
function centerLonFor(ids: string[] | null | undefined): number {
  if (!ids || ids.length === 0) return 0;
  const lons = ids.map((id) => (GEO_META[id]?.centroid ?? BY_ID[id]?.coord ?? [0, 0])[0]).sort((a, b) => a - b);
  // largest gap between consecutive longitudes (circularly)
  let gapStart = lons[lons.length - 1];
  let gap = lons[0] + 360 - lons[lons.length - 1];
  for (let i = 1; i < lons.length; i++) {
    const g = lons[i] - lons[i - 1];
    if (g > gap) {
      gap = g;
      gapStart = lons[i - 1];
    }
  }
  const spanCrossesAntimeridian = gapStart !== lons[lons.length - 1];
  if (!spanCrossesAntimeridian) return 0;
  // midpoint of the occupied arc = opposite the middle of the gap
  const gapMid = gapStart + gap / 2;
  let c = gapMid + 180;
  if (c > 180) c -= 360;
  return Math.round(c);
}

function useProjection(world: World | null, centerLon: number, aspect?: number) {
  return useMemo(() => {
    if (!world) return null;
    const proj: GeoProjection = geoEqualEarth().rotate([-centerLon, 0]);
    const land = { type: 'FeatureCollection' as const, features: [...world.countries, ...world.otherNoAntarctica] };
    proj.fitWidth(W - 16, land);
    const path = geoPath(proj);
    const b = path.bounds(land);
    const natural = Math.ceil(b[1][1] - b[0][1] + 16);
    // a taller frame (e.g. in quizzes) just adds ocean above and below the world
    const H = Math.max(natural, aspect ? Math.round(W / aspect) : 0);
    proj.translate([proj.translate()[0] + 8, proj.translate()[1] - b[0][1] + 8 + (H - natural) / 2]);
    return { proj, path: geoPath(proj), H };
  }, [world, centerLon, aspect]);
}

/** When fitting a group of countries, use only European Russia so "Europe" doesn't include Siberia. */
const GROUP_FIT_OVERRIDE: Record<string, [[number, number], [number, number]]> = {
  ru: [
    [27, 42],
    [60, 68],
  ],
};

/** Projected bounds of a lon/lat box (sampled, since meridians curve in Equal Earth). */
function projectedBox(proj: GeoProjection, box: [[number, number], [number, number]]) {
  const [[w, s], [e0, n]] = box;
  const e = e0 < w ? e0 + 360 : e0; // crosses the antimeridian
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i <= 6; i++)
    for (let j = 0; j <= 6; j++) {
      let lon = w + ((e - w) * i) / 6;
      if (lon > 180) lon -= 360;
      const p = proj([lon, s + ((n - s) * j) / 6]);
      if (!p) continue;
      x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]);
      x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
    }
  return [[x0, y0], [x1, y1]] as [[number, number], [number, number]];
}

const CountryLayer = memo(function CountryLayer({
  world,
  path,
  classOf,
  onPick,
  setHover,
}: {
  world: World;
  path: ReturnType<typeof geoPath>;
  classOf?: (id: string) => string | undefined;
  onPick?: (id: string) => void;
  setHover: (id: string | null) => void;
}) {
  return (
    <g className="countries">
      {world.otherNoAntarctica.map((f) => (
        <path key={`o-${f.id}`} className="land-other" d={path(f) ?? undefined} />
      ))}
      {world.countries.map((f) => {
        const id = String(f.id);
        return (
          <path
            key={id}
            data-id={id}
            className={`country ${classOf?.(id) ?? ''} ${onPick ? 'pickable' : ''}`}
            d={path(f) ?? undefined}
            onClick={onPick ? () => onPick(id) : undefined}
            onPointerEnter={() => setHover(id)}
            onPointerLeave={() => setHover(null)}
          />
        );
      })}
      <path className="borders" d={path(world.borders) ?? undefined} />
    </g>
  );
});

export function FlatMap({
  classOf,
  marks,
  onPick,
  fitIds,
  capitals,
  tooltip,
  interactive = true,
  showTinyDots = true,
  className = '',
  ariaLabel = 'World map',
  aspect,
}: Props) {
  const world = useWorld();
  const centerLon = useMemo(() => centerLonFor(fitIds), [fitIds]);
  const pj = useProjection(world, centerLon, aspect);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [t, setT] = useState<ZoomTransform>(zoomIdentity);
  const tRef = useRef<ZoomTransform>(zoomIdentity);
  const [hover, setHover] = useState<string | null>(null);
  const [mouse, setMouse] = useState<[number, number] | null>(null);
  const animRef = useRef<number>(0);

  // zoom & pan
  useEffect(() => {
    if (!svgRef.current || !pj) return;
    const svg = select(svgRef.current);
    const z = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 60])
      .translateExtent([
        [0, 0],
        [W, pj.H],
      ])
      .extent([
        [0, 0],
        [W, pj.H],
      ])
      .filter((ev: Event & { button?: number; type: string }) => {
        if (!interactive) return false;
        if (ev.type === 'wheel') return true;
        return !ev.button;
      })
      .on('zoom', (ev) => {
        tRef.current = ev.transform;
        setT(ev.transform);
      });
    zoomRef.current = z;
    svg.call(z);
    svg.on('dblclick.zoom', null);
    return () => {
      svg.on('.zoom', null);
    };
  }, [pj, interactive]);

  // fit to a set of countries (animated)
  const fitKey = fitIds ? fitIds.join(',') : '';
  useEffect(() => {
    if (!pj || !world || !svgRef.current || !zoomRef.current) return;
    let target = zoomIdentity;
    if (fitIds && fitIds.length && fitIds.length < 190) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const id of fitIds) {
        const m = GEO_META[id];
        let b: [[number, number], [number, number]] | null = null;
        const box = (fitIds.length > 1 && GROUP_FIT_OVERRIDE[id]) || m?.bbox;
        if (m && !m.tiny && box) b = projectedBox(pj.proj, box);
        else {
          const p = pj.proj(BY_ID[id].coord);
          if (p) b = [[p[0] - 4, p[1] - 4], [p[0] + 4, p[1] + 4]];
        }
        if (!b || !Number.isFinite(b[0][0])) continue;
        x0 = Math.min(x0, b[0][0]); y0 = Math.min(y0, b[0][1]);
        x1 = Math.max(x1, b[1][0]); y1 = Math.max(y1, b[1][1]);
      }
      if (Number.isFinite(x0)) {
        const pad = 0.12;
        const dx = (x1 - x0) * (1 + pad * 2) || 20;
        const dy = (y1 - y0) * (1 + pad * 2) || 20;
        const k = Math.max(1, Math.min(30, Math.min(W / dx, pj.H / dy)));
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        target = zoomIdentity.translate(W / 2 - k * cx, pj.H / 2 - k * cy).scale(k);
      }
    }
    const svg = select(svgRef.current);
    const from = tRef.current;
    const a: [number, number, number] = [(W / 2 - from.x) / from.k, (pj.H / 2 - from.y) / from.k, W / from.k];
    const b: [number, number, number] = [(W / 2 - target.x) / target.k, (pj.H / 2 - target.y) / target.k, W / target.k];
    const interp = interpolateZoom(a, b);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const dur = reduce ? 0 : Math.min(1400, Math.max(500, interp.duration * 0.6));
    const start = performance.now();
    cancelAnimationFrame(animRef.current);
    const step = (now: number) => {
      const p = dur === 0 ? 1 : Math.min(1, (now - start) / dur);
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      const [vx, vy, vw] = interp(e);
      const k = W / vw;
      const tr = zoomIdentity.translate(W / 2 - vx * k, pj.H / 2 - vy * k).scale(k);
      svg.call(zoomRef.current!.transform, tr);
      if (p < 1) animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, pj, world]);

  if (!world || !pj) {
    return <div className={`flatmap loading ${className}`} aria-label="Loading map" />;
  }

  const k = t.k;
  const screen = (lonlat: [number, number]): [number, number] | null => {
    const p = pj.proj(lonlat);
    if (!p) return null;
    return [t.applyX(p[0]), t.applyY(p[1])];
  };

  const markOf = new Map((marks ?? []).map((m) => [m.id, m.state]));
  const tinyIds = showTinyDots ? Object.keys(GEO_META).filter((id) => GEO_META[id].tiny) : [];
  const tip = hover && tooltip ? tooltip(hover) : null;

  return (
    <div
      className={`flatmap ${className}`}
      onPointerMove={(e) => {
        if (!tooltip) return;
        const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        setMouse([e.clientX - r.left, e.clientY - r.top]);
      }}
    >
      <svg ref={svgRef} viewBox={`0 0 ${W} ${pj.H}`} role="img" aria-label={ariaLabel} preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="cc-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--gold-hi)" />
            <stop offset="0.45" stopColor="var(--gold)" />
            <stop offset="1" stopColor="var(--gold-lo)" />
          </linearGradient>
          <linearGradient id="cc-silver" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--silver-hi)" />
            <stop offset="0.5" stopColor="var(--silver)" />
            <stop offset="1" stopColor="var(--silver-lo)" />
          </linearGradient>
          <linearGradient id="cc-bronze" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--bronze-hi)" />
            <stop offset="1" stopColor="var(--bronze)" />
          </linearGradient>
        </defs>
        <rect className="ocean" x={0} y={0} width={W} height={pj.H} />
        <g transform={t.toString()}>
          <CountryLayer world={world} path={pj.path} classOf={classOf} onPick={onPick} setHover={setHover} />
          {[...markOf.entries()].map(([id, state]) => {
            const f = world.byId.get(id);
            if (!f || GEO_META[id]?.tiny) return null;
            return <path key={`m-${id}`} className={`mark mark-${state}`} d={pj.path(f as Feature<Geometry>) ?? undefined} />;
          })}
        </g>
        {/* screen-space overlays: constant size regardless of zoom */}
        <g className="overlay">
          {tinyIds.map((id) => {
            const p = screen(BY_ID[id].coord);
            if (!p) return null;
            const cls = classOf?.(id) ?? '';
            const m = markOf.get(id);
            return (
              <g key={`t-${id}`} transform={`translate(${p[0]},${p[1]})`} className={`tiny ${cls} ${m ? `mark-${m}` : ''}`}>
                {m && <circle className="tiny-ring" r={11} />}
                <circle className="tiny-dot" r={Math.min(6, 3 + k * 0.15)} />
                <circle
                  className="tiny-hit"
                  r={12}
                  data-id={id}
                  onClick={onPick ? () => onPick(id) : undefined}
                  onPointerEnter={() => setHover(id)}
                  onPointerLeave={() => setHover(null)}
                />
              </g>
            );
          })}
          {(capitals ?? []).map((c) => {
            const co = BY_ID[c.id];
            if (!co) return null;
            const p = screen(co.coord);
            if (!p) return null;
            return (
              <g key={`c-${c.id}`} transform={`translate(${p[0]},${p[1]})`} className={`capital ${c.state ? `capital-${c.state}` : ''}`}>
                <circle className="capital-pulse" r={9} />
                <circle className="capital-dot" r={3.6} />
                {c.label && (
                  <text className="capital-label" x={6} y={-6}>
                    {c.label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      {tip && mouse && (
        <div className="map-tip" style={{ left: mouse[0] + 14, top: mouse[1] + 10 }}>
          {tip}
        </div>
      )}
      {interactive && k > 1.05 && (
        <button
          className="map-reset"
          aria-label="Reset zoom"
          onClick={() => svgRef.current && zoomRef.current && select(svgRef.current).call(zoomRef.current.transform, zoomIdentity)}
        >
          ⤢
        </button>
      )}
    </div>
  );
}
