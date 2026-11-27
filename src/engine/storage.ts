import type { CardState } from './srs.ts';

export type ThemePref = 'auto' | 'light' | 'dark';

export interface Settings {
  theme: ThemePref;
  sound: boolean;
  voice: boolean;
  voiceRate: number;
  retypeOnWrong: boolean;
  newPerSession: number;
  sessionSize: number;
}

export interface DayStat {
  date: string; // YYYY-MM-DD (local)
  answered: number;
  correct: number;
}

export interface SaveData {
  version: 1;
  createdAt: number;
  cards: Record<string, CardState>;
  settings: Settings;
  focus: string;
  days: DayStat[];
  /** tiers already celebrated, so the "conquered!" moments only fire once */
  celebrated: Record<string, string>;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'auto',
  sound: true,
  voice: true,
  voiceRate: 0.9,
  retypeOnWrong: true,
  newPerSession: 5,
  sessionSize: 15,
};

export const STORAGE_KEY = 'capital-conquest:v1';

export function emptySave(now = Date.now()): SaveData {
  return { version: 1, createdAt: now, cards: {}, settings: { ...DEFAULT_SETTINGS }, focus: 'world', days: [], celebrated: {} };
}

/** Validate/repair anything loaded from storage or an imported backup. */
export function sanitize(raw: unknown): SaveData {
  const base = emptySave();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<SaveData>;
  if (r.version !== 1) return base;
  const cards: Record<string, CardState> = {};
  if (r.cards && typeof r.cards === 'object') {
    for (const [id, c] of Object.entries(r.cards)) {
      if (!c || typeof c !== 'object') continue;
      const stage = Number((c as CardState).stage);
      if (!Number.isFinite(stage)) continue;
      cards[id] = {
        stage: Math.max(0, Math.min(6, Math.round(stage))),
        due: Number((c as CardState).due) || 0,
        lastSeen: Number((c as CardState).lastSeen) || 0,
        seen: Number((c as CardState).seen) || 0,
        correct: Number((c as CardState).correct) || 0,
        wrong: Number((c as CardState).wrong) || 0,
        ...((c as CardState).confusedWith ? { confusedWith: (c as CardState).confusedWith } : {}),
      };
    }
  }
  return {
    version: 1,
    createdAt: Number(r.createdAt) || base.createdAt,
    cards,
    settings: { ...DEFAULT_SETTINGS, ...(r.settings ?? {}) },
    focus: typeof r.focus === 'string' ? r.focus : 'world',
    days: Array.isArray(r.days) ? r.days.slice(-400) : [],
    celebrated: r.celebrated && typeof r.celebrated === 'object' ? r.celebrated : {},
  };
}

export function loadSave(): SaveData {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) return sanitize(JSON.parse(s));
  } catch {
    /* storage blocked or corrupt — start fresh */
  }
  return emptySave();
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* private mode / quota — progress just won't persist */
  }
}

/** Ask the browser not to evict our data (helps on iPhone Safari). */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* ignore */
  }
  return false;
}

export function todayKey(now = Date.now()): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function recordDay(days: DayStat[], correct: boolean, now = Date.now()): DayStat[] {
  const key = todayKey(now);
  const out = days.slice();
  const last = out[out.length - 1];
  if (last && last.date === key) out[out.length - 1] = { ...last, answered: last.answered + 1, correct: last.correct + (correct ? 1 : 0) };
  else out.push({ date: key, answered: 1, correct: correct ? 1 : 0 });
  return out.slice(-400);
}
