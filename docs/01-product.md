# Product specification

## Positioning

Puns is a meme-first token launchpad on Robinhood Chain (chain id 4663).

Every launch is identical by construction: same supply, same starting price,
same graduation target. There is no configuration for a creator to hide
advantage in. What differs between launches is the meme and the community, and
that is the whole point.

The competitive surface is therefore **not** the launch mechanics, those are
fixed. It is the interface, the data, and the trust signals. That is where all
product effort goes.

## What every launch looks like

These are protocol-fixed and identical for all launches. Verified on chain.

| Property | Value |
| --- | --- |
| Total supply | 1,000,000,000 (18 decimals) |
| Sold on the curve | 714,285,714.29 (71.43%) |
| Reserved for the pool | 285,714,285.71 (28.57%) |
| Opening price | 1.68 ETH of virtual reserve against full supply |
| Graduation at | 4.2 ETH raised |
| Price at graduation | 12.25x the opening price |
| Fully diluted value at graduation | ~20.58 ETH |
| Trading fee | 1.00% |
| Creator tax | 0 - 10%, set once at creation, never raisable |
| Creation cost | 0.0005 ETH + gas |

Because the reserved share is fixed, **every launch graduates into a pool of
the same size at the same price**. A user who understands one launch
understands all of them. The UI should teach this once and then never make the
user think about it again.

## Screens

### 1. Explore (home)

The default surface. A live grid of launches.

- Sort: New, Almost graduated, Top volume 24h, Top gainers, Graduated
- Filter: curve only, graduated only, has socials, minimum raise
- Each card: image, name, symbol, price, 24h change, **graduation progress bar**,
  creator tax badge if non-zero, holder count, age
- Live updating without a page refresh
- Promoted row at the top, clearly labelled as promoted (Pass-gated, see below)

The graduation progress bar is the single most important element on the page.
It is the only number that is directly comparable across every launch.

### 2. Create

A single form. Target: under 60 seconds from arrival to signed transaction.

- Name, symbol, image upload (to IPFS), description
- Socials: X, Telegram, Discord, website, Farcaster
- Creator tax slider, 0 - 10%, with a plain-language explanation of what the
  user is choosing and a warning above 5% that it will deter buyers
- Buyback toggle, on by default, explained as funded from the creator's own fee
- **Optional first buy in the same transaction**, with the anti-sniper
  exemption list pre-filled with the creator's address
- **Exemption addresses are permanent and cannot be added later.** The form must
  say this next to the field, not in a tooltip. It is the single most
  irreversible decision on the page.
- Live preview of the token card exactly as it will appear on Explore

Economics are pinned at submit time so the terms cannot shift between preview
and confirmation.

### 3. Token page

- Price chart built from indexed trades, candles at 1m / 5m / 1h / 1d
- Graduation progress with the exact ETH remaining
- **Trade panel** with an exact quote before signing: tokens out, price impact,
  fee, creator tax, and the minimum-received slippage floor
- **Opening window banner** (see Fair Entry below)
- Holders table with distribution chart
- Live trade feed
- Creator panel: address, other launches by the same creator, fee recipient
- After graduation: pool address, locked-liquidity confirmation, link out

### 4. Portfolio

Holdings with live value, unrealised profit and loss per position, trade
history, and one-click sell back to the curve while it is still open.

### 5. Creator dashboard

- Launches created, with live stats
- **Claimable fee balance per asset**, and claim
- Buyback on/off toggle
- Change fee recipient address
- Buyback vesting progress: locked, vested, releasable, and release

### 6. Analytics

Chain-wide: launches per day, graduation rate, total volume, top creators by
graduated launches, top traders by realised profit.

### 7. Puns Pass

Purchase, benefits, and management.

## Fair Entry, our opening-window protection

The first five seconds of any launch carry a punitive tax on buys, starting at
99% and decaying to zero. It exists to make sniping unprofitable. It also
destroys ordinary users who click too fast, because nothing on chain warns them.

Puns makes this visible and safe. This is a free feature, not a Pass feature,
because letting a user lose 99% of a buy is not something to charge for.

- A **live countdown** on the token page during the window
- The trade panel reads `currentSnipeTaxBps` **for the connected wallet** and
  shows the loss in currency, not basis points: "Buying now costs you 0.024 ETH
  in opening tax. In 3s it costs you nothing."
- The buy button is **disabled by default** during the window, with an explicit
  "Buy anyway" override for users who know what they are doing
- **Arm buy**: schedule the transaction to be submitted the moment the tax
  reaches zero

## Puns Pass, premium

An on-chain pass. Ownership is checked by `balanceOf(address) > 0`, so
benefits are portable and verifiable without trusting our database.

Pass unlocks:

| Benefit | Detail |
| --- | --- |
| Verified badge | Displayed on the token card and page |
| Promoted placement | Rotating slot in the Explore promoted row |
| Custom presentation | Banner image, extended description, pinned announcement |
| Pro analytics | Holder cohorts, early-buyer tracking, creator history, wallet labels, entry-price distribution |
| Fair Entry Pro | Armed buys, price and graduation alerts, multi-launch watchlist |
| Data API | Authenticated read access to the Puns index |
| Early access | New features before general release |

Pass never gates: creating a token, buying, selling, claiming fees, or any
protocol-level action. Those are permissionless on chain and staying that way
is a product decision, not an oversight. **Puns is a paid interface, never a
toll booth.**

Full contract specification in [05-puns-pass.md](05-puns-pass.md).

## Explicitly out of scope for v1

- Mobile native applications. The web app is responsive; that is enough.
- Custom bonding curve parameters. Only one launch configuration exists on
  chain, so there is nothing to expose.

That is the entire list.

## Nothing is hidden

**Every capability the launch layer supports is surfaced in Puns.** If a
mechanic exists on chain, a user can reach it from our interface. We do not
withhold a feature because it is complex, because it carries extra risk, or
because it would be easier to ship without it.

That commitment covers, explicitly:

| Capability | How Puns surfaces it |
| --- | --- |
| **Custom pair assets** | Launch priced in any approved asset, not just ETH. The create form lists approved assets and states plainly that a non-ETH pairing carries that asset's risk on top of the launch's own. |
| **Community takeovers (CTO)** | Both routes. A creator can hand fees to a community wallet directly, and proposed takeovers are shown with their full public timeline: three days before it can be carried out, three more before it expires. |
| **Migration of external tokens** | Deposit windows, epoch rates, mandate progress, and claim with its linear vest. Surfaced for any migration on chain, whether or not it originated with us. |
| **Buyback and vesting** | Toggle, live buyback activity, and the five-year vest with locked, vested, releasable, and a release action. |
| **Creator controls** | Fee recipient transfer and buyback toggle. We also show what a creator *cannot* change, because that list is the actual safety story. |
| **Fee sweeping and claiming** | Both pre- and post-graduation sweeps, per-asset balances, and claims. |
| **Manual graduation** | Anyone can push a stuck launch through, so anyone can do it from Puns. |
| **Whitelist state** | If launching ever becomes restricted, we display that state and say so plainly rather than showing a create button that fails. |
| **Rescued launches** | Permanently and prominently marked. |

Where a capability is genuinely dangerous, the answer is a clear warning next to
it, never removal. A user who cannot reach a feature in Puns will reach it
somewhere with a worse interface and no warning at all.

Ordering across build phases is in [06-roadmap.md](06-roadmap.md). Ordering is
not scope: everything above ships.
