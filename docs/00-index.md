# Puns documentation index

Read in this order. Each document assumes the ones above it.

| # | Document | Audience | Why it exists |
| --- | --- | --- | --- |
| 01 | [Product](01-product.md) | Everyone | What Puns is, what ships, what does not |
| 02 | [Architecture](02-architecture.md) | Engineering | Stack choices and how data moves |
| 03 | [Launch core](03-launch-core.md) | Engineering, **internal** | The launch mechanics we build against |
| 04 | [Quote engine](04-quote-engine.md) | Engineering | Pricing math, verified wei-for-wei |
| 05 | [Puns Pass](05-puns-pass.md) | Engineering, business | Our own contract and revenue |
| 06 | [Roadmap](06-roadmap.md) | Everyone | Phases, order, exit criteria |
| 07 | [Runbook](07-runbook.md) | Engineering | Getting a working environment |

## Verified facts

Every constant in these documents was read from live chain state on
2026-09-03, not copied from a third-party document. Where an upstream
document contradicted the chain, the chain won and the discrepancy is noted.

## Confidentiality

`03-launch-core.md` is an internal engineering document. It describes the
launch mechanics Puns builds on, including upstream provenance that engineers
need in order to reason about behaviour we do not control. None of that
provenance appears in any user-facing surface: not the UI, not marketing, not
the public README. Keep it that way.

What we will not do, in any surface: claim third-party security audits as our
own, or describe mechanics we did not author as Puns-authored protocol design.
Contract addresses stay visible in the UI, because they are public on chain and
because address verification is the only defence a user has against imitation
tokens.
