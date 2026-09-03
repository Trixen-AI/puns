import {useId, useMemo} from "react";
import {motion, useReducedMotion} from "motion/react";

/**
 * The bonding curve every Puns launch follows, drawn from the real formula.
 *
 * This is the page's one ornament, and it is not decoration. The curve holds
 * the whole billion-token supply against a virtual 1.68 ETH reserve, so with a
 * constant product k = 1.68e9 the price after `s` tokens have been sold is
 *
 *     price(s) = k / (supply - s)^2
 *
 * Plotted against tokens sold rather than ETH raised, because that is the axis
 * where the shape is legible: nearly flat for the first half of the supply,
 * then steep. It ends at 714,285,714 tokens, where the curve sells out and the
 * launch graduates at exactly 12.25x the opening price - the same for every
 * launch. Every point on this line is a price someone actually pays.
 */

const VIRTUAL_RESERVE = 1.68;
const SUPPLY = 1_000_000_000;
const RESERVED = 285_714_285.71;
const SELLABLE = SUPPLY - RESERVED;
const K = VIRTUAL_RESERVE * SUPPLY;

/** Price in gwei per token once `sold` tokens have left the curve. */
export function priceAfter(sold: number): number {
  const tokenReserve = SUPPLY - sold;
  return (K / (tokenReserve * tokenReserve)) * 1e9;
}

export const OPENING_PRICE = priceAfter(0);
export const GRADUATION_PRICE = priceAfter(SELLABLE);

type Props = {
  /** 0 to 1. Where along the curve to mark the reference point. */
  progress?: number;
  className?: string;
};

export function BondingCurve({progress = 0.62, className}: Props) {
  const id = useId();
  const reduced = useReducedMotion();
  const W = 760;
  const H = 430;
  const PAD = {top: 54, right: 18, bottom: 42, left: 4};

  const g = useMemo(() => {
    const x = (sold: number) =>
      PAD.left + (sold / SELLABLE) * (W - PAD.left - PAD.right);
    const y = (price: number) =>
      H -
      PAD.bottom -
      ((price - OPENING_PRICE) / (GRADUATION_PRICE - OPENING_PRICE)) *
        (H - PAD.top - PAD.bottom);

    const path = Array.from({length: 241}, (_, i) => {
      const sold = (i / 240) * SELLABLE;
      const px = x(sold).toFixed(2);
      const py = y(priceAfter(sold)).toFixed(2);
      return `${i === 0 ? "M" : "L"}${px},${py}`;
    }).join(" ");

    // Hairlines dropped from the curve to the baseline. They crowd where the
    // price climbs fastest, so the shape of the risk is visible before a single
    // number is read.
    const rays = Array.from({length: 150}, (_, i) => {
      const sold = (i / 189) * SELLABLE;
      return {x: x(sold), y: y(priceAfter(sold))};
    });

    const mark = progress * SELLABLE;

    return {
      x,
      y,
      path,
      rays,
      baseline: H - PAD.bottom,
      marker: {x: x(mark), y: y(priceAfter(mark)), price: priceAfter(mark)},
      end: {x: x(SELLABLE), y: y(GRADUATION_PRICE)},
    };
  }, [progress, PAD.bottom, PAD.left, PAD.right, PAD.top]);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      role="img"
      aria-label={`The bonding curve every launch follows. Price climbs from ${OPENING_PRICE.toFixed(2)} to ${GRADUATION_PRICE.toFixed(2)} gwei per token as the curve sells out, then the launch graduates.`}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient
          id={`${id}-fade`}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1={PAD.top}
          x2="0"
          y2={H - PAD.bottom}
        >
          <stop offset="0%" stopColor="var(--color-ink)" stopOpacity="0.45" />
          <stop offset="65%" stopColor="var(--color-ink)" stopOpacity="0.14" />
          <stop offset="100%" stopColor="var(--color-ink)" stopOpacity="0.04" />
        </linearGradient>
      </defs>

      <g stroke={`url(#${id}-fade)`} strokeWidth="0.7">
        {g.rays.map((r, i) => (
          <motion.line
            key={i}
            x1={r.x}
            y1={r.y}
            x2={r.x}
            y2={g.baseline}
            initial={reduced ? false : {opacity: 0}}
            animate={{opacity: 1}}
            transition={{duration: 0.5, delay: 0.5 + (i / g.rays.length) * 0.7}}
          />
        ))}
      </g>

      <line
        x1="0"
        y1={g.baseline}
        x2={W}
        y2={g.baseline}
        stroke="var(--color-rule)"
        strokeWidth="1"
      />

      <motion.path
        d={g.path}
        pathLength={1}
        initial={reduced ? false : {pathLength: 0}}
        animate={{pathLength: 1}}
        transition={{duration: 1.5, ease: [0.22, 0.61, 0.36, 1], delay: 0.2}}
        fill="none"
        stroke="var(--color-ink-deep)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Graduation: where the curve ends and the locked pool begins. */}
      <motion.g
        initial={reduced ? false : {opacity: 0}}
        animate={{opacity: 1}}
        transition={{duration: 0.5, delay: 1.5}}
      >
        <line
          x1={g.end.x}
          y1={g.end.y}
          x2={g.end.x}
          y2={g.baseline}
          stroke="var(--color-signal)"
          strokeWidth="1"
          strokeDasharray="2 4"
        />
        <circle cx={g.end.x} cy={g.end.y} r="3.5" fill="var(--color-signal)" />
        <text
          x={g.end.x}
          y={g.end.y - 26}
          textAnchor="end"
          className="meta"
          fill="var(--color-ink-muted)"
        >
          graduates at 4.2 ETH
        </text>
        <text x={g.end.x} y={g.end.y - 12} textAnchor="end" className="meta">
          {GRADUATION_PRICE.toFixed(2)} gwei · 12.25×
        </text>
      </motion.g>

      <motion.g
        initial={reduced ? false : {opacity: 0}}
        animate={{opacity: 1}}
        transition={{duration: 0.5, delay: 1.7}}
      >
        <circle cx={g.marker.x} cy={g.marker.y} r="2.5" fill="var(--color-ink-deep)" />
        <text
          x={g.marker.x - 9}
          y={g.marker.y - 10}
          textAnchor="end"
          className="meta"
          fill="var(--color-ink-muted)"
        >
          {g.marker.price.toFixed(2)} gwei
        </text>
      </motion.g>

      <text x={PAD.left} y={g.baseline + 20} className="meta">
        opens at {OPENING_PRICE.toFixed(2)} gwei
      </text>
      <text x={g.end.x} y={g.baseline + 20} textAnchor="end" className="meta">
        714,285,714 sold
      </text>
    </svg>
  );
}
