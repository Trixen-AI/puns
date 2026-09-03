import {useRef} from "react";
import {motion, useReducedMotion, useScroll, useTransform} from "motion/react";
import {LineField} from "@/components/LineField";

/**
 * A full-bleed band of generative line art that opens as it passes through the
 * viewport.
 *
 * The motion is scroll-linked rather than time-linked on purpose: it responds
 * to the reader instead of performing at them, so it reads as the figure
 * reacting to being looked at. Scroll position drives scale and opacity only -
 * nothing moves position, which keeps it from fighting the text around it.
 */

type Props = {
  caption?: string;
  count?: number;
  spread?: number;
  height?: string;
};

export function FieldBand({
  caption,
  count = 54,
  spread = 68,
  height = "clamp(20rem, 44vw, 34rem)",
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const {scrollYProgress} = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [0.88, 1.06, 1.18]);
  const opacity = useTransform(scrollYProgress, [0, 0.25, 0.75, 1], [0, 1, 1, 0.35]);

  return (
    <div ref={ref} className="relative overflow-hidden" style={{height}}>
      <motion.div
        className="absolute inset-0"
        style={reduced ? undefined : {scale, opacity}}
      >
        <LineField
          count={count}
          spread={spread}
          direction="both"
          bow={0.38}
          className="h-full w-full"
          animate={false}
        />
      </motion.div>

      {caption && (
        <div className="page pointer-events-none relative flex h-full items-end pb-8">
          <p className="meta max-w-[34ch]">{caption}</p>
        </div>
      )}
    </div>
  );
}
