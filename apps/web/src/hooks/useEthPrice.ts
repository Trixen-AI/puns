import {useQuery} from "@tanstack/react-query";

/**
 * ETH in dollars, for displaying market caps.
 *
 * Presentation only. Nothing that decides a transaction uses this: quotes,
 * slippage floors and balances are all computed in wei against chain state, so
 * a stale or missing rate can make a number look wrong but can never make a
 * trade go wrong.
 */
export function useEthPrice() {
  const {data} = useQuery({
    queryKey: ["eth-usd"],
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
    queryFn: async (): Promise<number | undefined> => {
      try {
        const response = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
          {signal: AbortSignal.timeout(8000)},
        );
        if (!response.ok) return undefined;
        const payload = (await response.json()) as {ethereum?: {usd?: number}};
        const usd = payload.ethereum?.usd;
        return typeof usd === "number" && usd > 0 ? usd : undefined;
      } catch {
        return undefined;
      }
    },
  });

  return data;
}
