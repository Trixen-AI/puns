/**
 * Reading configuration.
 *
 * An unset variable in a .env file is an empty string, not undefined, so `??`
 * does not fall back the way it looks like it should. `VITE_INDEXER_URL=` with
 * nothing after it produced "" rather than the default path, and the app then
 * fetched the page it was already on and tried to parse HTML as JSON.
 *
 * Every read goes through here so that cannot happen again.
 */

export function envStr(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export function envNum(value: string | undefined, fallback: number): number {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function envBig(value: string | undefined, fallback: bigint): bigint {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  try {
    return BigInt(trimmed);
  } catch {
    return fallback;
  }
}

/** Undefined when unset, so callers can tell "not configured" from a value. */
export function envOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
