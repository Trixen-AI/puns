import {useAccount, useReadContract, useReadContracts} from "wagmi";
import {PassTier, punsPassAbi} from "@/lib/abi";
import {contracts} from "@/lib/chain";

/**
 * Puns Pass state.
 *
 * Terms come from the contract rather than a constant, so a re-peg is reflected
 * the moment it lands. Ownership is checked on chain for the same reason: a
 * pass is meant to be verifiable without trusting us.
 */

export type Terms = {
  price: bigint;
  duration: bigint;
  usdCents: number;
  repeggedAt: bigint;
};

function toTerms(result?: readonly [bigint, bigint, number, bigint]): Terms | undefined {
  if (!result) return undefined;
  const [price, duration, usdCents, repeggedAt] = result;
  return {price, duration, usdCents: Number(usdCents), repeggedAt};
}

export function usePassTerms() {
  const address = contracts.punsPass;

  const {data, ...rest} = useReadContracts({
    query: {enabled: Boolean(address), staleTime: 60_000},
    contracts: address
      ? [
          {address, abi: punsPassAbi, functionName: "termsOf", args: [PassTier.Creator]},
          {address, abi: punsPassAbi, functionName: "termsOf", args: [PassTier.Pro]},
          {address, abi: punsPassAbi, functionName: "totalMinted"},
        ]
      : [],
  });

  return {
    ...rest,
    creator: toTerms(data?.[0]?.result as never),
    pro: toTerms(data?.[1]?.result as never),
    totalMinted: (data?.[2]?.result as bigint | undefined) ?? 0n,
  };
}

export function usePassStatus() {
  const {address: holder} = useAccount();
  const address = contracts.punsPass;

  const {data, ...rest} = useReadContract({
    address,
    abi: punsPassAbi,
    functionName: "tiersOf",
    args: holder ? [holder] : undefined,
    query: {enabled: Boolean(address && holder), staleTime: 30_000},
  });

  const [creator, pro] = (data as readonly [boolean, boolean] | undefined) ?? [false, false];
  return {...rest, creator, pro, holder};
}
