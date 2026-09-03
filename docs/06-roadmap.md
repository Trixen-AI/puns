# Roadmap

Seven phases. Each has an exit criterion that is a demonstrable fact, not a
feeling. Do not start a phase before the one above it has passed.

The ordering has one governing idea: **the SDK is the product's spine.**
Everything else consumes it. Building the UI first would mean building it twice.

---

## Phase 0, Scaffold

Repository skeleton, tooling, no features.

- pnpm workspace, Turborepo, shared tsconfig and eslint
- `apps/web` Next.js 15 with a blank page that builds
- `apps/indexer` worker that connects and logs the head block
- `packages/sdk`, `packages/db`, `packages/config`
- `packages/contracts` Foundry project
- CI: typecheck, lint, `forge test`
- `.env.example` with every variable the project will need

**Exit:** `pnpm build` and `forge test` both pass from a clean clone.

---

## Phase 1, SDK and the quote engine

The highest-risk, highest-value work. Do it first, while attention is full.

- `LAUNCH_CORE` addresses and typed ABIs
- **Resilient RPC client**: ordered fallbacks, retry with backoff and jitter,
  circuit breaker, multicall batching, per-endpoint health metrics
- Quote engine per [04-quote-engine.md](04-quote-engine.md)
- Transaction builders: `launchToken`, `launchAndBuy`, `buy`, `sell`, `claim`,
  `sweepFees`
- Typed event decoders for every event in [02-architecture.md](02-architecture.md)
- Fork test suite

**Exit:** the quote engine matches actual contract output **exactly, wei for
wei**, across at least six trade sizes including the clamped final buy, running
green in CI against an Anvil fork.

This is already proven achievable, the reference implementation matched on the
first attempt during specification. See [04-quote-engine.md](04-quote-engine.md).

---

## Phase 2, Indexer and database

- Drizzle schema: launches, trades, candles, holders, creators, fee events
- Backfill from the factory deployment block
- Live tail with a 64-block reorg window
- Candle aggregation at 1m / 5m / 1h / 1d
- Holder balance tracking derived from trades and transfers
- Redis pub/sub on every new trade
- Alerting on `AutoGraduationFailed`
- **Scheduled `canLaunch()` health check** (see the risk register)

**Exit:** the index reproduces every launch and every trade on chain 4663 from
genesis to head, and stays within two blocks of the head for one hour
unattended.

---

## Phase 3, Web, read-only

The whole interface, no wallet connection.

- Explore grid with sorting, filtering, live updates
- Token page: chart, holders, trade feed, graduation progress
- Creator profiles, analytics, search
- Full responsive design and the visual identity

**Exit:** every screen renders live mainnet data, and a stranger can understand
what a launch is without being told.

---

## Phase 4, Web, transacting

- Wallet connection with an add-chain flow for 4663
- Create form, including the atomic first buy and exemption list
- Trade panel with live quoting and slippage
- **Fair Entry**: countdown, per-wallet tax display, disabled-by-default buy,
  armed buy
- Portfolio and creator dashboard: claim, buyback toggle, fee recipient
- Complete-graduation button for stuck launches

Every write path is exercised against an Anvil fork before it touches mainnet.

**Exit:** a token is created, bought, sold and graduated end to end on a fork,
driven entirely through the UI, with no manual `cast` calls.

---

## Phase 5, Puns Pass

- `PunsPass.sol` written and fully tested per [05-puns-pass.md](05-puns-pass.md)
- Pricing decided from Phase 3 and 4 volume data, not from guesswork
- Pass benefits wired into the UI
- Verification, promotion and pro analytics behind the gate
- Data API with authentication

**Exit:** the invariant test passes, the contract's ETH balance is zero after
every transaction, and a Pass minted on a fork unlocks every gated surface.

---

## Phase 6, Mainnet

- Independent review of `PunsPass.sol` before it holds a single real payment
- Risk disclosure page, written plainly, stating that the launch mechanics are
  unaudited third-party code
- Monitoring, alerting, on-call runbook
- Public launch

**Exit:** live, with an on-call rotation and a rollback plan.

---

## Deferred, in the order they become worth doing

1. **Non-ETH pair assets.** Supported below us, not exposed in v1.
2. **Community takeover flows.** Real demand exists upstream; needs care.
3. **External token migration.** A large feature with its own risk surface.
4. **Meme Arena.** Head-to-head launch competitions with an on-chain prize
   pool. The strongest idea for a genuinely differentiated second product, and
   the reason `packages/contracts` exists as a workspace rather than a single
   file. Deliberately not in v1: it needs an audience before it needs a contract.
5. **Multi-chain.** Only if the launch core deploys elsewhere.

---

## Risk register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Whitelist is enabled upstream | **Launching stops entirely** | Scheduled `canLaunch()` check, alert, and a pre-written user-facing notice |
| Launch core exploit | Total user loss | Prominent unaudited disclosure; monitor upstream audit publication; kill switch on our create form |
| Factory owner changes parameters | Wrong values shown | Never cache global parameters across deployments |
| RPC unavailability | Site down | Multiple endpoints from day one; consider running our own node |
| Robinhood Chain stalls | No volume | Accepted concentration risk. Revisit if a second chain appears. |
| A new launch config appears | Every economic constant changes | Read `launchConfigCount()`; never hardcode config values |
| Imitation tokens | User loss, our reputation | Address-first UI, Pass verification, creator history |

The first row is the one to watch. Everything else has a workaround.
