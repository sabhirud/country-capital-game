/* End-to-end smoke test: plays real sessions in a browser at phone and laptop sizes.
 *
 *   npm run build && npx vite preview --port 4173 &   (then)   npm run e2e
 *
 * Uses the Playwright that is installed on the machine (require('playwright')).
 * Screenshots go to e2e/screenshots/.
 */
const { chromium, devices } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.E2E_URL || 'http://localhost:4173/country-capital-game/';
const OUT = path.join(__dirname, 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

let failures = 0;
function check(cond, msg) {
  if (cond) console.log('  ✓', msg);
  else {
    failures++;
    console.log('  ✗', msg);
  }
}

(async () => {
  const { COUNTRIES } = await import('../src/data/countries.ts');
  const byName = new Map(COUNTRIES.map((c) => [c.name, c]));
  const byCapital = new Map(COUNTRIES.map((c) => [c.capital, c]));
  const byId = new Map(COUNTRIES.map((c) => [c.id, c]));

  const browser = await chromium.launch();
  const runs = [
    { name: 'phone', ctx: { ...devices['iPhone 13'], colorScheme: 'light' } },
    { name: 'laptop', ctx: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' } },
  ];

  for (const run of runs) {
    console.log(`\n── ${run.name} ──`);
    const context = await browser.newContext(run.ctx);
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    const shot = (n) => page.screenshot({ path: path.join(OUT, `${run.name}-${n}.png`), fullPage: false });

    /** Find the target country of the current question from the DOM. */
    async function target() {
      const flag = page.locator('.q-flag');
      if (await flag.count()) {
        const src = await flag.getAttribute('src');
        return byId.get(src.match(/flags\/([a-z]+)\.svg/)[1]);
      }
      const name = page.locator('.q-country:not(.muted)');
      if (await name.count()) return byName.get((await name.innerText()).trim());
      const cap = page.locator('.q-capital');
      if (await cap.count()) return byCapital.get((await cap.innerText()).trim());
      return null;
    }

    /** Answer whatever is on screen. mode: 'right' | 'wrong' | 'typo' */
    async function step(mode = 'right') {
      if (await page.locator('.study').count()) {
        await page.getByRole('button', { name: /Got it/ }).click();
        return 'study';
      }
      if (await page.locator('.feedback').count()) {
        if (await page.locator('.retype').count()) {
          const want = (await page.locator('.retype label strong').innerText()).trim();
          await page.locator('.retype input').fill(want);
          await page.locator('.retype button[type=submit]').click();
        }
        await page.waitForTimeout(320);
        await page.locator('.next-btn').click();
        return 'next';
      }
      const q = page.locator('.question');
      if (!(await q.count())) return 'done';
      const cls = await q.getAttribute('class');
      const t = await target();
      if (!t) throw new Error('could not identify the question target');
      const wrongCountry = COUNTRIES.find((c) => c.continent === t.continent && c.id !== t.id);
      if (cls.includes('q-map-tap')) {
        const id = mode === 'wrong' ? wrongCountry.id : t.id;
        const el = page.locator(`[data-id="${id}"]`).first();
        await el.dispatchEvent('click');
        return 'map-tap';
      }
      if (await page.locator('.option').count()) {
        const want = mode === 'wrong' ? null : t.capital;
        const opts = page.locator('.option');
        const n = await opts.count();
        for (let i = 0; i < n; i++) {
          const txt = (await opts.nth(i).locator('span').innerText()).trim();
          if ((want && txt === want) || (!want && txt !== t.capital)) {
            await opts.nth(i).click();
            return 'mc';
          }
        }
        throw new Error('option not found');
      }
      if (await page.locator('.flag-option').count()) {
        const opts = page.locator('.flag-option');
        const n = await opts.count();
        for (let i = 0; i < n; i++) {
          const src = await opts.nth(i).locator('img').getAttribute('src');
          const isT = src.includes(`/flags/${t.id}.svg`);
          if ((mode !== 'wrong' && isT) || (mode === 'wrong' && !isT)) {
            await opts.nth(i).click();
            return 'flag-pick';
          }
        }
      }
      if (await page.locator('.type-input').count()) {
        const reverse = cls.includes('q-type-reverse');
        let ans = reverse ? t.name : t.capital;
        if (mode === 'wrong') ans = reverse ? wrongCountry.name : wrongCountry.capital;
        if (mode === 'typo' && ans.length >= 6) ans = ans.slice(0, 2) + ans[3] + ans[2] + ans.slice(4); // swap two letters
        await page.locator('.type-input').fill(ans.toLowerCase());
        await page.locator('.type-input').press('Enter');
        return reverse ? 'type-reverse' : 'type';
      }
      throw new Error('unknown question state');
    }

    async function playSession(opts = {}) {
      const kinds = {};
      let i = 0;
      let shotFeedback = false;
      for (let guard = 0; guard < 120; guard++) {
        let mode = 'right';
        if (opts.wrongAt && opts.wrongAt.includes(i) && !(await page.locator('.feedback, .study').count())) mode = 'wrong';
        if (opts.typoAt && opts.typoAt.includes(i) && (await page.locator('.type-input').count())) mode = 'typo';
        const r = await step(mode);
        if (r === 'done') break;
        if (!['study', 'next'].includes(r)) {
          kinds[r] = (kinds[r] || 0) + 1;
          i++;
          await page.locator('.feedback').waitFor({ timeout: 4000 });
          if (opts.shots && !shotFeedback && (mode === 'wrong' || r === 'type')) {
            await page.waitForTimeout(1300);
            await shot(`feedback-${r}-${mode}`);
            shotFeedback = true;
          }
        } else await page.waitForTimeout(120);
        if (opts.shots && guard === 0) {
          await page.waitForTimeout(1500);
          await shot('session-first');
        }
      }
      return kinds;
    }

    // 1. home
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await shot('01-home');
    check(await page.getByRole('button', { name: /Start learning/ }).isVisible(), 'home shows Start learning');

    // 2. first learn session (focus: Europe)
    await page.getByRole('button', { name: /^Europe/ }).first().click();
    await page.getByRole('button', { name: /Start learning/ }).click();
    await page.locator('.study').waitFor();
    await page.waitForTimeout(1800);
    await shot('02-study-card');
    check((await page.locator('.cc-capital-name').innerText()).length > 1, 'study card shows a capital');
    await page.getByRole('button', { name: /Got it/ }).click();
    await page.waitForTimeout(400);
    await shot('03-mc-question');
    const k1 = await playSession({ wrongAt: [2], shots: true });
    console.log('  session 1 question kinds:', JSON.stringify(k1));
    await page.locator('.summary').waitFor();
    await page.waitForTimeout(800);
    await shot('04-summary');
    check((await page.locator('.sum-list li').count()) === 5, 'summary lists the 5 new countries');

    // 3. back to the map: bronze countries appear
    await page.getByRole('button', { name: /Back to the map/ }).click();
    await page.waitForTimeout(1500);
    const bronze = await page.locator('path.country.tier-bronze').count();
    check(bronze >= 4, `conquer map shows bronze countries (${bronze})`);
    await shot('05-home-after');

    // 4. persistence across reload
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    check((await page.locator('path.country.tier-bronze').count()) === bronze, 'progress survives a reload');

    // 5. simulate a day passing → typed recall questions
    await page.evaluate(() => {
      const k = 'capital-conquest:v1';
      const s = JSON.parse(localStorage.getItem(k));
      for (const c of Object.values(s.cards)) {
        c.due = Date.now() - 1000;
        c.lastSeen -= 86400000;
      }
      localStorage.setItem(k, JSON.stringify(s));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Continue/ }).click();
    await page.waitForTimeout(600);
    const k2 = await playSession({ wrongAt: [1], typoAt: [0, 3], shots: true });
    console.log('  session 2 question kinds:', JSON.stringify(k2));
    check((k2.type || 0) + (k2['type-reverse'] || 0) + (k2['map-tap'] || 0) > 0, 'day-2 session asks recall questions');
    await page.getByRole('button', { name: /Back to the map/ }).click();
    await page.waitForTimeout(1200);
    const silver = await page.locator('path.country.tier-silver, g.tiny.tier-silver').count();
    check(silver >= 1, `some countries reached silver (${silver})`);
    await shot('06-home-silver');

    // 6. practice: Map Pin
    await page.goto(BASE + '#/practice', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await shot('07-practice');
    await page.getByRole('button', { name: /Map Pin/ }).click();
    await page.locator('.q-map-tap').waitFor();
    await page.waitForTimeout(1500);
    await shot('08-map-pin');
    await step('wrong');
    await page.waitForTimeout(1500);
    await shot('09-map-pin-feedback');
    check(await page.locator('.mark-bad, .tiny.mark-bad').count() > 0, 'wrong map tap is marked');

    // 7. practice: Map Sweep
    await page.goto(BASE + '#/practice/sweep', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    for (let i = 0; i < 6; i++) await step('right');
    await page.waitForTimeout(1200);
    await shot('10-map-sweep');
    check((await page.locator('.capital-label').count()) >= 2, 'map sweep labels solved capitals');

    // 8. trick capitals
    await page.goto(BASE + '#/practice/tricks', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await shot('11-tricks');

    // 9. explore + search
    await page.goto(BASE + '#/explore', { waitUntil: 'networkidle' });
    await page.locator('.searchbox input').fill('nairobi');
    await page.waitForTimeout(200);
    await shot('12-search');
    await page.locator('.sb-results li').first().dispatchEvent('mousedown');
    await page.waitForTimeout(2000);
    check((await page.locator('.cc-name').innerText()).includes('Kenya'), 'search "nairobi" opens Kenya');
    await shot('13-explore-kenya');

    // 10. flag finder
    await page.goto(BASE + '#/flags', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Red' }).click();
    await page.getByRole('button', { name: /Crescent/ }).click();
    await page.waitForTimeout(300);
    const nFlags = await page.locator('.flag-grid .flag-tile').count();
    check(nFlags >= 8 && nFlags <= 20, `flag finder red+crescent → ${nFlags} flags`);
    const names = await page.locator('.flag-grid .ft-name').allInnerTexts();
    check(names.includes('Turkey') && names.includes('Tunisia'), 'Turkey and Tunisia are among them');
    await shot('14-flag-finder');

    // 11. stats & settings
    await page.goto(BASE + '#/stats', { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await shot('15-stats');
    await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
    await page.getByRole('radio', { name: /Dark/ }).click();
    await page.waitForTimeout(300);
    check((await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'theme switch sets dark');
    await shot('16-settings');

    // 12. deep link to explore a tiny country (globe zooms) in dark mode
    await page.goto(BASE + '#/explore/va', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2200);
    await shot('17-explore-vatican');

    console.log('  console errors:', errors.length ? errors : 'none');
    check(errors.length === 0, 'no console errors');
    await context.close();
  }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
