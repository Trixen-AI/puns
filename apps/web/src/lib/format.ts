import {formatUnits} from "viem";

/**
 * Display helpers.
 *
 * Formatting happens at the edge, never in the maths. Everything upstream of
 * here stays bigint.
 */

/** ETH with a sensible number of places for the size of the number. */
export function eth(wei: bigint, maxDecimals?: number): string {
  const value = Number(formatUnits(wei, 18));
  if (value === 0) return "0";
  const places =
    maxDecimals ?? (value >= 1000 ? 2 : value >= 1 ? 4 : value >= 0.001 ? 5 : 7);
  return value.toLocaleString("en-US", {maximumFractionDigits: places});
}

/** Token amounts, where thousands separators matter more than precision. */
export function tokens(amount: bigint, decimals = 18): string {
  const value = Number(formatUnits(amount, decimals));
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString("en-US", {maximumFractionDigits: 2});
}

/** Price per token, quoted in gwei because that is the scale launches live at. */
export function gwei(priceE18: bigint): string {
  const value = Number(priceE18) / 1e9;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: value < 1 ? 4 : 2,
  });
}

/**
 * Money at a glance: 4.2K rather than 4,231.87.
 *
 * Market caps span several orders of magnitude across a list of launches, and
 * full precision makes them harder to compare, not easier.
 */
export function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  if (abs >= 1) return value.toFixed(2);
  return value.toFixed(4);
}

/** Compact dollars. Returns undefined when the rate is not known yet. */
export function usd(wei: bigint, ethUsd?: number): string | undefined {
  if (!ethUsd) return undefined;
  return `$${compact((Number(formatUnits(wei, 18)) * ethUsd))}`;
}

export function percent(fraction: number, places = 1): string {
  return `${(fraction * 100).toFixed(places)}%`;
}

export function bps(value: bigint): string {
  return `${(Number(value) / 100).toFixed(2)}%`;
}

/** Relative time, in the shortest form that is still unambiguous. */
export function since(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.floor(seconds))}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}
