import confetti from 'canvas-confetti';

const GOLD = ['#f8c73e', '#ffe08a', '#e6b422', '#fff4c2'];
const MIX = ['#2dd4bf', '#818cf8', '#f8c73e', '#ff5d73', '#34d399'];

export function burst(kind: 'small' | 'big' | 'gold' = 'small') {
  const base = { disableForReducedMotion: true, zIndex: 9999 } as const;
  if (kind === 'small') {
    void confetti({ ...base, particleCount: 50, spread: 60, startVelocity: 35, origin: { y: 0.7 }, colors: MIX, scalar: 0.8 });
  } else if (kind === 'gold') {
    void confetti({ ...base, particleCount: 80, spread: 80, startVelocity: 40, origin: { y: 0.6 }, colors: GOLD, shapes: ['star'], scalar: 1.1 });
  } else {
    const end = Date.now() + 1200;
    const frame = () => {
      void confetti({ ...base, particleCount: 6, angle: 60, spread: 55, origin: { x: 0, y: 0.7 }, colors: MIX });
      void confetti({ ...base, particleCount: 6, angle: 120, spread: 55, origin: { x: 1, y: 0.7 }, colors: MIX });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  }
}
