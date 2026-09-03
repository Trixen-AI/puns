import {useMemo} from "react";
import {Link} from "react-router-dom";
import {useAccount, useReadContracts} from "wagmi";
import {tokenAbi} from "@/lib/abi";
import {explorerAddress} from "@/lib/chain";
import {eth, gwei, tokens} from "@/lib/format";
import {useLaunches} from "@/hooks/useLaunches";
import {usePassStatus} from "@/hooks/usePass";
import {Empty, Loading} from "@/components/app/States";

/**
 * What the connected wallet holds.
 *
 * Balances are read for every known launch in a single multicall and the empty
 * ones are dropped. There is no server keeping a list of who owns what, which
 * means this page can only see as far back as the app's log window reaches.
 */
export default function Portfolio() {
  const {address, isConnected} = useAccount();
  // The portfolio wants everything the source can offer, not one page of it.
  const {data: page, isLoading} = useLaunches(0, 100);
  const launches = page?.launches;
  const passStatus = usePassStatus();

  const {data: balances, isLoading: loadingBalances} = useReadContracts({
    query: {enabled: Boolean(address && launches?.length), staleTime: 20_000},
    contracts:
      address && launches
        ? launches.map((l) => ({
            address: l.token,
            abi: tokenAbi,
            functionName: "balanceOf" as const,
            args: [address] as const,
          }))
        : [],
  });

  const held = useMemo(() => {
    if (!launches || !balances) return [];
    return launches
      .map((launch, i) => ({
        launch,
        balance: (balances[i]?.result as bigint | undefined) ?? 0n,
      }))
      .filter((row) => row.balance > 0n)
      .map((row) => ({
        ...row,
        // Value at the curve's current price, before any fee on the way out.
        value: (row.balance * row.launch.priceE18) / 10n ** 18n,
      }))
      .sort((a, b) => Number(b.value - a.value));
  }, [launches, balances]);

  if (!isConnected) {
    return (
      <div className="page py-12">
        <h1 className="display-2">What you hold</h1>
        <Empty
          title="Connect a wallet"
          body="Use the button in the header. Once connected this shows your positions, what they are worth at the current curve price, and the passes you hold."
        />
      </div>
    );
  }

  const busy = isLoading || loadingBalances;
  const total = held.reduce((sum, row) => sum + row.value, 0n);

  return (
    <div className="page py-12">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="display-2">What you hold</h1>
          <p className="prose-tight mt-3">
            Valued at each curve's current price. Selling costs a fee on the way
            out, so what you receive will be a little less.
          </p>
        </div>

        {!busy && held.length > 0 && (
          <div className="text-right">
            <p className="meta">total</p>
            <p className="font-mono text-[1.125rem] text-ink-deep">{eth(total)} ETH</p>
          </div>
        )}
      </div>

      <section className="mt-10">
        <p className="meta mb-3">passes</p>
        <div className="row flex flex-wrap items-center gap-x-8 gap-y-2 py-4">
          <PassChip label="Creator" held={passStatus.creator} />
          <PassChip label="Pro" held={passStatus.pro} />
          {!passStatus.creator && !passStatus.pro && (
            <Link to="/app/pass" className="ml-auto text-ink-soft hover:text-ink">
              Get a pass
            </Link>
          )}
        </div>
      </section>

      <section className="mt-12">
        <p className="meta mb-3">positions</p>

        {busy && <Loading rows={4} />}

        {!busy && held.length === 0 && (
          <Empty
            title="No positions"
            body="Nothing held in any launch this app can see. Buy something, or launch your own."
            action={
              <Link to="/app" className="btn btn-solid">
                See what is live
              </Link>
            }
          />
        )}

        {!busy && held.length > 0 && (
          <ul>
            {held.map(({launch, balance, value}) => (
              <li key={launch.token} className="row">
                <div className="grid items-center gap-x-8 gap-y-3 py-6 md:grid-cols-[minmax(0,1fr)_10rem_10rem]">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <p className="truncate text-ink">{launch.name}</p>
                      <p className="meta shrink-0">{launch.symbol}</p>
                    </div>
                    <a
                      href={explorerAddress(launch.token)}
                      target="_blank"
                      rel="noreferrer"
                      className="meta truncate underline decoration-rule underline-offset-4 hover:text-ink"
                    >
                      {launch.token}
                    </a>
                  </div>

                  <div>
                    <p className="meta">holding</p>
                    <p className="font-mono text-[0.9375rem] text-ink-deep">
                      {tokens(balance)}
                    </p>
                  </div>

                  <div>
                    <p className="meta">worth · {gwei(launch.priceE18)} gwei</p>
                    <p className="font-mono text-[0.9375rem] text-ink-deep">
                      {eth(value)} ETH
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PassChip({label, held}: {label: string; held: boolean}) {
  return (
    <span className="flex items-center gap-2">
      <span
        className="inline-block h-1.5 w-1.5"
        style={{background: held ? "var(--color-signal)" : "var(--color-ink-ghost)"}}
      />
      <span className={held ? "text-ink" : "text-ink-soft"}>
        {label}
        {held ? "" : ", not held"}
      </span>
    </span>
  );
}
