# Architecture

## Decision: monorepo

pnpm workspaces + Turborepo.

The deciding factor is the quote engine. Pricing must be computed identically
in three places, the trade panel, the indexer's historical backfill, and the
contract tests, and a divergence between them is a class of bug that shows a
user one price and gives them another. One package, imported everywhere,
removes the possibility.

```
puns/
  apps/
    web/                Next.js 15, App Router
    indexer/            Long-running Node worker
  packages/
    sdk/                @puns/sdk
    db/                 @puns/db
    contracts/          Foundry
    config/             @puns/config
  docs/
```

## Stack

| Layer | Choice | Reason |
| --- | --- | --- |
| Web | Next.js 15 (App Router), React 19 | Server components for the read-heavy Explore grid, client islands for trading |
| Styling | Tailwind CSS v4 + shadcn/ui | Fast, and meme aesthetics need custom work anyway |
| Chain reads/writes | viem + wagmi v2 | viem is what the quote engine is written against |
| Wallet | RainbowKit | Custom chain support is straightforward, and users will need to add chain 4663 |
| Charts | lightweight-charts | Candles from indexed trades, no dependency on a chart vendor |
| Database | Postgres | Time-series trade data with heavy aggregate queries |
| ORM | Drizzle | Typed schema shared between web and indexer, no code generation step |
| Cache / realtime | Redis | Hot quote state, pub/sub fan-out to websocket clients |
| Indexer | Custom viem worker | See below |
| Contracts | Foundry | Fork testing against live chain state is the core workflow |
| Media | IPFS via Pinata | Token images must outlive us |

### Why a custom indexer instead of Ponder or a hosted service

No hosted indexer supports chain 4663. That settles it. A custom worker is
roughly 400 lines and gives us control over the reorg policy and the RPC
fallback behaviour, both of which we need (see below).

## Data flow

```
                        Robinhood Chain (4663)
                                 |
                    +------------+------------+
                    |                         |
              apps/indexer               apps/web
           (worker, writes)           (reads + user txs)
                    |                    |        |
                 Postgres  <-------------+        |
                    |                             |
                  Redis  <---------- pub/sub -----+
                    |
              websocket -> browser
```

- **Writes always go direct.** A user transaction is built in the browser and
  signed by their wallet. The backend is never in the path of a trade. If our
  servers are down, trading still works via any other interface.
- **Reads come from Postgres**, not from RPC. Explore must not make 200 RPC
  calls to render a grid.
- **Live prices come from Redis over websocket**, pushed by the indexer.
- **The trade panel reads reserves direct from RPC** immediately before quoting.
  A stale reserve is a wrong quote, and a wrong quote is a failed transaction.

## Indexer design

Tail the chain, decode, write.

Events, in order of importance:

| Event | Source | Purpose |
| --- | --- | --- |
| `TokenLaunched` | factory | New launch. Triggers metadata fetch. |
| `CurveBuy` / `CurveSell` | curve | Every trade. Candles, volume, holders, P&L. |
| `CurveBuyRefunded` | curve | Final clamped buy returned unspent quote. |
| `CurveCompleted` | curve | Curve closed. |
| `LaunchSwept` | factory | Phase 1. |
| `PoolGraduated` | factory | Phase 2. Switch routing to the pool. |
| `FeesSwept` / `PoolFeesSwept` | curve / hook | Creator claimable balances. |
| `BuybackLocked` / `Locked` / `Released` | curve / vault | Buyback and vesting. |
| `CreatorFeeRecipientUpdated` | factory | Payout address changed. |
| `AutoGraduationFailed` | curve | **Alert.** A launch needs a manual push. |
| `Credited` / `Claimed` (+ token variants) | escrow | Fee ledger. |

Reorg policy: track the last 64 blocks as unconfirmed and re-derive on a
divergent parent hash. Robinhood Chain is an Arbitrum Orbit rollup, so deep
reorgs are not expected, but "not expected" is not a reason to have no policy.

### RPC resilience is a day-one requirement

Measured on 2026-09-03 against `rpc.mainnet.chain.robinhood.com`: roughly
**30% of calls failed intermittently** with transport errors. Not rate
limiting, plain connection failures under a light manual load.

Therefore, in `@puns/sdk`, non-negotiable:

- An ordered list of RPC endpoints with automatic failover
- Retry with exponential backoff and jitter, 3 attempts per endpoint
- A circuit breaker that sidelines an endpoint after repeated failures
- Request batching via multicall wherever more than one read is needed
- A health metric per endpoint, exported and alertable

Any code path that calls an RPC directly instead of going through the SDK
client is a bug.

## Environments

| Environment | Chain | Purpose |
| --- | --- | --- |
| Local | Anvil fork of 4663 | All development. Real contracts, real state, free ETH. |
| Staging | Mainnet 4663, read-only | Indexer and UI against live data, writes disabled |
| Production | Mainnet 4663 | Live |

Testnet 46630 is deliberately not used: the launch contracts have not been
confirmed deployed there, and a fork of mainnet gives us real state, real
tokens and real liquidity for free. Anvil forking is verified working, see
[07-runbook.md](07-runbook.md).

## Package boundaries

**`@puns/sdk`**, the only module that knows a chain exists.
Addresses, ABIs, the resilient client, the quote engine, launch/trade
transaction builders, typed event decoders. No React. No database. Fully
unit-testable, and its quote functions are tested against fork state.

**`@puns/db`**, Drizzle schema and migrations, plus query helpers. Imported
by both `web` and `indexer`. No business logic.

**`packages/contracts`**, Foundry. `PunsPass.sol` and future Puns contracts.
Tests fork mainnet 4663. Deployment artifacts are exported into `@puns/sdk` by
a build step, so an address is never hand-copied.

**`apps/web`**, presentation and user transaction construction only. Never
talks to an RPC except through `@puns/sdk`.

**`apps/indexer`**, writes. Never serves HTTP except a health endpoint.
