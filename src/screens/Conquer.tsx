import { useMemo } from 'react';
import { BY_ID, COUNTRIES, CONTINENTS, focusLabel, idsForFocus, idsOfContinent, parseFocusKey, focusKey } from '../data/countries.ts';
import { buildSession } from '../engine/session.ts';
import { tierOf } from '../engine/srs.ts';
import { setFocus, useSave } from '../store.ts';
import { FlatMap } from '../map/FlatMap.tsx';
import { FocusPicker } from '../components/FocusPicker.tsx';
import { ProgressRing } from '../components/ProgressRing.tsx';
import { Icon } from '../components/Icon.tsx';
import { navigate } from '../router.ts';
import { classForCard, countTiers, nextDueText, TIER_LABEL } from '../progress.ts';

export function Conquer() {
  const save = useSave();
  const focus = parseFocusKey(save.focus);
  const focusIds = useMemo(() => idsForFocus(focus), [save.focus]); // eslint-disable-line react-hooks/exhaustive-deps
  const inFocus = useMemo(() => new Set(focusIds), [focusIds]);
  const world = countTiers(COUNTRIES.map((c) => c.id), save.cards);
  const plan = buildSession({
    cards: save.cards,
    focusIds,
    now: Date.now(),
    newLimit: save.settings.newPerSession,
    size: save.settings.sessionSize,
    rng: () => 0.5,
  });
  const fresh = Object.keys(save.cards).length === 0;
  const next = nextDueText(save.cards);
  const focusCounts = countTiers(focusIds, save.cards);

  return (
    <div className="screen conquer">
      <section className="hero">
        <div className="hero-text">
          <h1 className="brand">
            Capital <span>Conquest</span>
          </h1>
          <p className="hero-sub">
            {fresh
              ? 'You know the flags. Now claim the capitals: learn each one, then turn the whole world gold.'
              : `${world.silver + world.gold} of 197 capitals conquered · ${world.gold} gold`}
          </p>
          <div className="hero-cta">
            {plan.items.length > 0 ? (
              <button className="btn btn-primary btn-xl" onClick={() => navigate('/learn')}>
                <Icon name="play" /> {fresh ? 'Start learning' : 'Continue'}
                <span className="cta-meta">
                  {plan.dueCount > 0 && `${plan.dueCount} review${plan.dueCount === 1 ? '' : 's'}`}
                  {plan.dueCount > 0 && plan.newCount > 0 && ' · '}
                  {plan.newCount > 0 && `${plan.newCount} new`}
                </span>
              </button>
            ) : (
              <button className="btn btn-primary btn-xl" onClick={() => navigate('/practice')}>
                <Icon name="target" /> All caught up — practice
                <span className="cta-meta">{next ? `next review ${next}` : focusCounts.none === 0 ? 'every country met!' : ''}</span>
              </button>
            )}
            <button className="btn btn-ghost btn-lg" onClick={() => navigate('/practice')}>
              <Icon name="zap" /> Practice modes
            </button>
          </div>
        </div>
        <ProgressRing bronze={world.bronze} silver={world.silver} gold={world.gold} total={197} size={132} />
      </section>

      <FocusPicker value={save.focus} onChange={setFocus} cards={save.cards} />

      <section className="card map-card">
        <div className="map-card-head">
          <h2>{focusLabel(focus)}</h2>
          <div className="legend">
            <span className="lg lg-none">{focusCounts.none} unmet</span>
            <span className="lg lg-bronze">{focusCounts.bronze} bronze</span>
            <span className="lg lg-silver">{focusCounts.silver} silver</span>
            <span className="lg lg-gold">{focusCounts.gold} gold</span>
            {focusCounts.fading > 0 && <span className="lg lg-fading">{focusCounts.fading} fading</span>}
          </div>
        </div>
        <FlatMap
          className="conquer-map"
          fitIds={focus.kind === 'world' ? null : focusIds}
          classOf={(id) => `${classForCard(save.cards[id])}${inFocus.has(id) ? '' : ' out-focus'}`}
          onPick={(id) => navigate(`/explore/${id}`)}
          tooltip={(id) => {
            const c = BY_ID[id];
            const card = save.cards[id];
            if (!card || card.stage === 0) return `${c.name} · not met yet`;
            return `${c.name} · ${c.capital} · ${TIER_LABEL[tierOf(card)]}`;
          }}
          ariaLabel="Your conquest map. Countries are colored by how well you know their capital."
        />
        <p className="map-help">Gold needs recall on different days: you can’t cram it. Tap a country for its card.</p>
      </section>

      <section className="continents">
        {CONTINENTS.map((ct) => {
          const t = countTiers(idsOfContinent(ct), save.cards);
          const pct = (n: number) => `${(n / t.total) * 100}%`;
          return (
            <button key={ct} className="continent-row" onClick={() => setFocus(focusKey({ kind: 'continent', continent: ct }))}>
              <span className="cr-name">{ct}</span>
              <span className="cr-bar">
                <span className="mb-gold" style={{ width: pct(t.gold) }} />
                <span className="mb-silver" style={{ width: pct(t.silver) }} />
                <span className="mb-bronze" style={{ width: pct(t.bronze) }} />
              </span>
              <span className="cr-num">
                {t.silver + t.gold}/{t.total}
              </span>
            </button>
          );
        })}
      </section>
    </div>
  );
}
