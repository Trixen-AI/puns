# Quote engine

The curve exposes **no quote function**. Every price shown to a user is computed
by us. A wrong quote is a failed transaction, or worse, a filled transaction at
a price the user did not agree to.

This document is the specification for `@puns/sdk/quote`. It is verified
correct against live contract behaviour, wei for wei.

## Verification

On an Anvil fork of chain 4663, a fresh curve with `feeBps = 100`,
`creatorTaxBps = 250`, reserves `1.68e18 / 1e27`, buying `0.1 ETH` from an
exempt address:

```
PREDICTED tokensOut   54320292710385589642555586
ACTUAL    balanceOf   54320292710385589642555586
```

Exact match. Any future change to this file must be re-verified the same way.
The fork test is the specification; this prose is a description of it.

## Rules

1. **All arithmetic is `bigint`.** Never `Number`, never a decimal library. A
   floating-point rounding error here is money.
2. **Buys and sells are not symmetric.** A buy charges fees on the way *in*,
   before the curve sees the amount. A sell is priced *first*, then fees come
   off the output.
3. **Price against `getReserves()`**, which includes the virtual reserve.
   Never `realQuoteReserve()`.
4. **Snipe tax is per-recipient.** Always pass the actual recipient address to
   `currentSnipeTaxBps`. Quoting for the wrong address during the opening
   window is off by up to 99%.
5. **Read reserves immediately before quoting.** Never quote from indexed data.

## Primitives

```ts
const BPS = 10_000n;

const ceilDiv = (a: bigint, b: bigint): bigint => (a + b - 1n) / b;

/** Constant product: tokens received for an input amount. */
function amountOut(inAmount: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  return (inAmount * reserveOut) / (reserveIn + inAmount);
}

/** Constant product: input required for an exact output amount. */
function amountIn(outAmount: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  return (outAmount * reserveIn) / (reserveOut - outAmount) + 1n;
}
```

## Buy

```ts
interface BuyQuote {
  tokensOut: bigint;      // tokens the user receives
  spent: bigint;          // quote actually charged
  refund: bigint;         // returned in the same transaction (clamped final buy)
  fee: bigint;            // protocol trading fee
  creatorTax: bigint;     // creator tax
  snipeTax: bigint;       // opening-window tax
  effectivePrice: bigint; // spent / tokensOut, scaled
  priceImpactBps: bigint;
  clamped: boolean;       // true when the buy filled the curve
}

async function quoteBuy(
  curve: Address, quoteIn: bigint, recipient: Address
): Promise<BuyQuote> {
  const [reserves, sellable, feeBps, creatorTaxBps, rawSnipeBps] =
    await multicallCurve(curve, recipient);
  const [quoteReserve, tokenReserve] = reserves;

  // The contract caps the snipe tax so total deductions always leave 1% through.
  let snipeBps = rawSnipeBps;
  if (snipeBps > 0n) {
    const maxSnipeBps = BPS - feeBps - creatorTaxBps - 100n;
    if (snipeBps > maxSnipeBps) snipeBps = maxSnipeBps;
  }

  let spent = quoteIn;
  const fee        = (spent * feeBps) / BPS;
  const creatorTax = (spent * creatorTaxBps) / BPS;
  const snipeTax   = (spent * snipeBps) / BPS;

  let tokensOut = amountOut(spent - fee - creatorTax - snipeTax, quoteReserve, tokenReserve);

  // Clamped final buy: the curve sells only what remains and refunds the rest.
  let clamped = false;
  if (tokensOut > sellable) {
    clamped = true;
    tokensOut = sellable;
    const net     = amountIn(sellable, quoteReserve, tokenReserve);
    const grossed = ceilDiv(net * BPS, BPS - feeBps - creatorTaxBps - snipeBps);
    spent = grossed < quoteIn ? grossed : quoteIn;
  }

  return { tokensOut, spent, refund: quoteIn - spent, fee, creatorTax, snipeTax, clamped, ... };
}
```

> The `maxSnipeBps` clamp mirrors contract behaviour. Omitting it produces a
> quote that is too low during the opening window, and the transaction then
> succeeds with a `minTokensOut` the user never intended. Do not remove it.

## Sell

```ts
async function quoteSell(curve: Address, tokensIn: bigint): Promise<SellQuote> {
  const [[quoteReserve, tokenReserve], feeBps, creatorTaxBps] = await multicallCurve(curve);

  const gross      = amountOut(tokensIn, tokenReserve, quoteReserve);
  const fee        = (gross * feeBps) / BPS;
  const creatorTax = (gross * creatorTaxBps) / BPS;

  return { quoteOut: gross - fee - creatorTax, gross, fee, creatorTax };
}
```

Selling reverts once the curve has sold out. Check `readyToGraduate()` or
`graduated()` and route to the pool instead of letting the user sign a
transaction that cannot succeed.

## Slippage

`minTokensOut` / `minQuoteOut` are the user's only protection.

```ts
const minTokensOut = (quote.tokensOut * (BPS - slippageBps)) / BPS;
```

- Default tolerance: **1%** (`100` bps)
- **During the opening window, default to 5%**, the tax decays between quote
  and inclusion, so the user receives *more* than quoted, but reserves also move
  fast
- Never send `0`. It is a blank cheque to a sandwich.
- Show the minimum received in the trade panel, in tokens, before signing

## Graduation progress

Distinct from pricing. Uses the real reserve, not the virtual one.

```ts
const progress = Number((realQuoteReserve * 10_000n) / graduationThreshold) / 10_000;
const remaining = graduationThreshold - realQuoteReserve;   // ETH still needed
```

With config 0, `graduationThreshold` is always `4.2e18`.

## Price

```ts
// price in quote-wei per token-wei, scaled by 1e18
const priceE18 = (quoteReserve * 10n ** 18n) / tokenReserve;
```

Reference points for config 0:

| Moment | Price | FDV |
| --- | --- | --- |
| Open | 1.68 gwei / token | 1.68 ETH |
| Graduation | 20.58 gwei / token | 20.58 ETH |

Exactly 12.25x, identical for every launch.

## Test plan

`packages/sdk/test/quote.fork.test.ts`, run against an Anvil fork:

1. Launch a token with a known `creatorTaxBps`
2. For each of `{0.001, 0.01, 0.1, 1, 4.2, 10}` ETH:
   - compute `quoteBuy`
   - execute the buy
   - assert `balanceOf` delta equals `tokensOut` **exactly**
3. Assert the clamped case: buy more than remains, assert the refund matches
   and that `CurveBuyRefunded` was emitted
4. Assert the sell path round-trips within the expected fee loss
5. Assert `snipeTax` during the opening window for a non-exempt recipient
6. Assert an exempt recipient pays zero snipe tax

**Exact equality, not approximate.** The math is deterministic integer
arithmetic. If a test needs a tolerance, the implementation is wrong.
