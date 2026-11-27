import { useSyncExternalStore } from 'react';

export interface Toast {
  id: number;
  text: string;
  tone?: 'bronze' | 'silver' | 'gold' | 'info';
  flag?: string;
}

let toasts: Toast[] = [];
let seq = 0;
const ls = new Set<() => void>();
const emit = () => ls.forEach((l) => l());

export function toast(t: Omit<Toast, 'id'>, ms = 2800) {
  const id = ++seq;
  toasts = [...toasts.slice(-2), { ...t, id }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== id);
    emit();
  }, ms);
}

export function Toasts({ flagUrl }: { flagUrl: (id: string) => string }) {
  const list = useSyncExternalStore(
    (l) => {
      ls.add(l);
      return () => ls.delete(l);
    },
    () => toasts,
  );
  return (
    <div className="toasts" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone ?? 'info'}`}>
          {t.flag && <img src={flagUrl(t.flag)} alt="" className="flag flag-xs" />}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
