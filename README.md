# Puns

A meme-first token launchpad on Robinhood Chain.

Anyone can create a token in under a minute. It trades on a bonding curve from
the moment it exists, and once the curve sells out it graduates into a Uniswap
v4 pool with permanently locked liquidity. No presale, no team allocation, no
liquidity that can be pulled.

Puns adds the layer the raw mechanics do not give you: a meme-native interface,
real-time quoting that tells you exactly what a trade costs before you sign it,
opening-window protection, and **Puns Pass**, an on-chain pass that unlocks
verification, promotion and pro analytics for the people who take their launches
seriously.

## Status

Pre-development. Architecture and specifications are complete and verified
against live chain state. Implementation has not started.

## Repository layout

```
apps/
  web/          Next.js 15 app - the launchpad interface
  indexer/      Chain event indexer - writes to Postgres
packages/
  sdk/          @puns/sdk - addresses, ABIs, quote engine, types
  db/           @puns/db - Drizzle schema shared by web and indexer
  contracts/    Foundry project - PunsPass and future Puns contracts
  config/       Shared tsconfig / eslint / prettier
docs/           Specifications. Start with docs/00-index.md
```

## Documentation

| Document | What it covers |
| --- | --- |
| [docs/00-index.md](docs/00-index.md) | Reading order and document map |
| [docs/01-product.md](docs/01-product.md) | Product scope, screens, Puns Pass tiers |
| [docs/02-architecture.md](docs/02-architecture.md) | Stack, monorepo, data flow |
| [docs/03-launch-core.md](docs/03-launch-core.md) | Launch core integration spec (internal) |
| [docs/04-quote-engine.md](docs/04-quote-engine.md) | Exact pricing math, verified on chain |
| [docs/05-puns-pass.md](docs/05-puns-pass.md) | PunsPass contract specification |
| [docs/06-roadmap.md](docs/06-roadmap.md) | Build phases and exit criteria |
| [docs/07-runbook.md](docs/07-runbook.md) | Local environment, fork testing, RPC |

## Language policy

Everything committed to this repository is written in English. Code, comments,
documentation, commit messages, UI copy and error strings, English only.
