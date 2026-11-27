import { useRef, useState } from 'react';
import { BY_ID } from '../data/countries.ts';
import { getSave, importSave, resetProgress, updateSettings, useSave } from '../store.ts';
import type { ThemePref } from '../engine/storage.ts';
import { canSpeak, sayCapital } from '../audio/speech.ts';
import { sfx } from '../audio/sfx.ts';
import { Icon } from '../components/Icon.tsx';
import { toast } from '../components/Toasts.tsx';

function Toggle({ checked, onChange, label, desc }: { checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <label className="setting">
      <span className="set-text">
        <span className="set-label">{label}</span>
        {desc && <span className="set-desc">{desc}</span>}
      </span>
      <input type="checkbox" role="switch" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: { v: T; label: React.ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.v)} role="radio" aria-checked={value === o.v} className={value === o.v ? 'active' : ''} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Settings() {
  const save = useSave();
  const s = save.settings;
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const isStandalone = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone);

  const exportData = () => {
    const blob = new Blob([JSON.stringify(getSave(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `capital-conquest-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const importData = async (f: File) => {
    try {
      const ok = importSave(JSON.parse(await f.text()));
      toast({ text: ok ? '✅ Progress restored' : '⚠️ That file has no progress in it', tone: 'info' });
    } catch {
      toast({ text: '⚠️ Could not read that file', tone: 'info' });
    }
  };

  return (
    <div className="screen settings">
      <header className="screen-head">
        <h1>Settings</h1>
      </header>

      <section className="card">
        <h2>Look</h2>
        <div className="setting">
          <span className="set-text">
            <span className="set-label">Theme</span>
          </span>
          <Seg<ThemePref>
            label="Theme"
            value={s.theme}
            onChange={(v) => updateSettings({ theme: v })}
            options={[
              { v: 'auto', label: <><Icon name="auto" size={16} /> Auto</> },
              { v: 'light', label: <><Icon name="sun" size={16} /> Light</> },
              { v: 'dark', label: <><Icon name="moon" size={16} /> Dark</> },
            ]}
          />
        </div>
      </section>

      <section className="card">
        <h2>Sound</h2>
        <Toggle label="Sound effects" checked={s.sound} onChange={(v) => { updateSettings({ sound: v }); if (v) setTimeout(() => sfx.correct(), 50); }} />
        {canSpeak() ? (
          <>
            <Toggle label="Read capitals aloud" desc="Hear the pronunciation on new countries and after mistakes" checked={s.voice} onChange={(v) => updateSettings({ voice: v })} />
            <div className="setting">
              <span className="set-text">
                <span className="set-label">Voice speed</span>
              </span>
              <div className="row-inline">
                <input type="range" min={0.6} max={1.2} step={0.05} value={s.voiceRate} onChange={(e) => updateSettings({ voiceRate: Number(e.target.value) })} aria-label="Voice speed" />
                <button className="btn btn-ghost btn-sm" onClick={() => sayCapital(BY_ID.bf, true)}>
                  <Icon name="speaker" size={16} /> Test
                </button>
              </div>
            </div>
          </>
        ) : (
          <p className="muted small">This browser can’t read text aloud.</p>
        )}
      </section>

      <section className="card">
        <h2>Learning</h2>
        <div className="setting">
          <span className="set-text">
            <span className="set-label">New countries per session</span>
            <span className="set-desc">5 is the sweet spot for most people</span>
          </span>
          <Seg label="New per session" value={s.newPerSession} onChange={(v) => updateSettings({ newPerSession: v })} options={[3, 5, 8].map((v) => ({ v, label: String(v) }))} />
        </div>
        <div className="setting">
          <span className="set-text">
            <span className="set-label">Session length</span>
          </span>
          <Seg label="Session length" value={s.sessionSize} onChange={(v) => updateSettings({ sessionSize: v })} options={[10, 15, 25].map((v) => ({ v, label: `${v}` }))} />
        </div>
        <Toggle label="Retype after a mistake" desc="Typing the right answer once makes it stick" checked={s.retypeOnWrong} onChange={(v) => updateSettings({ retypeOnWrong: v })} />
      </section>

      <section className="card">
        <h2>Your progress</h2>
        <p className="muted small">
          Progress is saved in this browser on this device. {!isStandalone && 'On iPhone, add the game to your Home Screen (Share → Add to Home Screen) so Safari never clears it.'} Make a backup now and then.
        </p>
        <div className="row-actions">
          <button className="btn btn-ghost" onClick={exportData}>
            <Icon name="download" size={18} /> Download backup
          </button>
          <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={18} /> Restore backup
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
        </div>
        <div className="danger">
          {!confirmReset ? (
            <button className="btn btn-danger" onClick={() => setConfirmReset(true)}>
              Reset all progress…
            </button>
          ) : (
            <div className="confirm">
              <span>Erase all {Object.keys(save.cards).length} countries of progress?</span>
              <button
                className="btn btn-danger"
                onClick={() => {
                  resetProgress();
                  setConfirmReset(false);
                  toast({ text: 'Progress reset', tone: 'info' });
                }}
              >
                Yes, erase
              </button>
              <button className="btn btn-ghost" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="card about">
        <h2>How it works</h2>
        <ul>
          <li><strong>Spaced repetition:</strong> each capital comes back just as you’re about to forget it: after 1 day, then 2–3, 6, 14, 30.</li>
          <li><strong>Active recall:</strong> new capitals start as multiple choice, then you type them from memory.</li>
          <li><strong>Dual coding:</strong> flag + map location + name + sound, so there are many ways back to the memory.</li>
          <li><strong>Chunking & interleaving:</strong> new capitals arrive a few at a time from one region, mixed with reviews.</li>
          <li><strong>Gold can’t be crammed:</strong> it needs correct recall on different days.</li>
        </ul>
        <p className="muted small">
          Map data: Natural Earth (public domain). Flags: flag-icons (MIT). 197 countries: 193 UN members + Vatican City, Palestine, Kosovo and Taiwan.
        </p>
      </section>
    </div>
  );
}
