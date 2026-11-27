import { getSave } from '../store.ts';

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (!getSave().settings.sound) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.12, slideTo?: number) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  correct() {
    tone(784, 0, 0.12, 'sine', 0.1);
    tone(1175, 0.08, 0.2, 'sine', 0.1);
  },
  typo() {
    tone(660, 0, 0.12, 'triangle', 0.08);
    tone(880, 0.09, 0.16, 'triangle', 0.08);
  },
  wrong() {
    tone(220, 0, 0.28, 'triangle', 0.12, 150);
  },
  tierUp() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.07, 0.22, 'sine', 0.09));
  },
  gold() {
    [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(f, i * 0.06, 0.3, 'sine', 0.08));
    tone(2637, 0.32, 0.4, 'sine', 0.04);
  },
  tap() {
    tone(1200, 0, 0.04, 'sine', 0.04);
  },
  finish() {
    [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.35, 'triangle', 0.08));
  },
};
