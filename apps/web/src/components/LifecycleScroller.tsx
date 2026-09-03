import {useMemo, useRef, useState} from "react";
import {AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll} from "motion/react";
import {lifecycle} from "@/lib/content";

/**
 * The lifecycle, told as a pinned sequence.
 *
 * The section holds the viewport while the reader scrolls through it, and the
 * four steps take turns rather than stacking down the page. That ordering is
 * the content: each step can only happen after the one above it, and a list
 * that shows all four at once says they are alternatives.
 *
 * The figure on the right is one object in four states, not four pictures. It
 * starts as a single origin, fans into the supply leaving that origin, becomes
 * the curve the price travels, and closes into a ring that cannot be reopened.
 */

const STAGES = 4;

export function LifecycleScroller() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);

  const {scrollYProgress} = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const next = Math.min(STAGES - 1, Math.max(0, Math.floor(v * STAGES)));
    setActive((current) => (current === next ? current : next));
  });

  // Without the pin there is nothing to drive, so reduced motion gets a plain
  // list with everything open. It reads fine and asks nothing of the reader.
  if (reduced) {
    return (
      <div className="page pt-28 md:pt-36">
        <h2 className="display-2 max-w-[16ch]">From an idea to a locked pool</h2>
        <ol className="mt-12">
          {lifecycle.map((step, i) => (
            <li key={step.title} className="row grid gap-x-10 gap-y-3 py-8 md:grid-cols-[3.5rem_minmax(0,14rem)_minmax(0,1fr)]">
              <span className="meta pt-1">[{String(i + 1).padStart(2, "0")}]</span>
              <h3 className="display-3">{step.title}</h3>
              <p className="prose-tight">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div ref={ref} style={{height: `${STAGES * 100}vh`}} className="relative">
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        <div className="page grid w-full gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-16">
          <div>
            <h2 className="display-2 max-w-[16ch]">From an idea to a locked pool</h2>

            <ol className="mt-10">
              {lifecycle.map((step, i) => {
                const isActive = i === active;
                return (
                  <li key={step.title} className="row">
                    <button
                      type="button"
                      onClick={() => scrollToStage(ref, i)}
                      className="grid w-full grid-cols-[3.25rem_minmax(0,1fr)] items-start gap-x-6 py-5 text-left"
                      aria-current={isActive ? "step" : undefined}
                    >
                      <span
                        className="meta pt-2 transition-colors"
                        style={{color: isActive ? "var(--color-ink)" : undefined}}
                      >
                        [{String(i + 1).padStart(2, "0")}]
                      </span>

                      <span>
                        <span
                          className="display-3 block transition-colors"
                          style={{color: isActive ? "var(--color-ink-deep)" : "var(--color-ink-faint)"}}
                        >
                          {step.title}
                        </span>

                        <AnimatePresence initial={false}>
                          {isActive && (
                            <motion.span
                              className="block overflow-hidden"
                              initial={{height: 0, opacity: 0}}
                              animate={{height: "auto", opacity: 1}}
                              exit={{height: 0, opacity: 0}}
                              transition={{duration: 0.34, ease: [0.22, 0.61, 0.36, 1]}}
                            >
                              <span className="prose-tight mt-2.5 block">{step.body}</span>
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="hidden lg:block">
            <StageFigure stage={active} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Clicking a step scrolls the pin to where that step is active. */
function scrollToStage(ref: React.RefObject<HTMLDivElement | null>, index: number) {
  const el = ref.current;
  if (!el) return;
  const top = el.offsetTop;
  const usable = el.offsetHeight - window.innerHeight;
  window.scrollTo({top: top + (usable * (index + 0.35)) / STAGES, behavior: "smooth"});
}

/* -------------------------------------------------------------------------- */

const S = 420;
const C = S / 2;

function StageFigure({stage}: {stage: number}) {
  const art = useMemo(() => buildStages(), []);

  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="w-full" aria-hidden="true" focusable="false">
      <AnimatePresence mode="wait">
        <motion.g
          key={stage}
          initial={{opacity: 0}}
          animate={{opacity: 1}}
          exit={{opacity: 0}}
          transition={{duration: 0.4, ease: "easeOut"}}
        >
          <g fill="none" stroke="var(--color-ink)" strokeWidth="0.7">
            {art[stage].lines.map((d, i) => (
              <motion.path
                key={i}
                d={d}
                pathLength={1}
                initial={{pathLength: 0, opacity: 0}}
                animate={{pathLength: 1, opacity: art[stage].opacity}}
                transition={{
                  duration: 0.85,
                  delay: i * 0.008,
                  ease: [0.22, 0.61, 0.36, 1],
                }}
              />
            ))}
          </g>

          {art[stage].ring && (
            <motion.circle
              cx={C}
              cy={C}
              r={74}
              fill="none"
              stroke="var(--color-signal)"
              strokeWidth="1.3"
              pathLength={1}
              initial={{pathLength: 0}}
              animate={{pathLength: 1}}
              transition={{duration: 0.9, delay: 0.3, ease: [0.22, 0.61, 0.36, 1]}}
            />
          )}

          <rect x={C - 3} y={C - 3} width="6" height="6" fill="var(--color-ink-deep)" />
        </motion.g>
      </AnimatePresence>
    </svg>
  );
}

/** Four states of one object, all sharing the same centre. */
function buildStages() {
  const reach = S * 0.46;

  // 01 Create. A handful of short trajectories, barely begun.
  const create = Array.from({length: 14}, (_, i) => {
    const a = ((i / 13) * 2 - 1) * 0.5;
    return `M${C},${C} L${(C + Math.sin(a) * 58).toFixed(1)},${(C - Math.cos(a) * 58).toFixed(1)}`;
  });

  // 02 Trade. The supply spread wide, dense where trading is heaviest.
  const trade = Array.from({length: 64}, (_, i) => {
    const t = (i / 63) * 2 - 1;
    const a = t * 1.05;
    const ex = C + Math.sin(a) * reach;
    const ey = C - Math.cos(a) * reach;
    const cx = C + Math.sin(a) * reach * 0.28;
    const cy = C - Math.cos(a) * reach * 0.62;
    return `M${C},${C} Q${cx.toFixed(1)},${cy.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`;
  });

  // 03 Graduate. Everything folds back to a single outcome.
  const graduate = Array.from({length: 64}, (_, i) => {
    const t = (i / 63) * 2 - 1;
    const a = t * 1.05;
    const sx = C + Math.sin(a) * reach;
    const sy = C - Math.cos(a) * reach;
    const cx = C + Math.sin(a) * reach * 0.22;
    const cy = C - Math.cos(a) * reach * 0.18;
    return `M${sx.toFixed(1)},${sy.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${C},${C}`;
  });

  // 04 Pool. Closed, and mirrored above and below: nothing leads out of it.
  const pool = Array.from({length: 72}, (_, i) => {
    const a = (i / 72) * Math.PI * 2;
    const inner = 74;
    const outer = reach;
    return `M${(C + Math.cos(a) * inner).toFixed(1)},${(C + Math.sin(a) * inner).toFixed(1)} L${(C + Math.cos(a) * outer).toFixed(1)},${(C + Math.sin(a) * outer).toFixed(1)}`;
  });

  return [
    {lines: create, opacity: 0.5, ring: false},
    {lines: trade, opacity: 0.3, ring: false},
    {lines: graduate, opacity: 0.28, ring: false},
    {lines: pool, opacity: 0.16, ring: true},
  ];
}
