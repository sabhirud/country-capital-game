import { describe, expect, it } from 'vitest';
import { getCountry, COUNTRIES, idsForFocus } from '../src/data/countries.ts';
import { checkCapital, checkCountry, isCorrect, levenshtein, normalize } from '../src/engine/answer.ts';
import { applyAnswer, DAY, HOUR, isFading, tierOf, type CardState } from '../src/engine/srs.ts';
import { capitalChoices, flagChoices } from '../src/engine/distractors.ts';
import { buildSession, requeue } from '../src/engine/session.ts';
import { sanitize, emptySave } from '../src/engine/storage.ts';

function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe('normalize & levenshtein', () => {
  it('strips accents, case, punctuation', () => {
    expect(normalize('  Bogotá ')).toBe('bogota');
    expect(normalize("N'Djamena")).toBe('ndjamena');
    expect(normalize("St. John's")).toBe(normalize('Saint Johns'));
    expect(normalize('Port-au-Prince')).toBe('port au prince');
    expect(normalize('Washington, D.C.')).toBe('washington d c');
  });
  it('counts transpositions as one edit', () => {
    expect(levenshtein('tokoy', 'tokyo')).toBe(1);
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('abc', 'abc')).toBe(0);
    expect(levenshtein('abcdef', 'zzzzzz', 2)).toBe(3);
  });
});

describe('checkCapital', () => {
  const v = (input: string, id: string) => checkCapital(input, getCountry(id));

  it('accepts accents-free and different-case answers', () => {
    expect(v('bogota', 'co').verdict).toBe('correct');
    expect(v('REYKJAVIK', 'is').verdict).toBe('correct');
    expect(v('chisinau', 'md').verdict).toBe('correct');
  });
  it('accepts alternate spellings', () => {
    expect(v('Kiev', 'ua').verdict).toBe('correct');
    expect(v('Kotte', 'lk').verdict).toBe('correct');
    expect(v('washington dc', 'us').verdict).toBe('correct');
    expect(v('Nukualofa', 'to').verdict).toBe('correct');
  });
  it('accepts official alternate capitals', () => {
    expect(v('La Paz', 'bo').verdict).toBe('correct');
    expect(v('Cape Town', 'za').verdict).toBe('correct');
    expect(v('Bloemfontein', 'za').verdict).toBe('correct');
    expect(v('The Hague', 'nl').verdict).toBe('correct');
    expect(v('den haag', 'nl').verdict).toBe('correct');
    expect(v('Abidjan', 'ci').verdict).toBe('correct');
  });
  it('forgives small typos on longer names and reports the right spelling', () => {
    const r = v('Ouagadogou', 'bf');
    expect(r.verdict).toBe('typo');
    if (r.verdict === 'typo') expect(r.canonical).toBe('Ouagadougou');
    expect(v('Tegucigalpa', 'hn').verdict).toBe('correct');
    expect(v('Tegucigapla', 'hn').verdict).toBe('typo');
    expect(v('Canbera', 'au').verdict).toBe('typo');
  });
  it('is strict on very short names', () => {
    expect(v('Rome', 'it').verdict).toBe('correct');
    expect(v('Rom', 'it').verdict).toBe('typo'); // one slip allowed on a 4-letter name
    expect(v('Rm', 'it').verdict).toBe('wrong');
    expect(v('Bku', 'az').verdict).toBe('typo');
    expect(v('Bk', 'az').verdict).toBe('wrong');
    expect(isCorrect(v('Lima', 'pe'))).toBe(true);
    expect(isCorrect(v('Lome', 'pe'))).toBe(false);
  });
  it('rejects decoy cities and says so', () => {
    const r = v('Sydney', 'au');
    expect(r.verdict).toBe('wrong');
    if (r.verdict === 'wrong') expect(r.decoy).toBe('Sydney');
    expect(v('Istanbul', 'tr').verdict).toBe('wrong');
    expect(v('Tel Aviv', 'il').verdict).toBe('wrong');
  });
  it('recognises another country’s capital', () => {
    const r = v('Brazzaville', 'cd');
    expect(r.verdict).toBe('wrong');
    if (r.verdict === 'wrong') expect(r.otherCountry?.id).toBe('cg');
    const r2 = v('Kingston', 'vc');
    expect(r2.verdict).toBe('wrong');
    if (r2.verdict === 'wrong') expect(r2.otherCountry?.id).toBe('jm');
  });
  it('does not let a typo of a different capital count', () => {
    // Kingstown vs Kingston are 1 edit apart — each must only be accepted for its own country
    expect(v('Kingstown', 'vc').verdict).toBe('correct');
    expect(v('Kingston', 'jm').verdict).toBe('correct');
    expect(isCorrect(v('Kingstown', 'jm'))).toBe(false);
  });
  it('rejects empty input', () => {
    expect(v('   ', 'fr').verdict).toBe('wrong');
  });
});

describe('checkCountry', () => {
  it('accepts names and aliases', () => {
    expect(checkCountry('ivory coast', getCountry('ci')).verdict).toBe('correct');
    expect(checkCountry('DRC', getCountry('cd')).verdict).toBe('correct');
    expect(checkCountry('Czech Republic', getCountry('cz')).verdict).toBe('correct');
    expect(checkCountry('Burma', getCountry('mm')).verdict).toBe('correct');
  });
  it('distinguishes the two Congos and Dominicas', () => {
    expect(isCorrect(checkCountry('Dominica', getCountry('do')))).toBe(false);
    expect(isCorrect(checkCountry('Dominican Republic', getCountry('dm')))).toBe(false);
    expect(isCorrect(checkCountry('Republic of the Congo', getCountry('cd')))).toBe(false);
  });
});

describe('spaced repetition', () => {
  const t0 = new Date('2026-01-01T17:00:00').getTime();

  it('new → bronze after the first correct answer', () => {
    const c = applyAnswer(undefined, { correct: true, kind: 'mc' }, t0);
    expect(c.stage).toBe(1);
    expect(tierOf(c)).toBe('bronze');
  });

  it('multiple choice alone can never reach silver', () => {
    let c: CardState | undefined;
    let t = t0;
    for (let i = 0; i < 20; i++) {
      c = applyAnswer(c, { correct: true, kind: 'mc' }, t);
      t += 40 * DAY;
    }
    expect(tierOf(c)).toBe('bronze');
  });

  it('hinted typing counts like multiple choice', () => {
    let c = applyAnswer(undefined, { correct: true, kind: 'mc' }, t0);
    c = applyAnswer(c, { correct: true, kind: 'mc' }, t0 + 60_000); // stage 2
    c = applyAnswer(c, { correct: true, kind: 'type', hinted: true }, t0 + 2 * DAY);
    expect(c.stage).toBe(2);
  });

  it('gold cannot be crammed in one day', () => {
    let c: CardState | undefined;
    let t = t0;
    for (let i = 0; i < 50; i++) {
      c = applyAnswer(c, { correct: true, kind: 'type' }, t);
      t += 5 * 60 * 1000; // every 5 minutes
    }
    expect(tierOf(c)).toBe('bronze');
    expect(c!.stage).toBe(2);
  });

  it('typed recall spaced over days reaches silver then gold', () => {
    let c = applyAnswer(undefined, { correct: true, kind: 'mc' }, t0); // 1
    c = applyAnswer(c, { correct: true, kind: 'mc' }, t0 + 3 * 60_000); // 2 (same session)
    c = applyAnswer(c, { correct: true, kind: 'type' }, t0 + 1 * DAY); // 3
    expect(tierOf(c)).toBe('silver');
    c = applyAnswer(c, { correct: true, kind: 'type' }, t0 + 4 * DAY); // 4
    c = applyAnswer(c, { correct: true, kind: 'type' }, t0 + 10 * DAY); // 5
    expect(tierOf(c)).toBe('gold');
  });

  it('allows a little slack for playing earlier in the day', () => {
    let c = applyAnswer(undefined, { correct: true, kind: 'mc' }, t0);
    c = applyAnswer(c, { correct: true, kind: 'mc' }, t0 + 60_000); // stage 2, due in 20h
    c = applyAnswer(c, { correct: true, kind: 'type' }, t0 + 17 * HOUR); // within 20% slack
    expect(c.stage).toBe(3);
  });

  it('a wrong answer drops two stages and makes it due now', () => {
    const c0: CardState = { stage: 5, due: t0, lastSeen: t0 - DAY, seen: 9, correct: 8, wrong: 1 };
    const c = applyAnswer(c0, { correct: false, kind: 'type', confusedWith: 'cg' }, t0);
    expect(c.stage).toBe(3);
    expect(c.due).toBe(t0);
    expect(c.confusedWith).toEqual({ cg: 1 });
    expect(c0.stage).toBe(5); // immutable
  });

  it('practice mistakes never lower a card', () => {
    const c0: CardState = { stage: 4, due: t0 + DAY, lastSeen: t0, seen: 5, correct: 5, wrong: 0 };
    expect(applyAnswer(c0, { correct: false, kind: 'type', practice: true }, t0).stage).toBe(4);
  });

  it('overdue silver/gold cards fade', () => {
    const c: CardState = { stage: 5, due: t0, lastSeen: t0, seen: 5, correct: 5, wrong: 0 };
    expect(isFading(c, t0 + 10 * DAY)).toBe(false);
    expect(isFading(c, t0 + 15 * DAY)).toBe(true);
  });
});

describe('distractors', () => {
  it('capital choices: 4 unique options including the answer, never an accepted alternate', () => {
    const rng = seeded(7);
    for (const c of COUNTRIES) {
      const opts = capitalChoices(c, rng);
      expect(opts).toHaveLength(4);
      expect(new Set(opts.map(normalize)).size).toBe(4);
      expect(opts).toContain(c.capital);
      const wrong = opts.filter((o) => o !== c.capital);
      for (const w of wrong) expect(isCorrect(checkCapital(w, c)), `${c.id}: ${w}`).toBe(false);
    }
  });
  it('uses past confusions as options', () => {
    const opts = capitalChoices(getCountry('cd'), seeded(3), { cg: 3 });
    expect(opts).toContain('Brazzaville');
  });
  it('flag choices: 4 unique countries including the target', () => {
    const rng = seeded(11);
    for (const c of COUNTRIES) {
      const opts = flagChoices(c, rng);
      expect(new Set(opts).size).toBe(4);
      expect(opts).toContain(c.id);
    }
  });
});

describe('session builder', () => {
  const now = new Date('2026-03-01T17:00:00').getTime();

  it('a brand-new player gets new countries from the first sub-region of the focus, with study cards', () => {
    const plan = buildSession({ cards: {}, focusIds: idsForFocus({ kind: 'continent', continent: 'Europe' }), now, newLimit: 5, size: 15, rng: seeded(2) });
    expect(plan.newCount).toBe(5);
    expect(plan.items.map((i) => i.id)).toEqual(['gb', 'ie', 'fr', 'be', 'nl']);
    expect(plan.items.every((i) => i.study && i.kind === 'mc')).toBe(true);
  });

  it('due reviews come first and new countries are held back when there is a backlog', () => {
    const cards: Record<string, CardState> = {};
    for (const id of idsForFocus({ kind: 'continent', continent: 'Africa' }).slice(0, 20))
      cards[id] = { stage: 3, due: now - DAY, lastSeen: now - 3 * DAY, seen: 3, correct: 3, wrong: 0 };
    const plan = buildSession({ cards, focusIds: idsForFocus({ kind: 'world' }), now, newLimit: 5, size: 15, rng: seeded(5) });
    expect(plan.items).toHaveLength(15);
    expect(plan.newCount).toBe(0);
    expect(plan.items.every((i) => !i.study)).toBe(true);
  });

  it('mixes a few new countries among reviews', () => {
    const cards: Record<string, CardState> = {};
    for (const id of ['fr', 'de', 'it', 'es', 'pt', 'gb'])
      cards[id] = { stage: 2, due: now - HOUR, lastSeen: now - DAY, seen: 2, correct: 2, wrong: 0 };
    const plan = buildSession({ cards, focusIds: idsForFocus({ kind: 'world' }), now, newLimit: 3, size: 15, rng: seeded(9) });
    expect(plan.dueCount).toBe(6);
    expect(plan.newCount).toBe(3);
    expect(plan.items).toHaveLength(9);
    expect(plan.items[0].study).toBe(true);
  });

  it('requeues a wrong answer a few questions later, and a new country once more', () => {
    const items = buildSession({ cards: {}, focusIds: idsForFocus({ kind: 'world' }), now, newLimit: 5, size: 15, rng: seeded(4) }).items;
    const card1: CardState = { stage: 1, due: now, lastSeen: now, seen: 1, correct: 1, wrong: 0 };
    const after = requeue(items, 0, true, card1, seeded(1));
    expect(after.length).toBe(items.length + 1);
    expect(after.filter((i) => i.id === items[0].id)).toHaveLength(2);
    const card3: CardState = { stage: 3, due: now + DAY, lastSeen: now, seen: 4, correct: 4, wrong: 0 };
    expect(requeue(items, 0, true, card3).length).toBe(items.length);
  });
});

describe('storage', () => {
  it('sanitizes junk and keeps valid cards', () => {
    expect(sanitize(null).version).toBe(1);
    expect(sanitize({ version: 2 }).cards).toEqual({});
    const s = sanitize({ ...emptySave(), cards: { fr: { stage: 9, due: 1 }, xx: 'bad' }, settings: { sound: false } });
    expect(s.cards.fr.stage).toBe(6);
    expect(s.cards.xx).toBeUndefined();
    expect(s.settings.sound).toBe(false);
    expect(s.settings.voice).toBe(true);
  });
});

describe('answer checking across the whole dataset', () => {
  it('every accepted capital is correct for its own country', () => {
    for (const c of COUNTRIES) {
      for (const a of [c.capital, ...(c.capitalAliases ?? []), ...(c.altCapitals ?? []).map((x) => x.name)])
        expect(checkCapital(a, c).verdict, `${c.id}: ${a}`).toBe('correct');
      expect(checkCountry(c.name, c).verdict, c.id).toBe('correct');
    }
  });
  it("one country's capital is never accepted for another (except shared Jerusalem)", () => {
    const bad: string[] = [];
    for (const a of COUNTRIES)
      for (const b of COUNTRIES) {
        if (a.id === b.id || (a.id === 'il' && b.id === 'ps')) continue;
        if (isCorrect(checkCapital(a.capital, b))) bad.push(`${a.capital} accepted for ${b.name}`);
      }
    expect(bad).toEqual([]);
  });
  it("one country's name is never accepted for another", () => {
    const bad: string[] = [];
    for (const a of COUNTRIES)
      for (const b of COUNTRIES) if (a.id !== b.id && isCorrect(checkCountry(a.name, b))) bad.push(`${a.name} → ${b.name}`);
    expect(bad).toEqual([]);
  });
});

import { search } from '../src/engine/search.ts';
describe('search', () => {
  it('finds by country, capital, alias, and with typos', () => {
    expect(search('kenya')[0].country.id).toBe('ke');
    expect(search('nairobi')[0].country.id).toBe('ke');
    expect(search('nairobi')[0].via).toBe('capital');
    expect(search('ivory')[0].country.id).toBe('ci');
    expect(search('ouagadogou')[0].country.id).toBe('bf');
    expect(search('bogota')[0].country.id).toBe('co');
    expect(search('')).toEqual([]);
  });
  it('ranks prefix matches first', () => {
    expect(search('ma').length).toBeGreaterThan(3);
    expect(search('austr')[0].country.id).toMatch(/au|at/);
  });
});
