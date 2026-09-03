import {useMemo, useState} from "react";
import {envStr} from "@/lib/env";
import {Link} from "react-router-dom";
import {Progress} from "@/components/app/Progress";
import {Empty, Failed, Loading} from "@/components/app/States";
import {useLaunches, type Launch} from "@/hooks/useLaunches";
import {contracts} from "@/lib/chain";
import {bps, compact, eth, usd} from "@/lib/format";
import {useEthPrice} from "@/hooks/useEthPrice";
import {marketCap, TOTAL_SUPPLY} from "@/lib/quote";

/**
 * Every launch, read straight from the chain.
 *
 * Sorting is the whole interface here. Graduation progress is the one figure
 * comparable across every launch, so it leads, and the default order is the one
 * a launchpad is actually for: what appeared most recently.
 */

const PAGE_SIZE = 25;

type SortKey = "new" | "closest" | "raised";

const sorts: {key: SortKey; label: string; compare: (a: Launch, b: Launch) => number}[] = [
  {key: "new", label: "Newest", compare: (a, b) => Number(b.blockNumber - a.blockNumber)},
  {key: "closest", label: "Closest to graduating", compare: (a, b) => b.progress - a.progress},
  {
    key: "raised",
    label: "Most raised",
    compare: (a, b) => Number(b.realQuoteReserve - a.realQuoteReserve),
  },
];

export default function Explore() {
  const [page, setPage] = useState(0);
  const {data, isLoading, isError, error, refetch} = useLaunches(page, PAGE_SIZE);
  const logsUnavailable = (error as Error | null)?.message === "LOGS_UNAVAILABLE";
  const ethUsd = useEthPrice();
  const [sort, setSort] = useState<SortKey>("new");
  const [onlyLive, setOnlyLive] = useState(false);

  const rows = useMemo(() => {
    const launches = data?.launches ?? [];
    const compare = sorts.find((s) => s.key === sort)?.compare ?? sorts[0].compare;
    return launches.filter((l) => (onlyLive ? !l.graduated : true)).sort(compare);
  }, [data, sort, onlyLive]);

  const total = data?.total ?? 0;
  const hasMore = data?.hasMore ?? false;
  const from = page * PAGE_SIZE;

  // Changing what the list contains should not leave the reader stranded on a
  // page that no longer exists.
  const reset =
    <T,>(setter: (v: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(0);
    };

  if (!contracts.factory) {
    return (
      <div className="page py-20">
        <Failed body="Puns is not finished setting up on this address yet. Nothing is wrong with your wallet." />
      </div>
    );
  }

  return (
    <div className="page py-12">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="display-2">Every launch, live</h1>
          <p className="prose-tight mt-3">
            Every launch opens at the same price and graduates once 4.2 ETH has
            come in. The bar on the right is how close each one is.
          </p>
        </div>

        <Link to="/app/create" className="btn btn-solid">
          Launch a token
        </Link>
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-rule pb-4">
        <div className="flex items-center gap-4">
          {sorts.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => reset(setSort)(s.key)}
              className={`transition-colors ${
                sort === s.key ? "text-ink" : "text-ink-soft hover:text-ink"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <label className="ml-auto flex cursor-pointer items-center gap-2 text-ink-soft">
          <input
            type="checkbox"
            checked={onlyLive}
            onChange={(e) => reset(setOnlyLive)(e.target.checked)}
            className="accent-ink-deep"
          />
          Still on the curve
        </label>
      </div>

      {isLoading && <Loading />}

      {isError && !isLoading && (
        <Failed
          body={
            logsUnavailable
              ? "The chain will not answer requests for launch history right now. Trading and creating still work, so this is the list that is missing, not the app."
              : "The chain did not answer. It drops requests often, so this is usually worth one retry."
          }
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && rows.length === 0 && (
        <Empty
          title="Be the first"
          body={
            onlyLive
              ? "Every launch found has already graduated. Clear the filter to see them, or start something new."
              : "Nothing has launched in the window this app watches. Blocks here arrive ten times a second, so that window is short by design."
          }
          action={
            <Link to="/app/create" className="btn btn-solid">
              Launch a token
            </Link>
          }
        />
      )}

      {rows.length > 0 && (
        <>
          <ul>
            {rows.map((launch) => (
              <LaunchRow key={launch.token} launch={launch} ethUsd={ethUsd} />
            ))}
          </ul>

          {(page > 0 || hasMore) && (
            <nav className="mt-8 flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => setPage(page - 1)}
                disabled={page === 0}
                className="btn btn-quiet disabled:opacity-40"
              >
                Previous
              </button>

              <p className="meta">
                {from + 1} to {from + rows.length}
                {total ? ` of ${total}` : ""}
              </p>

              <button
                type="button"
                onClick={() => setPage(page + 1)}
                disabled={!hasMore}
                className="btn btn-quiet disabled:opacity-40"
              >
                Next
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function LaunchRow({launch, ethUsd}: {launch: Launch; ethUsd?: number}) {
  const cap = marketCap(launch.priceE18, TOTAL_SUPPLY);
  // Only an ETH-paired launch has a dollar value we can honestly state.
  const isEth = launch.pairToken?.toLowerCase() === "0x0000000000000000000000000000000000000000";
  const dollars = isEth ? usd(cap, ethUsd) : undefined;

  return (
    <li className="row transition-colors hover:bg-paper-soft">
      <Link
        to={`/app/t/${launch.token}`}
        className="grid items-center gap-x-8 gap-y-4 py-6 md:grid-cols-[minmax(0,1fr)_9rem_9rem_12rem]"
      >
        <div className="flex min-w-0 items-center gap-4">
          <Avatar logo={launch.logo} symbol={launch.symbol} />

          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <p className="truncate text-ink">{launch.name}</p>
              <p className="meta shrink-0">{launch.symbol}</p>
              {launch.graduated && (
                <span className="meta shrink-0" style={{color: "var(--color-signal)"}}>
                  graduated
                </span>
              )}
            </div>

            {/* The address is the only identifier that cannot be imitated, so
                it stays visible rather than hidden behind the name. */}
            <p className="meta truncate">{launch.token}</p>
          </div>
        </div>

        <div>
          <p className="meta">market cap</p>
          <p className="font-mono text-[0.9375rem] text-ink-deep">
            {dollars ?? `${compact(Number(eth(cap)))} ${isEth ? "ETH" : ""}`.trim()}
          </p>
        </div>

        <div>
          <p className="meta">raised</p>
          <p className="font-mono text-[0.9375rem] text-ink-deep">
            {eth(launch.realQuoteReserve)} ETH
          </p>
        </div>

        <div className="flex items-end gap-4">
          <div className="min-w-0 flex-1">
            <Progress value={launch.progress} label="to graduation" />
          </div>
          {launch.creatorTaxBps > 0n && (
            <p className="meta shrink-0" title="Creator fee, set at launch and never raisable">
              +{bps(launch.creatorTaxBps)}
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}

function Avatar({logo, symbol}: {logo: string; symbol: string}) {
  const gateway = envStr(import.meta.env.VITE_IPFS_GATEWAY, "https://gateway.pinata.cloud/ipfs/");
  const src = logo?.startsWith("ipfs://") ? `${gateway}${logo.slice(7)}` : logo;

  if (!src) {
    return (
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[2px] bg-paper-block">
        <span className="meta">{symbol.slice(0, 2)}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className="h-10 w-10 shrink-0 rounded-[2px] bg-paper-block object-cover"
      onError={(e) => {
        e.currentTarget.style.display = "none";
      }}
    />
  );
}
