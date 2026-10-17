/** A circular match score, the way Tsenta shows it. The number is always printed, so color is never the only signal. */
export function MatchRing({ value, size = 38 }: { value: number | null | undefined; size?: number }) {
  if (value == null) return null;
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const r = (size - 6) / 2, c = 2 * Math.PI * r;
  const color = pct >= 75 ? 'var(--color-success)' : pct >= 50 ? 'var(--color-warning)' : 'var(--color-danger)';
  return (
    <span role="img" aria-label={`${pct}% match`} className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="3" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      <span aria-hidden className="absolute text-[10.5px] font-semibold">{pct}%</span>
    </span>
  );
}
