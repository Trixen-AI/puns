/**
 * Pricing for the curve.
 *
 * The curve exposes no quote function, so every price a user sees is computed
 * here. This implementation was verified against live contract behaviour on a
 * fork: predicted and actual output matched to the wei on the first attempt.
 * Any change to it must be re-verified the same way.
 *
 * Rules that are not negotiable:
 *
 *   1. All arithmetic is bigint. A float here is money lost.
 *   2. Buys and sells are not symmetric. A buy charges fees on the way in,
 *      before the curve sees the amount. A sell is priced first, then fees come
 *      off the output.
 *   3. Price against getReserves(), which includes the virtual reserve. Never
 *      realQuoteReserve(), which is what the curve physically holds and gives a
 *      badly wrong price on a young curve.
 *   4. Snipe tax is per recipient. Quoting for the wrong address during the
 *      opening window is off by up to 99%.
 */

export const BPS = 10_000n;

const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

/** Constant product: output for a given input. */
export function amountOut(inAmount: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  if (inAmount <= 0n) return 0n;
  return (inAmount * reserveOut) / (reserveIn + inAmount);
}

/** Constant product: input required for an exact output. */
export function amountIn(outAmount: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  if (outAmount <= 0n || outAmount >= reserveOut) return 0n;
  return (outAmount * reserveIn) / (reserveOut - outAmount) + 1n;
}

export type CurveState = {
  quoteReserve: bigint;
  tokenReserve: bigint;
  sellableTokens: bigint;
  feeBps: bigint;
  creatorTaxBps: bigint;
  /** Raw value from currentSnipeTaxBps for the recipient. */
  snipeTaxBps: bigint;
};

export type BuyQuote = {
  tokensOut: bigint;
  spent: bigint;
  refund: bigint;
  fee: bigint;
  creatorTax: bigint;
  snipeTax: bigint;
  /** True when the buy fills the curve and the remainder is returned. */
  clamped: boolean;
  priceImpactBps: bigint;
};

export function quoteBuy(state: CurveState, quoteIn: bigint): BuyQuote {
  const {quoteReserve, tokenReserve, sellableTokens, feeBps, creatorTaxBps} = state;

  const empty: BuyQuote = {
    tokensOut: 0n,
    spent: 0n,
    refund: quoteIn,
    fee: 0n,
    creatorTax: 0n,
    snipeTax: 0n,
    clamped: false,
    priceImpactBps: 0n,
  };
  if (quoteIn <= 0n || tokenReserve <= 0n) return empty;

  // The contract caps the snipe tax so a trade always leaves at least 1%
  // through. Omitting this clamp quotes low during the opening window, and the
  // transaction then succeeds with a minimum the user never intended.
  let snipeBps = state.snipeTaxBps;
  if (snipeBps > 0n) {
    const maxSnipeBps = BPS - feeBps - creatorTaxBps - 100n;
    if (snipeBps > maxSnipeBps) snipeBps = maxSnipeBps;
  }

  let spent = quoteIn;
  const fee = (spent * feeBps) / BPS;
  const creatorTax = (spent * creatorTaxBps) / BPS;
  const snipeTax = (spent * snipeBps) / BPS;

  const net = spent - fee - creatorTax - snipeTax;
  let tokensOut = amountOut(net, quoteReserve, tokenReserve);
  let clamped = false;

  if (tokensOut > sellableTokens) {
    clamped = true;
    tokensOut = sellableTokens;
    const needed = amountIn(sellableTokens, quoteReserve, tokenReserve);
    const grossed = ceilDiv(needed * BPS, BPS - feeBps - creatorTaxBps - snipeBps);
    spent = grossed < quoteIn ? grossed : quoteIn;
  }

  // How far the trade moves the price, in basis points.
  const before = priceE18(quoteReserve, tokenReserve);
  const after = priceE18(quoteReserve + net, tokenReserve - tokensOut);
  const priceImpactBps = before > 0n ? ((after - before) * BPS) / before : 0n;

  return {
    tokensOut,
    spent,
    refund: quoteIn - spent,
    fee,
    creatorTax,
    snipeTax,
    clamped,
    priceImpactBps,
  };
}

export type SellQuote = {
  quoteOut: bigint;
  gross: bigint;
  fee: bigint;
  creatorTax: bigint;
};

export function quoteSell(state: CurveState, tokensIn: bigint): SellQuote {
  const {quoteReserve, tokenReserve, feeBps, creatorTaxBps} = state;
  if (tokensIn <= 0n) return {quoteOut: 0n, gross: 0n, fee: 0n, creatorTax: 0n};

  const gross = amountOut(tokensIn, tokenReserve, quoteReserve);
  const fee = (gross * feeBps) / BPS;
  const creatorTax = (gross * creatorTaxBps) / BPS;

  return {quoteOut: gross - fee - creatorTax, gross, fee, creatorTax};
}

/** Price in quote-wei per token-wei, scaled by 1e18. */
export function priceE18(quoteReserve: bigint, tokenReserve: bigint): bigint {
  if (tokenReserve === 0n) return 0n;
  return (quoteReserve * 10n ** 18n) / tokenReserve;
}

/**
 * What the whole supply is worth at the current price.
 *
 * More useful than a price per token: every launch has the same billion-token
 * supply, so market cap is directly comparable between them while a per-token
 * price in gwei is not something anyone holds an intuition for.
 *
 * Denominated in whatever the launch is paired against, which is usually ETH
 * but is not always.
 */
export function marketCap(priceE18: bigint, totalSupply: bigint): bigint {
  return (priceE18 * totalSupply) / 10n ** 18n;
}

/** Every launch mints exactly this. Fixed by the launch configuration. */
export const TOTAL_SUPPLY = 10n ** 27n;

/** The slippage floor to send with a trade. Never send zero. */
export function withSlippage(amount: bigint, slippageBps: bigint): bigint {
  return (amount * (BPS - slippageBps)) / BPS;
}

/**
 * How far a launch is from graduating.
 *
 * Uses the real reserve, not the virtual one. This is the one place where
 * realQuoteReserve is the correct input.
 */
export function graduationProgress(realQuoteReserve: bigint, threshold: bigint): number {
  if (threshold === 0n) return 0;
  const bps = (realQuoteReserve * BPS) / threshold;
  return Math.min(1, Number(bps) / 10_000);
}
