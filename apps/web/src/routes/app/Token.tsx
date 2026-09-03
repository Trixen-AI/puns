import {useMemo, useState} from "react";
import {Link, useParams} from "react-router-dom";
import {useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract} from "wagmi";
import {formatUnits, parseEther, parseUnits, type Address} from "viem";
import {curveAbi, tokenAbi} from "@/lib/abi";
import {explorerAddress, explorerTx} from "@/lib/chain";
import {bps, compact, eth, gwei, tokens as fmtTokens, usd} from "@/lib/format";
import {useEthPrice} from "@/hooks/useEthPrice";
import {
  graduationProgress,
  marketCap,
  priceE18,
  quoteBuy,
  quoteSell,
  TOTAL_SUPPLY,
  withSlippage,
} from "@/lib/quote";
import {useCurve} from "@/hooks/useCurve";
import {useLaunch} from "@/hooks/useLaunches";
import {Progress} from "@/components/app/Progress";
import {Failed, Loading} from "@/components/app/States";
import {FairEntry} from "@/components/app/FairEntry";

/**
 * One launch, and the panel for trading it.
 *
 * Every figure in the panel is computed before the user signs: what they
 * receive, what the fees take, what the opening tax would cost them, and the
 * floor below which the trade reverts. The curve gives no quote of its own, so
 * showing an accurate one is the whole job.
 */

const DEFAULT_SLIPPAGE_BPS = 100n;
const OPENING_SLIPPAGE_BPS = 500n;

export default function Token() {
  const {address: tokenAddress} = useParams<{address: string}>();
  const token = tokenAddress as Address | undefined;

  const {data: launch, isLoading: loadingLaunch} = useLaunch(token);
  const ethUsd = useEthPrice();
  const curve = useCurve(launch?.curve);

  if (loadingLaunch) {
    return (
      <div className="page py-12">
        <Loading rows={3} />
      </div>
    );
  }

  if (!launch) {
    return (
      <div className="page py-20">
        <Failed body="No launch exists at that address. Names can be copied but an address cannot, so check it against the one you were given." />
        <div className="mt-6 flex justify-center">
          <Link to="/app" className="btn btn-quiet">
            Back to Explore
          </Link>
        </div>
      </div>
    );
  }

  const progress = graduationProgress(curve.realQuoteReserve, curve.graduationThreshold);
  const price = curve.state
    ? priceE18(curve.state.quoteReserve, curve.state.tokenReserve)
    : launch.priceE18;

  return (
    <div className="page py-12">
      <Link to="/app" className="meta hover:text-ink">
        back to explore
      </Link>

      <header className="mt-6 flex flex-wrap items-start justify-between gap-8">
        <div className="min-w-0">
          <div className="flex items-baseline gap-3">
            <h1 className="display-2">{launch.name}</h1>
            <p className="meta">{launch.symbol}</p>
          </div>

          <a
            href={explorerAddress(launch.token)}
            target="_blank"
            rel="noreferrer"
            className="meta mt-2 block break-all underline decoration-rule underline-offset-4 hover:text-ink"
          >
            {launch.token}
          </a>

          {launch.description && (
            <p className="prose-tight mt-4">{launch.description}</p>
          )}
        </div>

        <div className="text-right">
          <p className="meta">market cap</p>
          <p className="font-mono text-[1.375rem] text-ink-deep">
            {(() => {
              const cap = marketCap(price, TOTAL_SUPPLY);
              const isEth =
                launch.pairToken?.toLowerCase() === "0x0000000000000000000000000000000000000000";
              return isEth
                ? (usd(cap, ethUsd) ?? `${compact(Number(eth(cap)))} ETH`)
                : compact(Number(eth(cap)));
            })()}
          </p>
          <p className="meta mt-1">{gwei(price)} gwei per token</p>
        </div>
      </header>

      {curve.state && curve.state.snipeTaxBps > 0n && (
        <div className="mt-8">
          <FairEntry taxBps={curve.state.snipeTaxBps} />
        </div>
      )}

      <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-16">
        <section>
          <div className="row py-6">
            <Progress value={progress} label="to graduation" />
            <p className="prose-tight mt-3 text-[0.8125rem]">
              {curve.graduated
                ? "This launch graduated. It trades in a pool now, and the liquidity is locked."
                : `${eth(curve.realQuoteReserve)} of ${eth(curve.graduationThreshold)} ETH raised. At the threshold the curve closes and becomes a locked pool.`}
            </p>
          </div>

          <dl>
            {[
              ["Trading fee", curve.state ? bps(curve.state.feeBps) : "…"],
              [
                "Creator fee",
                curve.state
                  ? curve.state.creatorTaxBps > 0n
                    ? `${bps(curve.state.creatorTaxBps)}, set at launch and permanent`
                    : "None"
                  : "…",
              ],
              [
                "Still on the curve",
                curve.state ? `${fmtTokens(curve.state.sellableTokens)} tokens` : "…",
              ],
              ["Creator", launch.deployer],
            ].map(([label, value]) => (
              <div key={label} className="row flex flex-wrap items-baseline justify-between gap-4 py-4">
                <dt className="text-ink">{label}</dt>
                <dd className="font-mono text-[0.8125rem] break-all text-ink-muted">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <TradePanel launch={launch} curve={curve} />
        </aside>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

type PanelProps = {
  launch: NonNullable<ReturnType<typeof useLaunch>["data"]>;
  curve: ReturnType<typeof useCurve>;
};

function TradePanel({launch, curve}: PanelProps) {
  const {address, isConnected} = useAccount();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [override, setOverride] = useState(false);

  const {writeContract, data: hash, isPending, error, reset} = useWriteContract();
  const receipt = useWaitForTransactionReceipt({hash});

  const {data: balance} = useReadContract({
    address: launch.token,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {enabled: Boolean(address), refetchInterval: 15_000},
  });

  const held = (balance as bigint | undefined) ?? 0n;
  const windowOpen = (curve.state?.snipeTaxBps ?? 0n) > 0n;

  const parsed = useMemo(() => {
    const trimmed = amount.trim();
    if (!trimmed) return 0n;
    try {
      return side === "buy" ? parseEther(trimmed) : parseUnits(trimmed, 18);
    } catch {
      return 0n;
    }
  }, [amount, side]);

  const buy = useMemo(
    () => (curve.state && side === "buy" ? quoteBuy(curve.state, parsed) : undefined),
    [curve.state, parsed, side],
  );
  const sell = useMemo(
    () => (curve.state && side === "sell" ? quoteSell(curve.state, parsed) : undefined),
    [curve.state, parsed, side],
  );

  const slippage = windowOpen ? OPENING_SLIPPAGE_BPS : DEFAULT_SLIPPAGE_BPS;
  const minOut = buy
    ? withSlippage(buy.tokensOut, slippage)
    : sell
      ? withSlippage(sell.quoteOut, slippage)
      : 0n;

  // During the opening window the buy is held back unless the person says
  // otherwise. Losing most of a trade to a tax nobody mentioned is not a
  // decision anyone makes on purpose.
  const blocked = side === "buy" && windowOpen && !override;
  const canSubmit =
    isConnected &&
    parsed > 0n &&
    !blocked &&
    !curve.graduated &&
    (side === "buy" || parsed <= held);

  const submit = () => {
    if (!address || !canSubmit) return;

    if (side === "buy") {
      writeContract({
        address: launch.curve,
        abi: curveAbi,
        functionName: "buy",
        args: [parsed, minOut, address],
        value: parsed,
      });
    } else {
      writeContract({
        address: launch.curve,
        abi: curveAbi,
        functionName: "sell",
        args: [parsed, minOut, address],
      });
    }
  };

  if (curve.graduated) {
    return (
      <div className="border-y border-rule py-8">
        <p className="display-3">Graduated</p>
        <p className="prose-tight mt-3">
          The curve has closed. This token trades in a Uniswap pool now, and its
          liquidity is locked permanently.
        </p>
      </div>
    );
  }

  return (
    <div className="border-y border-rule py-6">
      <div className="flex gap-6">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setSide(s);
              setAmount("");
            }}
            className={`pb-1 transition-colors ${
              side === s
                ? "border-b border-ink text-ink"
                : "border-b border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            {s === "buy" ? "Buy" : "Sell"}
          </button>
        ))}
      </div>

      <div className="mt-6">
        <div className="flex items-center gap-3">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            placeholder="0.0"
            className="input font-mono text-[1.125rem]"
          />
          <span className="meta shrink-0">{side === "buy" ? "ETH" : launch.symbol}</span>
        </div>

        {side === "sell" && (
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="meta">you hold {fmtTokens(held)}</p>
            <button
              type="button"
              onClick={() => setAmount(formatUnits(held, 18))}
              className="meta underline underline-offset-4 hover:text-ink"
            >
              max
            </button>
          </div>
        )}
      </div>

      {parsed > 0n && (
        <dl className="mt-6">
          {side === "buy" && buy && (
            <>
              <Line label="You receive" value={`${fmtTokens(buy.tokensOut)} ${launch.symbol}`} />
              <Line label="Trading fee" value={`${eth(buy.fee)} ETH`} />
              {buy.creatorTax > 0n && (
                <Line label="Creator fee" value={`${eth(buy.creatorTax)} ETH`} />
              )}
              {buy.snipeTax > 0n && (
                <Line
                  label="Opening tax"
                  value={`${eth(buy.snipeTax)} ETH`}
                  emphasis="var(--color-signal)"
                />
              )}
              {buy.clamped && (
                <Line label="Returned to you" value={`${eth(buy.refund)} ETH`} />
              )}
              <Line label="Price impact" value={`${(Number(buy.priceImpactBps) / 100).toFixed(2)}%`} />
              <Line
                label="Minimum received"
                value={`${fmtTokens(minOut)} ${launch.symbol}`}
              />
            </>
          )}

          {side === "sell" && sell && (
            <>
              <Line label="You receive" value={`${eth(sell.quoteOut)} ETH`} />
              <Line label="Trading fee" value={`${eth(sell.fee)} ETH`} />
              {sell.creatorTax > 0n && (
                <Line label="Creator fee" value={`${eth(sell.creatorTax)} ETH`} />
              )}
              <Line label="Minimum received" value={`${eth(minOut)} ETH`} />
            </>
          )}
        </dl>
      )}

      <div className="mt-7">
        {!isConnected ? (
          <p className="text-ink-soft">Connect a wallet to trade this.</p>
        ) : blocked ? (
          <div>
            <p className="prose-tight text-[0.8125rem]">
              The opening tax is still running. Waiting a moment costs you
              nothing; buying now costs you {buy ? eth(buy.snipeTax) : "0"} ETH.
            </p>
            <button
              type="button"
              onClick={() => setOverride(true)}
              className="btn btn-quiet mt-3"
            >
              Buy anyway
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit || isPending}
            className="btn btn-solid w-full justify-center"
          >
            {isPending
              ? "Confirm in your wallet"
              : side === "sell" && parsed > held
                ? "More than you hold"
                : side === "buy"
                  ? "Buy"
                  : "Sell"}
          </button>
        )}
      </div>

      {hash && (
        <div className="mt-5 border-t border-rule pt-4">
          <p className="text-ink">
            {receipt.isSuccess
              ? side === "buy"
                ? "Bought"
                : "Sold"
              : receipt.isError
                ? "That transaction failed"
                : "Waiting for confirmation"}
          </p>
          <a
            href={explorerTx(hash)}
            target="_blank"
            rel="noreferrer"
            className="meta mt-1 block break-all underline decoration-rule underline-offset-4 hover:text-ink"
          >
            {hash}
          </a>
          {receipt.isSuccess && (
            <button
              type="button"
              onClick={() => {
                reset();
                setAmount("");
                curve.refetch();
              }}
              className="btn btn-quiet mt-3"
            >
              Done
            </button>
          )}
        </div>
      )}

      {error && !hash && (
        <p className="prose-tight mt-5 border-t border-rule pt-4 text-[0.8125rem]">
          {error.message.includes("User rejected")
            ? "You cancelled that in your wallet."
            : error.message.includes("SlippageExceeded")
              ? "The price moved while you were signing. Try again."
              : "The wallet refused that transaction. Check your balance, then try again."}
        </p>
      )}
    </div>
  );
}

function Line({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-rule-soft py-2.5">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="font-mono text-[0.8125rem]" style={{color: emphasis ?? "var(--color-ink-deep)"}}>
        {value}
      </dd>
    </div>
  );
}
