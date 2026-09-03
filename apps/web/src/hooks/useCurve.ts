import {useAccount, useReadContracts} from "wagmi";
import type {Address} from "viem";
import {curveAbi} from "@/lib/abi";
import type {CurveState} from "@/lib/quote";

/**
 * Live state for one curve.
 *
 * The opening-window tax decays from 99% to nothing across five seconds, so
 * while it is non-zero this polls every second. Once it clears, polling drops
 * back to a normal cadence. Quoting against a stale tax is the difference
 * between a trade someone meant to make and one they did not.
 *
 * The tax is read for the connected wallet specifically. Reading it for anyone
 * else answers a different question.
 */

export type CurveReads = {
  state?: CurveState;
  realQuoteReserve: bigint;
  graduationThreshold: bigint;
  readyToGraduate: boolean;
  graduated: boolean;
  isLoading: boolean;
  refetch: () => void;
};

export function useCurve(curve?: Address): CurveReads {
  const {address} = useAccount();
  // Quoting for the zero address gives the tax a stranger would pay, which is
  // the honest default for someone who has not connected yet.
  const recipient = address ?? "0x0000000000000000000000000000000000000000";

  const {data, isLoading, refetch} = useReadContracts({
    query: {
      enabled: Boolean(curve),
      // Refined below once we know whether the window is open.
      refetchInterval: (query) => {
        const results = query.state.data as {result?: unknown}[] | undefined;
        const snipe = results?.[6]?.result as bigint | undefined;
        return snipe && snipe > 0n ? 1000 : 12_000;
      },
    },
    contracts: curve
      ? [
          {address: curve, abi: curveAbi, functionName: "getReserves"},
          {address: curve, abi: curveAbi, functionName: "sellableTokens"},
          {address: curve, abi: curveAbi, functionName: "feeBps"},
          {address: curve, abi: curveAbi, functionName: "creatorTaxBps"},
          {address: curve, abi: curveAbi, functionName: "realQuoteReserve"},
          {address: curve, abi: curveAbi, functionName: "graduationThreshold"},
          {
            address: curve,
            abi: curveAbi,
            functionName: "currentSnipeTaxBps",
            args: [recipient as Address],
          },
          {address: curve, abi: curveAbi, functionName: "readyToGraduate"},
          {address: curve, abi: curveAbi, functionName: "graduated"},
        ]
      : [],
  });

  const reserves = data?.[0]?.result as readonly [bigint, bigint] | undefined;

  const state: CurveState | undefined = reserves
    ? {
        quoteReserve: reserves[0],
        tokenReserve: reserves[1],
        sellableTokens: (data?.[1]?.result as bigint) ?? 0n,
        feeBps: (data?.[2]?.result as bigint) ?? 0n,
        creatorTaxBps: (data?.[3]?.result as bigint) ?? 0n,
        snipeTaxBps: (data?.[6]?.result as bigint) ?? 0n,
      }
    : undefined;

  return {
    state,
    realQuoteReserve: (data?.[4]?.result as bigint) ?? 0n,
    graduationThreshold: (data?.[5]?.result as bigint) ?? 0n,
    readyToGraduate: (data?.[7]?.result as boolean) ?? false,
    graduated: (data?.[8]?.result as boolean) ?? false,
    isLoading,
    refetch: () => void refetch(),
  };
}
