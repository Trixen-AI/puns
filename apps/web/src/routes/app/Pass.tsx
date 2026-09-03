import {useEffect, useState} from "react";
import {useAccount, useWaitForTransactionReceipt, useWriteContract} from "wagmi";
import {PassTier, punsPassAbi} from "@/lib/abi";
import {contracts, explorerAddress, explorerTx} from "@/lib/chain";
import {eth} from "@/lib/format";
import {usePassStatus, usePassTerms, type Terms} from "@/hooks/usePass";
import {Failed} from "@/components/app/States";
import {pass as passCopy} from "@/lib/content";

/**
 * Buying a pass.
 *
 * Prices come from the contract rather than a constant, so a re-peg shows up
 * here the moment it lands. Ownership is read on chain for the same reason a
 * pass exists at all: it should be checkable without trusting us.
 */
export default function Pass() {
  const address = contracts.punsPass;
  const {isConnected} = useAccount();
  const {creator, pro, totalMinted, isLoading} = usePassTerms();
  const status = usePassStatus();

  const {writeContract, data: hash, isPending, reset, error} = useWriteContract();
  const receipt = useWaitForTransactionReceipt({hash});

  // A shared pending flag made both cards say "Confirm in your wallet" the
  // moment either was pressed. Remembering which tier was chosen keeps the
  // other card exactly as it was.
  const [pendingTier, setPendingTier] = useState<number | null>(null);

  useEffect(() => {
    if (!isPending && !hash) setPendingTier(null);
  }, [isPending, hash]);

  if (!address) {
    return (
      <div className="page py-20">
        <Failed body="Passes are not available on this address yet. Everything else works without one." />
      </div>
    );
  }

  const buy = (tier: number, price: bigint) => {
    setPendingTier(tier);
    return writeContract({
      address,
      abi: punsPassAbi,
      functionName: "mint",
      args: [tier, status.holder!],
      value: price,
    });
  };

  return (
    <div className="page py-12">
      <div className="max-w-[46rem]">
        <h1 className="display-2">Puns Pass</h1>
        <p className="prose-tight mt-4">{passCopy.body}</p>
      </div>

      {hash && (
        <div className="row mt-10 py-5">
          <p className="text-ink">
            {receipt.isSuccess
              ? "Pass minted"
              : receipt.isError
                ? "That transaction failed"
                : "Waiting for confirmation"}
          </p>
          <a
            href={explorerTx(hash)}
            target="_blank"
            rel="noreferrer"
            className="meta mt-1 block underline decoration-rule underline-offset-4 hover:text-ink"
          >
            {hash}
          </a>
          {receipt.isSuccess && (
            <button type="button" onClick={() => reset()} className="btn btn-quiet mt-4">
              Done
            </button>
          )}
        </div>
      )}

      {error && !hash && (
        <p className="row mt-10 py-5 text-ink">
          {error.message.includes("User rejected")
            ? "You cancelled that in your wallet."
            : "The wallet refused that transaction. Check your balance and the network, then try again."}
        </p>
      )}

      <div className="mt-12 grid gap-px border-t border-rule md:grid-cols-2">
        <TierCard
          name="Creator"
          terms={creator}
          loading={isLoading}
          held={status.creator}
          copy={passCopy.tiers[0]}
          connected={isConnected}
          pending={isPending && pendingTier === PassTier.Creator}
          onBuy={() => creator && buy(PassTier.Creator, creator.price)}
        />
        <TierCard
          name="Pro"
          terms={pro}
          loading={isLoading}
          held={status.pro}
          copy={passCopy.tiers[1]}
          connected={isConnected}
          pending={isPending && pendingTier === PassTier.Pro}
          onBuy={() => pro && buy(PassTier.Pro, pro.price)}
          last
        />
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
        <p className="meta">{totalMinted.toString()} minted</p>
        <a
          href={explorerAddress(address)}
          target="_blank"
          rel="noreferrer"
          className="meta font-mono underline decoration-rule underline-offset-4 hover:text-ink"
        >
          {address}
        </a>
      </div>
    </div>
  );
}

type CardProps = {
  name: string;
  terms?: Terms;
  loading: boolean;
  held: boolean;
  connected: boolean;
  pending: boolean;
  onBuy: () => void;
  copy: (typeof passCopy.tiers)[number];
  last?: boolean;
};

function TierCard({name, terms, loading, held, connected, pending, onBuy, copy, last}: CardProps) {
  const forSale = terms && terms.price > 0n;
  const lifetime = terms?.duration === 0n;

  return (
    <div
      className={`border-b border-rule py-8 ${
        last ? "md:pl-10" : "md:border-r md:pr-10"
      }`}
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="display-3">{name}</h2>
        <p className="font-mono text-[0.9375rem] text-ink-deep">
          {loading ? "…" : terms ? `${eth(terms.price)} ETH` : "not for sale"}
        </p>
      </div>

      <p className="meta mt-1 text-right">
        {terms?.usdCents ? `$${(terms.usdCents / 100).toFixed(2)} · ` : ""}
        {lifetime ? "Lifetime" : terms ? `${Number(terms.duration) / 86400} days` : ""}
      </p>

      <p className="mt-5 text-ink-muted">{copy.for}</p>

      <ul className="mt-5 space-y-2">
        {copy.includes.map((item) => (
          <li key={item} className="text-ink-soft">
            {item}
          </li>
        ))}
      </ul>

      <div className="mt-8">
        {held ? (
          <p style={{color: "var(--color-signal)"}}>You hold this pass</p>
        ) : !forSale ? (
          <p className="text-ink-soft">Not on sale right now</p>
        ) : !connected ? (
          // No button here. A disabled control that cannot do its job is just a
          // dead end; the sentence points at the one control that can.
          <p className="text-ink-soft">Connect a wallet to buy this.</p>
        ) : (
          <button type="button" onClick={onBuy} disabled={pending} className="btn btn-solid">
            {pending ? "Confirm in your wallet" : `Get ${name}`}
          </button>
        )}
      </div>
    </div>
  );
}
