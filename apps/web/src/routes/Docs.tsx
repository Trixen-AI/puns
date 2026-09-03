import {useEffect, useState} from "react";
import {EXPLORER, PUNS_PASS_ADDRESS} from "@/lib/content";

/**
 * Documentation.
 *
 * Written for someone deciding whether to trade, not for someone integrating.
 * Every number is one that was read from chain state, so the page can be
 * checked rather than believed.
 */

const sections = [
  {id: "start", label: "What Puns is"},
  {id: "launch", label: "The launch"},
  {id: "curve", label: "The curve"},
  {id: "graduation", label: "Graduation"},
  {id: "fees", label: "Fees"},
  {id: "fair-entry", label: "Fair entry"},
  {id: "pass", label: "Puns Pass"},
  {id: "contracts", label: "Contracts"},
];

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-rule pt-10 pb-4 first:border-t-0 first:pt-0">
      <h2 className="display-3 mb-5">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function P({children}: {children: React.ReactNode}) {
  return <p className="prose-tight">{children}</p>;
}

function Facts({rows}: {rows: [string, string][]}) {
  return (
    <dl className="mt-6">
      {rows.map(([label, value]) => (
        <div key={label} className="row flex items-baseline justify-between gap-6 py-3.5">
          <dt className="text-ink">{label}</dt>
          <dd className="text-right font-mono text-[0.9375rem] text-ink-deep tabular-nums">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function Docs() {
  const [active, setActive] = useState(sections[0].id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      {rootMargin: "-88px 0px -70% 0px"},
    );

    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <main className="page py-16 md:py-24">
      <header className="mb-14 max-w-[38rem]">
        <h1 className="display-1">Docs</h1>
        <p className="lede mt-5">
          How a launch on Puns actually works, in the order it happens. Every
          figure below was read from the chain, so you can check it rather than
          take it on trust.
        </p>
      </header>

      <div className="grid gap-12 md:grid-cols-[minmax(0,1fr)_minmax(0,14rem)] md:gap-16">
        <div className="order-2 max-w-[46rem] md:order-1">
          <Section id="start" title="What Puns is">
            <P>
              Puns is a launchpad for meme tokens on Robinhood Chain. Anyone can
              create one, and the terms are identical every time: the same
              supply, the same opening price, and the same target at which the
              launch leaves its curve and becomes a pool.
            </P>
            <P>
              There is no presale, no allocation reserved for a team, and no
              point at which liquidity can be withdrawn once a launch has
              graduated.
            </P>
          </Section>

          <Section id="launch" title="The launch">
            <P>
              Creating a token mints its entire supply straight to a bonding
              curve. Nothing is held back for anyone, and the creator starts with
              no more tokens than a stranger who buys a second later.
            </P>
            <P>
              From that moment the curve both sells and buys. Price rises as
              people buy and falls as they sell, and you can sell back to the
              curve at any time while it is still open. The single exception is
              after it sells out, when the curve closes and its balances go into
              creating the pool.
            </P>
          </Section>

          <Section id="curve" title="The curve">
            <P>
              The curve holds the whole supply against a virtual reserve of 1.68
              ETH. Price is that reserve divided by the tokens the curve still
              holds, so it climbs as tokens leave and falls as they return.
            </P>
            <P>
              Because the reserved share is fixed, the arithmetic is the same for
              every launch. A launch opens at 1.68 gwei per token and reaches
              20.58 gwei when the curve sells out, which is a rise of exactly
              12.25 times. No launch on Puns can open cheaper or graduate higher
              than another.
            </P>
            <Facts
              rows={[
                ["Total supply", "1,000,000,000"],
                ["Sold on the curve", "714,285,714"],
                ["Held back for the pool", "285,714,285"],
                ["Opening price", "1.68 gwei"],
                ["Price at graduation", "20.58 gwei"],
                ["Rise", "12.25×"],
              ]}
            />
          </Section>

          <Section id="graduation" title="Graduation">
            <P>
              Once 4.2 ETH has entered the curve it has sold everything it was
              going to sell. The ETH it collected and the tokens it held back
              become a Uniswap pool, and that pool position is locked
              permanently.
            </P>
            <P>
              This normally happens inside the buy that fills the curve, with no
              action needed from anyone. If it fails, anyone at all can push it
              through, including you. It does not need the creator.
            </P>
            <P>
              A buy larger than what is left is not rejected. You receive what
              remains, you are charged only for that, and the rest is returned in
              the same transaction.
            </P>
          </Section>

          <Section id="fees" title="Fees">
            <P>
              Trading costs 1% on both buys and sells, charged in ETH rather than
              in the token. A creator may add a fee of their own, up to 10%, and
              that figure is set when the token is created and can never be
              raised afterwards. Check it before you trade.
            </P>
            <P>
              A creator can point their earnings at a different wallet and can
              turn buybacks on or off. Those two settings are the only things
              about a live launch that anyone can change.
            </P>
          </Section>

          <Section id="fair-entry" title="Fair entry">
            <P>
              A launch is at its most vulnerable in its first seconds, when a bot
              can buy the opening before anyone has seen the token exists. To
              make that unprofitable, buys in the opening window are taxed
              heavily: 99% at the first instant, falling to nothing across five
              seconds. Selling is never taxed by it.
            </P>
            <P>
              Nothing on chain warns you about this, which is why Puns reads the
              tax for your own wallet and shows it in ETH before you sign. The
              buy button stays off until the window closes, and you can schedule
              a buy for the moment it does.
            </P>
            <Facts
              rows={[
                ["At the first instant", "99%"],
                ["After one second", "≈25%"],
                ["After two seconds", "≈3%"],
                ["After five seconds", "0%"],
              ]}
            />
          </Section>

          <Section id="pass" title="Puns Pass">
            <P>
              Puns Pass is an on-chain pass that unlocks presentation and
              analysis. Creator is a lifetime pass that covers every launch from
              your wallet. Pro is a monthly pass for people trading.
            </P>
            <P>
              A pass never affects what you can do on chain. Creating, buying,
              selling and claiming work without one and always will.
            </P>
            <Facts
              rows={[
                ["Creator", "0.004 ETH, lifetime"],
                ["Pro", "0.0032 ETH, 30 days"],
              ]}
            />
          </Section>

          <Section id="contracts" title="Contracts">
            <P>
              Names and images are not unique, and anyone can create a launch
              that imitates another. The token address is the only identifier
              that cannot be copied, so check it.
            </P>
            <div className="row mt-6 py-4">
              <p className="meta mb-1.5">Puns Pass</p>
              <a
                href={`${EXPLORER}/address/${PUNS_PASS_ADDRESS}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs break-all text-ink-muted underline decoration-rule underline-offset-4 transition-colors hover:text-ink"
              >
                {PUNS_PASS_ADDRESS}
              </a>
            </div>
          </Section>
        </div>

        <nav className="order-1 md:order-2 md:sticky md:top-24 md:self-start">
          <p className="meta mb-3">on this page</p>
          <ul className="space-y-1.5">
            {sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className={`transition-colors ${
                    active === s.id ? "text-ink" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </main>
  );
}
