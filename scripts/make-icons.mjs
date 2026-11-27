// One-off: renders public/icon.svg into the PNG icons the PWA manifest and iOS need.
// Run with:  node scripts/make-icons.mjs   (uses the Playwright that's installed on the machine)
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(require.resolve('playwright', { paths: ['/usr/lib/node_modules', '/usr/local/lib/node_modules'] })); }
const svg = readFileSync('public/icon.svg', 'utf8');
// maskable: full-bleed background, artwork scaled into the 80% safe zone
const maskable = svg
  .replace('<rect width="512" height="512" rx="112" fill="url(#bg)"/>', '<rect width="512" height="512" fill="url(#bg)"/><g transform="translate(51.2 51.2) scale(0.8)">')
  .replace('</svg>', '</g></svg>');
const browser = await pw.chromium.launch();
const page = await browser.newPage();
for (const [name, size, src, bg] of [
  ['icon-192.png', 192, svg, 'transparent'],
  ['icon-512.png', 512, svg, 'transparent'],
  ['icon-maskable-512.png', 512, maskable, '#070b18'],
  ['apple-touch-icon.png', 180, maskable, '#070b18'],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:${bg}">${src.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  writeFileSync(`public/${name}`, await page.screenshot({ omitBackground: bg === 'transparent', clip: { x: 0, y: 0, width: size, height: size } }));
  console.log('wrote', name);
}
await browser.close();
