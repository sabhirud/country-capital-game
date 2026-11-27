import { useEffect, useRef } from 'react';
import { geoContains, geoDistance, geoGraticule10, geoInterpolate, geoOrthographic, geoPath } from 'd3-geo';
import type { Feature, Geometry } from 'geojson';
import { GEO_META, useWorld, type World } from './geo.ts';
import { BY_ID } from '../data/countries.ts';

interface Props {
  /** country to fly to and highlight */
  focusId?: string | null;
  /** fly to this country but don't highlight it (used while asking, so the globe doesn't give the answer away) */
  hideHighlight?: boolean;
  showCapital?: boolean;
  /** fill color per country (e.g. conquest tier); null → default land color */
  colorOf?: (id: string) => string | null;
  autoRotate?: boolean;
  interactive?: boolean;
  onPick?: (id: string) => void;
  className?: string;
}

interface Palette {
  ocean: string;
  ocean2: string;
  land: string;
  landOther: string;
  border: string;
  grat: string;
  accent: string;
  glow: string;
  capital: string;
}

function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
  return {
    ocean: v('--globe-ocean', '#0d2547'),
    ocean2: v('--globe-ocean-2', '#173a6b'),
    land: v('--globe-land', '#3b4a6b'),
    landOther: v('--globe-land-other', '#2c3753'),
    border: v('--globe-border', 'rgba(10,16,32,0.7)'),
    grat: v('--globe-grat', 'rgba(255,255,255,0.06)'),
    accent: v('--accent', '#5eead4'),
    glow: v('--globe-glow', 'rgba(94,234,212,0.35)'),
    capital: v('--capital', '#ff5d73'),
  };
}

function targetFor(id: string): { center: [number, number]; zoom: number } {
  const m = GEO_META[id];
  const c = BY_ID[id];
  // tiny island nations: center on the capital (Kiribati's biggest atoll is 3,000 km from Tarawa)
  const center = (m?.tiny || !m?.centroid ? c.coord : m.centroid) as [number, number];
  let size = 2;
  if (m?.bbox) {
    let dLon = m.bbox[1][0] - m.bbox[0][0];
    if (dLon < 0) dLon += 360; // crosses antimeridian
    const dLat = m.bbox[1][1] - m.bbox[0][1];
    size = Math.max(dLon * Math.cos((center[1] * Math.PI) / 180), dLat);
  }
  // big countries (Russia) or wrap-around shapes: just show the hemisphere
  if (size > 120) size = 60;
  const zoom = Math.max(1, Math.min(4.2, 48 / Math.max(size, 6)));
  return { center, zoom };
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function Globe({
  focusId,
  hideHighlight = false,
  showCapital = true,
  colorOf,
  autoRotate = false,
  interactive = true,
  onPick,
  className = '',
}: Props) {
  const world = useWorld();
  const wrapRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overRef = useRef<HTMLCanvasElement>(null);

  // mutable view state lives in a ref so animation doesn't re-render React
  const st = useRef({
    rot: [-10, -20, 0] as [number, number, number],
    zoom: 1,
    w: 300,
    h: 300,
    dpr: 1,
    dirty: true,
    flying: null as null | { from: [number, number]; to: [number, number]; z0: number; z1: number; t0: number; dur: number; far: boolean },
    dragging: false,
    lastInteraction: 0,
    palette: null as Palette | null,
    raf: 0,
    pointers: new Map<number, [number, number]>(),
    pinchDist: 0,
    moved: 0,
  });
  const props = useRef({ focusId, hideHighlight, showCapital, colorOf, autoRotate, onPick, interactive, world });
  props.current = { focusId, hideHighlight, showCapital, colorOf, autoRotate, onPick, interactive, world };

  // re-read palette on theme changes
  useEffect(() => {
    const update = () => {
      st.current.palette = readPalette();
      st.current.dirty = true;
    };
    update();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener?.('change', update);
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      mq.removeEventListener?.('change', update);
      mo.disconnect();
    };
  }, []);

  // colors changed → redraw
  useEffect(() => {
    st.current.dirty = true;
  }, [colorOf, focusId, hideHighlight, world]);

  // fly to focus
  useEffect(() => {
    if (!focusId || !BY_ID[focusId]) return;
    const s = st.current;
    const { center, zoom } = targetFor(focusId);
    const from: [number, number] = [-s.rot[0], -s.rot[1]];
    const dist = (geoDistance(from, center) * 180) / Math.PI;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    s.flying = {
      from,
      to: center,
      z0: s.zoom,
      z1: zoom,
      t0: performance.now(),
      dur: reduce ? 1 : Math.min(1600, 600 + dist * 8),
      far: dist > 35,
    };
  }, [focusId]);

  // main loop
  useEffect(() => {
    const base = baseRef.current!;
    const over = overRef.current!;
    const wrap = wrapRef.current!;
    const s = st.current;

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      s.w = Math.max(50, r.width);
      s.h = Math.max(50, r.height);
      s.dpr = Math.min(2, window.devicePixelRatio || 1);
      for (const c of [base, over]) {
        c.width = Math.round(s.w * s.dpr);
        c.height = Math.round(s.h * s.dpr);
        c.style.width = `${s.w}px`;
        c.style.height = `${s.h}px`;
      }
      s.dirty = true;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const projection = geoOrthographic().clipAngle(90).precision(0.6);
    const grat = geoGraticule10();

    const setupProjection = () => {
      const R = Math.min(s.w, s.h) / 2 - 6;
      projection.scale(R * s.zoom).translate([s.w / 2, s.h / 2]).rotate(s.rot);
      return R;
    };

    const drawBase = (w: World | null) => {
      const ctx = base.getContext('2d')!;
      const pal = s.palette ?? readPalette();
      ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
      ctx.clearRect(0, 0, s.w, s.h);
      const R = setupProjection();
      const path = geoPath(projection, ctx);
      const cx = s.w / 2;
      const cy = s.h / 2;
      const r = R * s.zoom;

      // atmosphere glow
      if (s.zoom < 1.6) {
        const g = ctx.createRadialGradient(cx, cy, r * 0.95, cx, cy, r * 1.12);
        g.addColorStop(0, pal.glow);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.12, 0, Math.PI * 2);
        ctx.fill();
      }
      // ocean
      const og = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
      og.addColorStop(0, pal.ocean2);
      og.addColorStop(1, pal.ocean);
      ctx.beginPath();
      path({ type: 'Sphere' });
      ctx.fillStyle = og;
      ctx.fill();
      // graticule
      ctx.beginPath();
      path(grat);
      ctx.strokeStyle = pal.grat;
      ctx.lineWidth = 0.6;
      ctx.stroke();

      if (!w) return;
      const p = props.current;
      // other land
      ctx.beginPath();
      for (const f of w.other) path(f);
      ctx.fillStyle = pal.landOther;
      ctx.fill();
      // countries, batched by color
      const groups = new Map<string, Feature<Geometry>[]>();
      for (const f of w.countries) {
        const id = String(f.id);
        const col = (p.colorOf?.(id) ?? null) || pal.land;
        if (!groups.has(col)) groups.set(col, []);
        groups.get(col)!.push(f);
      }
      for (const [col, fs] of groups) {
        ctx.beginPath();
        for (const f of fs) path(f);
        ctx.fillStyle = col;
        ctx.fill();
      }
      // highlight
      if (p.focusId && !p.hideHighlight) {
        const f = w.byId.get(p.focusId);
        if (f) {
          ctx.save();
          ctx.beginPath();
          path(f);
          ctx.fillStyle = pal.accent;
          ctx.shadowColor = pal.accent;
          ctx.shadowBlur = 18;
          ctx.fill();
          ctx.restore();
        }
      }
      // borders
      ctx.beginPath();
      path(w.borders);
      ctx.strokeStyle = pal.border;
      ctx.lineWidth = 0.7;
      ctx.stroke();
      // rim
      ctx.beginPath();
      path({ type: 'Sphere' });
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();
    };

    const visible = (lonlat: [number, number]) => geoDistance(lonlat, [-s.rot[0], -s.rot[1]]) < Math.PI / 2 - 0.02;

    const drawOverlay = (now: number) => {
      const ctx = over.getContext('2d')!;
      const pal = s.palette ?? readPalette();
      ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
      ctx.clearRect(0, 0, s.w, s.h);
      const p = props.current;
      if (!p.focusId || p.hideHighlight) return;
      const c = BY_ID[p.focusId];
      if (!c) return;
      setupProjection();
      // tiny countries: ring so you can find them
      if (GEO_META[p.focusId]?.tiny && visible(c.coord)) {
        const q = projection(c.coord);
        if (q) {
          ctx.beginPath();
          ctx.arc(q[0], q[1], 14, 0, Math.PI * 2);
          ctx.strokeStyle = pal.accent;
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
      }
      if (!p.showCapital || !visible(c.coord)) return;
      const q = projection(c.coord);
      if (!q) return;
      const phase = (now % 1600) / 1600;
      ctx.beginPath();
      ctx.arc(q[0], q[1], 4 + phase * 16, 0, Math.PI * 2);
      ctx.strokeStyle = pal.capital;
      ctx.globalAlpha = 1 - phase;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(q[0], q[1], 4.5, 0, Math.PI * 2);
      ctx.fillStyle = pal.capital;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };

    const tick = (now: number) => {
      const p = props.current;
      if (s.flying) {
        const f = s.flying;
        const t = Math.min(1, (now - f.t0) / f.dur);
        const e = ease(t);
        const c = geoInterpolate(f.from, f.to)(e);
        s.rot = [-c[0], -c[1], 0];
        const zBase = f.z0 + (f.z1 - f.z0) * e;
        s.zoom = f.far ? Math.max(0.9, zBase * (1 - 0.45 * Math.sin(Math.PI * t))) : zBase;
        s.dirty = true;
        if (t >= 1) s.flying = null;
      } else if (p.autoRotate && !s.dragging && now - s.lastInteraction > 2500) {
        s.rot = [s.rot[0] + 0.08, s.rot[1] + (-15 - s.rot[1]) * 0.01, 0];
        s.dirty = true;
      }
      if (s.dirty) {
        drawBase(p.world);
        s.dirty = false;
      }
      drawOverlay(now);
      s.raf = requestAnimationFrame(tick);
    };
    s.raf = requestAnimationFrame(tick);

    // ── interaction ──
    const pickAt = (x: number, y: number) => {
      const p = props.current;
      if (!p.onPick || !p.world) return;
      setupProjection();
      // tiny countries first (within 14px)
      let best: { id: string; d: number } | null = null;
      for (const [id, m] of Object.entries(GEO_META)) {
        if (!m.tiny) continue;
        const ll = BY_ID[id].coord;
        if (!visible(ll)) continue;
        const q = projection(ll);
        if (!q) continue;
        const d = Math.hypot(q[0] - x, q[1] - y);
        if (d < 14 && (!best || d < best.d)) best = { id, d };
      }
      if (best) return p.onPick(best.id);
      const ll = projection.invert?.([x, y]);
      if (!ll || !visible(ll as [number, number])) return;
      const hit = p.world.countries.find((f) => geoContains(f, ll as [number, number]));
      if (hit) p.onPick(String(hit.id));
    };

    const onDown = (e: PointerEvent) => {
      if (!props.current.interactive) return;
      over.setPointerCapture(e.pointerId);
      s.pointers.set(e.pointerId, [e.clientX, e.clientY]);
      s.dragging = true;
      s.moved = 0;
      s.flying = null;
      s.lastInteraction = performance.now();
      if (s.pointers.size === 2) {
        const [a, b] = [...s.pointers.values()];
        s.pinchDist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!s.pointers.has(e.pointerId)) return;
      const prev = s.pointers.get(e.pointerId)!;
      const cur: [number, number] = [e.clientX, e.clientY];
      s.pointers.set(e.pointerId, cur);
      if (s.pointers.size === 2) {
        const [a, b] = [...s.pointers.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (s.pinchDist > 0) s.zoom = Math.max(0.8, Math.min(8, s.zoom * (d / s.pinchDist)));
        s.pinchDist = d;
        s.moved += 10;
      } else {
        const dx = cur[0] - prev[0];
        const dy = cur[1] - prev[1];
        s.moved += Math.abs(dx) + Math.abs(dy);
        const k = 0.35 / s.zoom;
        s.rot = [s.rot[0] + dx * k, Math.max(-85, Math.min(85, s.rot[1] - dy * k)), 0];
      }
      s.dirty = true;
      s.lastInteraction = performance.now();
    };
    const onUp = (e: PointerEvent) => {
      if (!s.pointers.has(e.pointerId)) return;
      s.pointers.delete(e.pointerId);
      if (s.pointers.size < 2) s.pinchDist = 0;
      if (s.pointers.size === 0) {
        s.dragging = false;
        if (s.moved < 6) {
          const r = over.getBoundingClientRect();
          pickAt(e.clientX - r.left, e.clientY - r.top);
        }
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (!props.current.interactive) return;
      e.preventDefault();
      s.flying = null;
      s.zoom = Math.max(0.8, Math.min(8, s.zoom * Math.exp(-e.deltaY * 0.0015)));
      s.dirty = true;
      s.lastInteraction = performance.now();
    };
    over.addEventListener('pointerdown', onDown);
    over.addEventListener('pointermove', onMove);
    over.addEventListener('pointerup', onUp);
    over.addEventListener('pointercancel', onUp);
    over.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(s.raf);
      ro.disconnect();
      over.removeEventListener('pointerdown', onDown);
      over.removeEventListener('pointermove', onMove);
      over.removeEventListener('pointerup', onUp);
      over.removeEventListener('pointercancel', onUp);
      over.removeEventListener('wheel', onWheel);
    };
  }, []);

  return (
    <div ref={wrapRef} className={`globe ${interactive ? 'interactive' : ''} ${className}`}>
      <canvas ref={baseRef} aria-hidden="true" />
      <canvas ref={overRef} role="img" aria-label="Globe" />
    </div>
  );
}
