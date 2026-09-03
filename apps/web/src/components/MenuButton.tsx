import {motion} from "motion/react";

/**
 * The mobile menu control: three rules that fold into a cross.
 *
 * Drawn rather than lettered, and animated between the two states rather than
 * swapped, so the control reads as one object changing rather than two icons
 * taking turns.
 */
export function MenuButton({open, onClick}: {open: boolean; onClick: () => void}) {
  const bar = "absolute left-0 h-px w-full bg-ink-deep";
  const spring = {duration: 0.22, ease: [0.22, 0.61, 0.36, 1] as const};

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={open ? "Close menu" : "Open menu"}
      aria-expanded={open}
      className="relative z-50 grid h-9 w-9 place-items-center md:hidden"
    >
      <span className="relative block h-[11px] w-[18px]">
        <motion.span
          className={bar}
          initial={false}
          animate={open ? {top: 5, rotate: 45} : {top: 0, rotate: 0}}
          transition={spring}
        />
        <motion.span
          className={bar}
          style={{top: 5}}
          initial={false}
          animate={{opacity: open ? 0 : 1}}
          transition={{duration: 0.12}}
        />
        <motion.span
          className={bar}
          initial={false}
          animate={open ? {top: 5, rotate: -45} : {top: 10, rotate: 0}}
          transition={spring}
        />
      </span>
    </button>
  );
}
