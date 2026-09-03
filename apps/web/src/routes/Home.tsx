import {Link} from "react-router-dom";
import {BondingCurve} from "@/components/BondingCurve";
import {FieldBand} from "@/components/FieldBand";
import {LifecycleScroller} from "@/components/LifecycleScroller";
import {Reveal} from "@/components/Reveal";
import {fairEntry, hero, launchFacts, pass, safety} from "@/lib/content";

export default function Home() {
  return (
    <main>
      {/* -- Hero -------------------------------------------------------------
          The curve is the subject, so it is the picture. Nothing is invented:
          the shape is the formula every launch on Puns actually follows. */}
      <section className="page grid items-center gap-14 pt-14 pb-20 md:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] md:gap-16 md:pt-16 lg:gap-24">
        <div>
          <h1 className="display-1 max-w-[16ch]">
            {hero.headline}{" "}
            <span className="text-ink-ghost">{hero.headlineQuiet}</span>
          </h1>

          <p className="lede mt-6">{hero.lede}</p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/app/create" className="btn btn-solid">
              Launch a token
            </Link>
            <Link to="/app" className="btn btn-quiet">
              See what is live
            </Link>
          </div>
        </div>

        <div className="curve-stage">
          <BondingCurve className="w-full" />
        </div>
      </section>

      {/* -- The shape of a launch ------------------------------------------- */}
      <section id="how" className="page pt-16 md:pt-24">
        <div className="grid gap-12 md:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] md:gap-20">
          <Reveal className="md:sticky md:top-28 md:self-start">
            <h2 className="display-2 max-w-[15ch]">
              Every launch is the same shape
            </h2>
            <p className="prose-tight mt-6">
              There is no configuration for a creator to hide an advantage in.
              The supply, the opening price and the graduation target are fixed
              before anyone can buy, so learning one launch teaches you all of
              them.
            </p>
          </Reveal>

          <dl>
            {launchFacts.map((fact) => (
              <div
                key={fact.label}
                className="row grid grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-1 py-5"
              >
                <dt className="text-ink">{fact.label}</dt>
                <dd className="text-right font-mono text-[0.9375rem] text-ink-deep tabular-nums">
                  {fact.value}
                </dd>
                <p className="col-span-2 max-w-[52ch] text-ink-soft">{fact.note}</p>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* -- Lifecycle -------------------------------------------------------
          Pinned: the steps take turns rather than stacking, because each one
          can only happen after the one above it. */}
      <section className="pt-24 md:pt-32">
        <LifecycleScroller />
      </section>

      {/* -- Generative band ---------------------------------------------------
          Every trajectory leaves the same origin. That is the claim the page
          has just finished making, drawn rather than restated. */}
      <div className="mt-8">
        <FieldBand caption="every launch leaves the same point" />
      </div>

      {/* -- Safety ----------------------------------------------------------- */}
      <section className="mt-4 border-y border-rule bg-paper-block">
        <div className="page grid gap-12 py-20 md:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] md:gap-20 md:py-28">
          <Reveal>
            <h2 className="display-2 max-w-[13ch]">{safety.title}</h2>
          </Reveal>

          <div>
            <p className="prose-tight text-[1rem] leading-relaxed">{safety.body}</p>

            <dl className="mt-10">
              {safety.points.map((point) => (
                <div key={point.label} className="row py-5">
                  <dt className="text-ink">{point.label}</dt>
                  <dd className="prose-tight mt-1">{point.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* -- Fair entry -------------------------------------------------------- */}
      <section id="fair-entry" className="page pt-28 md:pt-36">
        <div className="grid gap-12 md:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] md:gap-20">
          <Reveal className="md:sticky md:top-28 md:self-start">
            <h2 className="display-2 max-w-[12ch]">{fairEntry.title}</h2>
            <p className="prose-tight mt-6">{fairEntry.body}</p>
          </Reveal>

          <div>
            <table className="w-full">
              <caption className="meta pb-3 text-left">
                tax on a buy, by time since the launch opened
              </caption>
              <tbody>
                {fairEntry.decay.map((step) => (
                  <tr key={step.at} className="row">
                    <th
                      scope="row"
                      className="py-4 text-left font-mono text-[0.9375rem] font-normal text-ink-muted"
                    >
                      {step.at}
                    </th>
                    <td className="py-4 text-right font-mono text-[0.9375rem] text-ink-deep tabular-nums">
                      {step.tax}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="prose-tight mt-10 text-[1rem] leading-relaxed">
              {fairEntry.resolution}
            </p>
          </div>
        </div>
      </section>

      {/* -- Pass -------------------------------------------------------------- */}
      <section id="pass" className="page pt-28 md:pt-36">
        <Reveal>
          <h2 className="display-2 max-w-[10ch]">{pass.title}</h2>
          <p className="prose-tight mt-6 max-w-[58ch]">{pass.body}</p>
        </Reveal>

        <div className="mt-14 grid gap-px border-t border-rule md:grid-cols-2">
          {pass.tiers.map((tier) => (
            <div
              key={tier.name}
              className="border-b border-rule py-8 md:border-r md:pr-10 md:last:border-r-0 md:last:pr-0 md:last:pl-10"
            >
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="display-3">{tier.name}</h3>
                <p className="font-mono text-[0.9375rem] text-ink-deep">
                  {tier.price}
                </p>
              </div>

              <p className="meta mt-1 text-right">
                {tier.usd} · {tier.term}
              </p>

              <p className="mt-5 text-ink-muted">{tier.for}</p>

              <ul className="mt-5 space-y-2">
                {tier.includes.map((item) => (
                  <li key={item} className="text-ink-soft">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="meta mt-6">{pass.note}</p>

        <div className="mt-10">
          <Link to="/app/pass" className="btn btn-solid">
            Get a pass
          </Link>
        </div>
      </section>
    </main>
  );
}
