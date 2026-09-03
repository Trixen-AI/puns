import type {ReactNode} from "react";
import {motion, useReducedMotion} from "motion/react";

/**
 * A short reveal for content entering the viewport.
 *
 * Deliberately small: 12px of travel and a fade, once per element. Anything
 * larger turns reading into waiting, and anything that replays turns a page
 * into a slideshow.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{opacity: 0, y: 12}}
      whileInView={{opacity: 1, y: 0}}
      viewport={{once: true, margin: "-12%"}}
      transition={{duration: 0.55, delay, ease: [0.22, 0.61, 0.36, 1]}}
    >
      {children}
    </motion.div>
  );
}
