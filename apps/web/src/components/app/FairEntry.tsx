import {useEffect, useState} from "react";

/**
 * The opening window, made visible.
 *
 * For the first five seconds of a launch, buys carry a tax that starts at 99%
 * and decays to nothing. It exists to make sniping unprofitable, and it works,
 * but nothing on chain warns an ordinary person that it is running. Someone who
 * clicks fast loses most of their money to a rule they were never shown.
 *
 * So it gets shown. The bar drains as the tax does, and the figure is read from
 * the chain for the connected wallet rather than estimated from a clock, since
 * an exempt address pays nothing regardless of how recently the launch opened.
 */

/** The tax at t=0. Anything at or near this is the worst possible moment. */
const OPENING_BPS = 9900;

export function FairEntry({taxBps}: {taxBps: bigint}) {
  const percent = Number(taxBps) / 100;
  const [tick, setTick] = useState(0);

  // Re-render on a short interval so the bar moves between chain reads rather
  // than jumping in steps.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 120);
    return () => clearInterval(id);
  }, []);
  void tick;

  const remaining = Math.min(100, (Number(taxBps) / OPENING_BPS) * 100);

  return (
    <div className="border-y border-rule py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <p className="text-ink">Buying right now is taxed</p>
        <p className="font-mono text-[1.125rem]" style={{color: "var(--color-signal)"}}>
          {percent.toFixed(percent < 1 ? 2 : 0)}%
        </p>
      </div>

      <div className="mt-3 h-px w-full bg-rule">
        <div
          className="h-px transition-[width] duration-500 ease-out"
          style={{width: `${remaining}%`, background: "var(--color-signal)"}}
        />
      </div>

      <p className="prose-tight mt-3 text-[0.8125rem]">
        Every launch opens with a tax on buys that falls to nothing within five
        seconds. It is there to make sniping unprofitable. Waiting costs you
        nothing at all.
      </p>
    </div>
  );
}
