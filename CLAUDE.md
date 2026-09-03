# Puns, repository guide

A meme-first token launchpad on Robinhood Chain (chain id 4663).

**Status: contracts live, application not started.** `PunsPass` is deployed and
configured on mainnet 4663 (see below). No web or indexer code exists yet.
Start at [docs/00-index.md](docs/00-index.md), then
[docs/06-roadmap.md](docs/06-roadmap.md).

## Language policy

**Everything committed to this repository is written in English.** Code,
comments, identifiers, documentation, commit messages, UI copy, error strings,
test names. No exceptions.

Conversation with the maintainer happens in Indonesian; the repository does not.

## Non-negotiable rules

1. **The chain is the source of truth, not documentation.** Upstream
   documentation for the launch core is stale and has already been proven wrong
   in at least one material way. Verify with `cast` before writing code against
   any claim.

2. **All on-chain arithmetic is `bigint`.** Never `Number`, never a float, never
   a decimal library, anywhere in a pricing path.

3. **Price with `getReserves()`, never `realQuoteReserve()`.** `getReserves()`
   includes the 1.68 ETH virtual reserve and is the correct pricing input.
   `realQuoteReserve()` is only for the graduation progress bar.

4. **Never cache upstream global parameters across deployments.**
   `launchFee()`, `maxCreatorTaxBps()`, `launchConfigCount()` and config values
   are owner-mutable. Read them live.

5. **Every RPC call goes through one shared, resilient client.** The public
   endpoint fails roughly 30% of the time under light load and went fully
   offline during development. Retry, fallback and a circuit breaker belong in
   that single client, not scattered through feature code. There is deliberately
   no separate SDK package: this client lives inside the web app.

6. **The quote engine is verified by exact equality**, never a tolerance. It is
   deterministic integer arithmetic. A test that needs `approximately` is
   testing a broken implementation.

7. **Puns Pass gates presentation, never participation.** Creating, buying,
   selling and claiming must always work without a Pass.

## Attribution boundary

The launch mechanics come from an existing permissionless protocol deployed on
chain 4663. Internally this is called **"the launch core"**; the provenance is
recorded once, in [docs/03-launch-core.md](docs/03-launch-core.md), because
engineers need it.

It appears in **no user-facing surface**, not the UI, not marketing, not the
public README. Two hard limits that hold regardless: never present upstream
security audits as ours or as complete, and never describe mechanics we did not
author as protocol design authored by Puns.

Contract addresses stay visible in the UI. They are public on chain, and address
verification is the only defence a user has against imitation tokens.

## Verified constants (chain 4663, read 2026-09-03)

```
FACTORY              0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e
launchFee()          500000000000000        0.0005 ETH
maxCreatorTaxBps()   1000                   10%
launchConfigCount()  1                      only config 0 exists
canLaunch(any)       true                   launching is open
feeBps               100                    1.00%

totalSupply          1e27                   1,000,000,000 @ 18 dp
reservedTokens       285714285714285714285714285    2/7
sellableTokens       714285714285714285714285715    5/7
virtual reserve      1.68e18 ETH
graduationThreshold  4.2e18 ETH
                     -> every launch rises exactly 12.25x to graduation

opening tax          9900 bps at t=0, decaying to 0 over 5s, buys only
launchToken gas      3,529,499  (verified on a fork)
```

Full address list and ABI surface: [docs/03-launch-core.md](docs/03-launch-core.md).

## Deployed contracts (chain 4663)

```
PunsPass   0x6d050DB66e3317C810Cfe52AA8A0b52b6fA28231   deployed 2026-09-04
owner      0xE1D78A6f24380cF7caDBB163ce2a598821631B67   (currently the deployer key)
treasury   0xf0099f6D992DfbBF87343317D929AE98b9472C13
pricer     0xE1D78A6f24380cF7caDBB163ce2a598821631B67   (same as owner, by choice)
```

Verified on Blockscout (partial match; `bytecodeHash = none` means there is no
metadata hash to compare, which is expected). Verification cannot be automated
here - Blockscout is behind a Cloudflare challenge - so the reusable package
lives in `packages/contracts/verification/` for future redeployments.

Creator 0.004 ETH lifetime ($10 peg), Pro 0.0032 ETH / 30 days ($8 peg).
Record in `packages/contracts/deployments/4663.json`. Never hand-copy an
address out of this file into source; read it from the deployment artifact.

Domain: **punsfun.app**.

## Development

All development runs against an Anvil fork of mainnet. It gives real contracts,
real launches and real liquidity, with free ETH, and chain id is preserved.

```bash
node tools/rpc-proxy.mjs                     # or use RPC_MAINNET_ALCHEMY directly
anvil --fork-url $RPC_MAINNET_ALCHEMY --fork-block-number <head-50> --port 8545 --silent
```

**Use `RPC_MAINNET_ALCHEMY` for anything that matters.** The public endpoint
went fully offline during development and Foundry intermittently rejects its
TLS; the Alchemy endpoint measured 10/10 successful probes and works with
`cast` directly.

Verified working commands for launching, buying and reading state are in
[docs/07-runbook.md](docs/07-runbook.md). Copy from there rather than
reconstructing them, the nested-tuple encoding for `launchToken` is easy to
get wrong.

Testnet 46630 is deliberately unused: the launch contracts are not confirmed
deployed there, and a mainnet fork is strictly better for development.

## The one risk that ends the project

`NotWhitelisted` exists in the factory ABI. Launching is permissionless today,
but the factory owner can restrict it. If that happens, Puns cannot create
tokens at all. The indexer runs a scheduled `canLaunch()` check for exactly
this reason. Do not remove it.
