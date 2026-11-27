/** Ring showing the share of countries at bronze / silver / gold. */
export function ProgressRing({ bronze, silver, gold, total, size = 120, label }: { bronze: number; silver: number; gold: number; total: number; size?: number; label?: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const seg = (n: number) => (total ? (n / total) * c : 0);
  const g = seg(gold);
  const s = seg(silver);
  const b = seg(bronze);
  const conquered = total ? Math.round(((silver + gold) / total) * 100) : 0;
  return (
    <svg className="ring" width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`${conquered}% conquered`}>
      <circle cx="50" cy="50" r={r} className="ring-track" />
      <circle cx="50" cy="50" r={r} className="ring-gold" strokeDasharray={`${g} ${c - g}`} strokeDashoffset={c * 0.25} />
      <circle cx="50" cy="50" r={r} className="ring-silver" strokeDasharray={`${s} ${c - s}`} strokeDashoffset={c * 0.25 - g} />
      <circle cx="50" cy="50" r={r} className="ring-bronze" strokeDasharray={`${b} ${c - b}`} strokeDashoffset={c * 0.25 - g - s} />
      <text x="50" y="49" className="ring-num">{conquered}%</text>
      <text x="50" y="64" className="ring-sub">{label ?? 'conquered'}</text>
    </svg>
  );
}
