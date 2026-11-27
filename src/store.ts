import { useSyncExternalStore } from 'react';
import { applyAnswer, tierOf, type AnswerInput, type CardState, type Tier } from './engine/srs.ts';
import { loadSave, recordDay, sanitize, writeSave, emptySave, type SaveData, type Settings } from './engine/storage.ts';

let state: SaveData = typeof localStorage !== 'undefined' ? loadSave() : emptySave();
const listeners = new Set<() => void>();

function emit() {
  writeSave(state);
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getSave(): SaveData {
  return state;
}

export function useSave(): SaveData {
  return useSyncExternalStore(subscribe, getSave, getSave);
}

export interface AnswerOutcome {
  before?: CardState;
  after: CardState;
  tierBefore: Tier;
  tierAfter: Tier;
}

export function recordAnswer(id: string, input: AnswerInput): AnswerOutcome {
  const now = Date.now();
  const before = state.cards[id];
  const after = applyAnswer(before, input, now);
  state = { ...state, cards: { ...state.cards, [id]: after }, days: recordDay(state.days, input.correct, now) };
  emit();
  return { before, after, tierBefore: tierOf(before), tierAfter: tierOf(after) };
}

export function updateSettings(patch: Partial<Settings>) {
  state = { ...state, settings: { ...state.settings, ...patch } };
  emit();
}

export function setFocus(key: string) {
  state = { ...state, focus: key };
  emit();
}

export function markCelebrated(key: string, tier: string) {
  state = { ...state, celebrated: { ...state.celebrated, [key]: tier } };
  emit();
}

export function importSave(raw: unknown): boolean {
  const s = sanitize(raw);
  if (!raw || Object.keys(s.cards).length === 0) return false;
  state = s;
  emit();
  return true;
}

export function resetProgress() {
  state = { ...emptySave(), settings: state.settings };
  emit();
}
