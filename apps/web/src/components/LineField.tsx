import {useId, useMemo} from "react";
import {motion, useReducedMotion} from "motion/react";

/**
 * Generative line art: every trajectory leaves the same origin and fans out.
 *
 * The figure is drawn, not illustrated - a few dozen quadratic beziers sharing
 * one focal point, with opacity falling away from the centre of the fan. That
 * is also what it means here. On Puns every launch begins from an identical
 * point: the same supply, the same opening price, the same graduation target.
 * What separates one from another is only where it travels afterwards.
 *
 * Cheap enough to animate, resolution-independent, and it inherits the page's
 * ink colour, so it works at any size and in any section.
 */

type Props = {
  /** Number of trajectories. Density reads as intensity. */
  count?: number;
  /** Half-angle of the fan, in degrees. */
  spread?: number;
  /** How far the beziers bow away from a straight line. 0 is straight. */
  bow?: number;
  /** "up" fans above the origin, "down" below, "both" mirrors. */
  direction?: "up" | "down" | "both";
  /** Fraction of the width where the origin sits. */
  origin?: number;
  className?: string;
  /** Stagger the draw-on. Set false where the figure should simply be there. */
  animate?: boolean;
};

export function LineField({
  count = 46,
  spread = 62,
  bow = 0.42,
  direction = "both",
  origin = 0.5,
  className,
  animate = true,
}: Props) {
  const id = useId();
  const reduced = useReducedMotion();

  const W = 1200;
  const H = 520;

  const lines = useMemo(() => {
    const ox = W * origin;
    const oy = H / 2;
    const reach = Math.max(W, H) * 1.15;
    const out: {d: string; opacity: number}[] = [];

    const fans =
      direction === "both" ? [-1, 1] : direction === "up" ? [-1] : [1];

    for (const sign of fans) {
      for (let i = 0; i < count; i++) {
        // t runs -1..1 across the fan; 0 is the spine.
        const t = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
        const angle = (t * spread * Math.PI) / 180;

        const ex = ox + Math.sin(angle) * reach;
        const ey = oy + sign * Math.cos(angle) * reach;

        // Control point pulled back toward the origin so lines leave the focal
        // point tightly and open up further out.
        const cx = ox + Math.sin(angle) * reach * bow * 0.5;
        const cy = oy + sign * Math.cos(angle) * reach * bow;

        out.push({
          d: `M${ox.toFixed(1)},${oy.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`,
          // Centre lines carry the weight; the edges of the fan fade out.
          opacity: 0.06 + (1 - Math.abs(t)) * 0.32,
        });
      }
    }

    return out;
  }, [count, spread, bow, direction, origin]);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke="var(--color-ink)" strokeWidth="0.6">
        {lines.map((line, i) =>
          animate && !reduced ? (
            <motion.path
              key={`${id}-${i}`}
              d={line.d}
              pathLength={1}
              initial={{pathLength: 0, opacity: 0}}
              whileInView={{pathLength: 1, opacity: line.opacity}}
              viewport={{once: true, margin: "-10%"}}
              transition={{
                duration: 1.1,
                // Draw from the spine outward rather than left to right, so the
                // shared origin is what the eye registers first.
                delay: 0.12 + (i % lines.length) * 0.006,
                ease: [0.22, 0.61, 0.36, 1],
              }}
            />
          ) : (
            <path key={`${id}-${i}`} d={line.d} opacity={line.opacity} />
          ),
        )}
      </g>

      {/* The origin itself. Small, solid, and the only filled mark in the figure. */}
      <rect
        x={W * origin - 3}
        y={H / 2 - 3}
        width="6"
        height="6"
        fill="var(--color-ink-deep)"
      />
    </svg>
  );
}
