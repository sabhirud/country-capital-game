import type { Country } from '../data/types.ts';
import { getSave } from '../store.ts';

let voice: SpeechSynthesisVoice | null = null;

function pickVoice(): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null;
  if (voice) return voice;
  const vs = window.speechSynthesis.getVoices();
  voice =
    vs.find((v) => /en[-_](GB|US)/i.test(v.lang) && /natural|premium|enhanced|google/i.test(v.name)) ??
    vs.find((v) => /en[-_](GB|US)/i.test(v.lang)) ??
    vs.find((v) => v.lang?.startsWith('en')) ??
    null;
  return voice;
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    voice = null;
    pickVoice();
  };
}

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function speak(text: string, force = false) {
  if (!canSpeak()) return;
  const s = getSave().settings;
  if (!s.voice && !force) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = v?.lang ?? 'en-GB';
    u.rate = s.voiceRate;
    window.speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}

/**
 * Say a capital. English voices butcher names like "Ouagadougou", so when we have a
 * phonetic respelling we speak that instead (syllables as separate words).
 */
export function sayCapital(c: Country, force = false) {
  const text = c.say ? c.say.replace(/-/g, ' ').toLowerCase() : c.capital;
  speak(text, force);
}
