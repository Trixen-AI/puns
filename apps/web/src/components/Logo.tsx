/**
 * The Puns mark: a P whose counter holds a droplet.
 *
 * Authored as vector rather than shipped as an image so it stays sharp at any
 * size, weighs a few hundred bytes, and can invert for dark surfaces without a
 * second file. The same geometry backs the favicon.
 */

type Props = {
  /** Rendered size in pixels. */
  size?: number;
  /** "tile" draws the mark on its dark rounded square. "bare" draws the glyph alone. */
  variant?: "tile" | "bare";
  className?: string;
};

/** The P, drawn as one outline so the droplet can be punched through it. */
const P_PATH =
  "M26 18 L52 18 A24 24 0 0 1 52 66 L46 66 L46 82 L26 82 Z";

/** The droplet sitting in the bowl of the P. */
const DROP_PATH =
  "M50 25 C50 35.5 62 42.5 62 50.5 A12 12 0 0 1 38 50.5 C38 42.5 50 35.5 50 25 Z";

export function Logo({size = 28, variant = "tile", className}: Props) {
  const tile = variant === "tile";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Puns"
    >
      {tile && <rect width="100" height="100" rx="11" fill="var(--color-ink-deep)" />}
      <path d={P_PATH} fill={tile ? "var(--color-paper)" : "var(--color-ink-deep)"} />
      <path d={DROP_PATH} fill={tile ? "var(--color-ink-deep)" : "var(--color-paper)"} />
    </svg>
  );
}

/** Mark plus wordmark, for headers and the footer. */
export function Wordmark({size = 26}: {size?: number}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Logo size={size} />
      <span className="text-[1.0625rem] font-medium tracking-[-0.04em] text-ink-deep">
        Puns
      </span>
    </span>
  );
}
