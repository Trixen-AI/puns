/**
 * Graduation progress.
 *
 * The single number that is comparable across every launch, so it gets a bar
 * rather than a label. The bar fills against a hairline track, and the figure
 * sits beside it in mono because it is a reading, not prose.
 */
export function Progress({value, label}: {value: number; label?: string}) {
  const pct = Math.min(100, Math.max(0, value * 100));
  const done = pct >= 100;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        {label && <span className="meta">{label}</span>}
        <span className="meta" style={{color: done ? "var(--color-signal)" : undefined}}>
          {pct.toFixed(1)}%
        </span>
      </div>
      <div
        className="mt-1.5 h-px w-full bg-rule"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-px transition-[width] duration-500"
          style={{
            width: `${pct}%`,
            background: done ? "var(--color-signal)" : "var(--color-ink-deep)",
          }}
        />
      </div>
    </div>
  );
}
