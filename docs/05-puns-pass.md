# Puns Pass

Puns Pass is our own contract and our only revenue.

## Why an on-chain pass rather than a database subscription

1. **It is verifiable.** A verified badge backed by a token anyone can check is
   worth something. A verified badge backed by our database is worth whatever
   trust we have earned, which at launch is none.
2. **It survives us.** If Puns disappears, a Pass holder still owns the asset.
3. **It is composable.** Other interfaces, bots and communities can gate on it
   without asking our permission or our API key.
4. **It is transferable.** A secondary market for Passes prices our product for
   us, and gives buyers an exit that a subscription never has.

The alternative, off-chain gating with wallet sign-in, is faster to build and
was considered. It was rejected because the verified badge is the core benefit,
and a badge with no on-chain backing is a claim rather than a proof.

## Design principles

**Puns Pass gates presentation, never participation.**

It must never be possible for Pass ownership to affect: creating a token,
buying, selling, claiming fees, or any protocol-level action. Those are
permissionless on chain, and any interface that gated them would simply be
routed around. Pass buys a better interface and a stronger signal, nothing more.

**The contract must never hold user funds.** Payment in, mint out, proceeds
forwarded to the treasury. No escrow, no yield, no staking. The smallest
possible surface for a contract that will be unaudited at launch.

## Interface

`packages/contracts/src/PunsPass.sol`, ERC-721, Solidity 0.8.28, OpenZeppelin
base. This is the deployed interface, not a sketch.

```solidity
enum Tier { None, Creator, Pro }

struct PassTerms {
    uint256 price;      // wei; 0 means the tier is not for sale
    uint64  duration;   // seconds; 0 mints a lifetime pass
    uint32  usdCents;   // the USD peg this tier tracks; informational only
    uint64  repeggedAt; // when price last moved
}

// --- Buying -----------------------------------------------------------------
function mint(Tier tier, address to) external payable returns (uint256 tokenId);
function renew(uint256 tokenId) external payable;

// --- Views the app reads ----------------------------------------------------
function isActive(uint256 tokenId) external view returns (bool);
function hasTier(address holder, Tier tier) external view returns (bool);
function hasActivePass(address holder) external view returns (bool);
function tiersOf(address holder) external view returns (bool creator, bool pro);
function expiryOf(address holder, Tier tier) external view returns (uint64);
function termsOf(Tier tier)
    external view returns (uint256 price, uint64 duration, uint32 usdCents, uint64 repeggedAt);
function totalMinted() external view returns (uint256);

// --- Owner ------------------------------------------------------------------
function setTerms(Tier tier, uint256 price, uint64 duration, uint32 usdCents) external;
function setTreasury(address newTreasury) external;
function setBaseUri(string calldata baseUri) external;
function setPricer(address newPricer) external;
function grant(Tier tier, address to, uint64 expiry) external returns (uint256 tokenId);
function transferOwnership(address newOwner) external;
function acceptOwnership() external;
function withdrawPendingTreasury() external;

// --- Owner or pricer --------------------------------------------------------
function repeg(Tier tier, uint256 newPrice) external;
uint256 public constant MAX_REPEG_DEVIATION_BPS = 5_000;
```

> `hasTier` scans the holder's tokens rather than using `ERC721Enumerable`.
> Enumerable adds storage writes to every mint and transfer to serve reads that
> only ever happen off chain. Holders own a handful of passes, and every caller
> of this is a view.

### Tiers

| Tier | Intended holder | Benefits |
| --- | --- | --- |
| **Creator** | Someone launching a token | Verified badge, custom banner, extended description, pinned announcement, promoted rotation |
| **Pro** | Someone trading | Pro analytics, Fair Entry Pro (armed buys, alerts, watchlist), data API, early access |

A holder may own both. `tierOfHolder` returns the highest active tier; the
frontend should check tiers independently rather than assuming a hierarchy,
because Creator and Pro benefits do not nest.

### Pricing

| Tier | Price | Term | Reasoning |
| --- | --- | --- | --- |
| **Creator** | **$10** | Lifetime | Attached to a one-time act: launching a token. One purchase covers every launch that wallet ever makes. Priced to be an impulse, not a decision. |
| **Pro** | **$8** | 30 days | Analytics and trading tools are an ongoing service, and premium is the only revenue Puns has. A lifetime Pro pass would mean no recurring income at all. |

At ETH $2,499 these convert to round numbers, which is why they were chosen:

```
Creator   0.0040 ETH   4000000000000000 wei
Pro       0.0032 ETH   3200000000000000 wei
```

Pro's $8 is easy to justify to a trader: one avoided opening-window tax on a
0.05 ETH buy saves around $124, more than a year of the subscription.

Creator being lifetime also avoids an ugly failure mode. If a Creator pass
lapsed, the banner and extended description on every token that creator ever
launched would vanish from pages that are still live. Lifetime removes the
problem rather than managing it.

### Keeping the USD peg without an oracle

Prices are stored in wei, so a fixed ETH price drifts in USD terms.

Chainlink is available on Robinhood Chain, and reading a feed inside `mint` was
considered and **rejected**. A stale or reverting feed would halt pass sales
entirely, a real availability failure traded for a cosmetic benefit. Nobody
cares whether a pass costs $9.60 or $10.40; everybody cares if they cannot buy
one.

Instead:

- The contract records `usdCents` per tier, the price it is *meant* to track.
  Informational only, never read for pricing, but it makes the peg publicly
  auditable and lets the re-peg job be stateless.
- `repeg(tier, newPrice)` moves a price and nothing else.
- `tools/repeg.mjs` reads the peg from the chain, compares it to the market,
  and corrects when drift exceeds a threshold (default 3%).

### The `pricer` role

`repeg` is callable by the owner **or** the `pricer`, an address whose only
power is moving prices.

This exists so a job running on a schedule never holds the owner key. A
compromised pricer can disrupt sales; it cannot take value, redirect the
treasury, issue passes, change a term length, or transfer ownership. Moves are
additionally bounded by `MAX_REPEG_DEVIATION_BPS` (50% per call), so even a
disruption is limited. A correction larger than that requires the owner.

Verified on chain: a pricer attempting `setTreasury`, `grant`,
`transferOwnership`, `setTerms`, `withdrawPendingTreasury`, or a repeg beyond
the band is rejected in every case.

### Verification is not for sale

A $10 badge that anyone can buy signals "paid", not "trustworthy", a scammer
running an imitation token can afford $10 as easily as an honest creator can.
So the two are kept apart:

- **Creator Pass ($10)** buys *presentation*: banner, extended description,
  pinned announcement, promoted rotation. Its badge means "uses Puns".
- **Verification** stays a manual review, issued through `grant()`. It cannot
  be purchased at any price.

The contract already supports both; the distinction is in how the UI names and
displays them.

## Security requirements

Non-negotiable, because this contract will be unaudited when it launches:

- **No user funds held.** Forward `msg.value` to the treasury in the same call.
- Use a **pull-payment fallback** if a direct forward fails, so a treasury
  contract that reverts cannot brick minting.
- `receive()` and `fallback()` **revert**. The contract must be impossible to
  send ETH to accidentally.
- Reentrancy guard on `mint` and `renew` even with no external calls, because
  ERC-721 `_safeMint` calls into the recipient.
- No `delegatecall`, no proxy, no upgradeability. If we need a change, we
  deploy `PunsPassV2` and migrate. Upgradeable contracts are how unaudited
  projects lose everything.
- Two-step ownership transfer.
- Emit an event for every state change, including admin actions. The indexer
  reads Pass state from events, not from polling.
- **Overpayment refunds the difference.** Never keep it.

## Test requirements

`packages/contracts/test/PunsPass.t.sol`, Foundry, forking chain 4663:

- Mint at each tier, with exact payment, over-payment, and under-payment
- Renewal extends from `max(now, currentExpiry)`, never from `now` alone
- `isActive` is exact at the expiry boundary, one second either side
- `tierOfHolder` with zero, one, and multiple passes, active and expired
- Transfer moves the benefit with the token
- `grant` cannot be called by a non-owner
- Direct ETH transfer reverts
- Treasury forwarding failure does not brick minting
- Fuzz `mint` value against every tier price
- Invariant: **contract ETH balance is always zero after any transaction**

## Frontend integration

```ts
// packages/sdk/src/pass.ts
export async function getPassStatus(holder: Address): Promise<{
  creator: boolean;
  pro: boolean;
  expiresAt: bigint | null;
}>;
```

Read once per session, cache in Redis for 60 seconds, and **re-check on chain
before any action that grants a permanent benefit** such as marking a token
verified. Never trust the cache for a write.

## What Puns Pass will not become

- A token with an emission schedule
- A governance token
- A staking product
- A revenue-share instrument

Each of those turns a product into a security-shaped question we are not
equipped to answer. Puns Pass is a paid product key. That is the whole design.

---

## Deployment

Live on Robinhood Chain (4663) since 2026-09-04.

```
PunsPass   0x6d050DB66e3317C810Cfe52AA8A0b52b6fA28231
owner      0xE1D78A6f24380cF7caDBB163ce2a598821631B67
treasury   0xf0099f6D992DfbBF87343317D929AE98b9472C13
pricer     0xE1D78A6f24380cF7caDBB163ce2a598821631B67   (same as owner)
baseUri    https://punsfun.app/pass/
```

Explorer: https://robinscan.io/address/0x6d050DB66e3317C810Cfe52AA8A0b52b6fA28231

Verified from chain immediately after deployment:

| | |
| --- | --- |
| Runtime size | 14,405 bytes |
| Gas used | 3,463,104 across 3 transactions |
| Creator | 0.004 ETH, lifetime, pegged to $10.00 |
| Pro | 0.0032 ETH, 30 days, pegged to $8.00 |
| Contract balance | 0 wei |
| `nextTokenId` | 1, nothing minted yet |

Full record, including transaction hashes, in
`packages/contracts/deployments/4663.json`.

**The pricer is set to the owner wallet**, at the maintainer's explicit
direction after the trade-off was laid out. A dedicated wallet was created and
briefly held the role; that transaction revoked it.

The consequence is worth stating plainly, because it is the one thing the role
existed to prevent: the scheduled re-peg job runs with the owner key. If the
machine running it is compromised, the attacker gets more than the ability to
move prices, they can redirect the treasury, issue passes and take ownership.
Nothing is at risk today because the contract never holds value and no passes
have been sold, but this should be revisited before the pass is promoted.

Switching back later costs one transaction: `setPricer(<dedicated wallet>)`
and a new key in `PRICER_PRIVATE_KEY`.

Confirmed running live against mainnet:

```
Creator  peg $10.00 | now 0.00400000 ETH ($10.00) | drift 1 bps | no action
Pro      peg $8.00  | now 0.00320000 ETH ($8.00)  | drift 1 bps | no action
```

### Verification

**Verified on Blockscout, 2026-09-04.** Source, ABI and constructor arguments
are public at
https://robinhoodchain.blockscout.com/address/0x6d050DB66e3317C810Cfe52AA8A0b52b6fA28231

It shows as a **partial match**, not a full one. That is expected and not a
defect: `foundry.toml` sets `bytecodeHash = none`, so the deployed bytecode
carries no metadata hash for the verifier to compare against. Everything
functional matches, 15 sources, `v0.8.28+commit.7893614a`, cancun, optimizer
at 1,000,000 runs, and the three constructor arguments decode correctly.

Verification could not be automated: Blockscout sits behind a Cloudflare
managed challenge that answers every non-browser request with an interactive
JavaScript page, so `forge verify-contract` receives HTML instead of JSON. The
reusable package is kept in `packages/contracts/verification/` for any future
redeployment.

### Open items

- **The re-peg job holds the owner key.** See above. One transaction reverses
  it whenever a dedicated wallet is preferred.
- **The owner is the deployer key**, which lives in `.env`. Acceptable while
  nothing is at stake, but it should move to a wallet that is not on a
  development machine before the pass is promoted publicly. `transferOwnership`
  is two-step; the receiving wallet needs gas to call `acceptOwnership`.
- **No independent review yet.** Tiers are open for sale, so the contract can
  now take real payments. It never holds them, every payment forwards to the
  treasury in the same transaction, but a review before promoting the pass is
  still the right call.
