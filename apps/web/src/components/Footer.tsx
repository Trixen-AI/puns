import {Link} from "react-router-dom";
import {Logo} from "@/components/Logo";
import {EXPLORER, PUNS_PASS_ADDRESS, site} from "@/lib/content";

const columns = [
  {
    heading: "Product",
    links: [
      {label: "Explore launches", to: "/app"},
      {label: "Create a token", to: "/app/create"},
      {label: "Puns Pass", to: "/app/pass"},
    ],
  },
  {
    heading: "Understand",
    links: [
      {label: "How a launch works", to: "/docs"},
      {label: "The curve", to: "/docs#curve"},
      {label: "Fair entry", to: "/docs#fair-entry"},
    ],
  },
];

/** X, drawn rather than pulled from an icon set. */
function XMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="mt-32 border-t border-rule bg-paper-soft">
      <div className="page py-16">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo size={30} />
            <p className="prose-tight mt-4 max-w-[34ch]">
              A launchpad for meme tokens, where every launch has the same shape
              and the liquidity cannot be taken back.
            </p>

            <a
              href={site.x}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex items-center gap-2 text-ink-soft transition-colors hover:text-ink"
            >
              <XMark />
              {site.xHandle}
            </a>
          </div>

          {columns.map((col) => (
            <div key={col.heading}>
              <p className="mb-3 text-ink">{col.heading}</p>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.to}
                      className="text-ink-soft transition-colors hover:text-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-wrap items-end justify-between gap-6 border-t border-rule pt-8">
          <div>
            <p className="meta mb-1.5">Puns Pass on Robinhood Chain</p>
            <a
              href={`${EXPLORER}/address/${PUNS_PASS_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs break-all text-ink-muted underline decoration-rule underline-offset-4 transition-colors hover:text-ink"
            >
              {PUNS_PASS_ADDRESS}
            </a>
          </div>

          <p className="meta">{site.domain}</p>
        </div>
      </div>
    </footer>
  );
}
