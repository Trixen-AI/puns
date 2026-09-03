import {useQuery} from "@tanstack/react-query";
import {envStr} from "@/lib/env";
import {usePublicClient} from "wagmi";
import {createPublicClient, http, type Address, type PublicClient} from "viem";
import {curveAbi, factoryAbi, tokenAbi} from "@/lib/abi";
import {contracts, logChunk, logsRpc, robinhoodChain} from "@/lib/chain";
import {graduationProgress, priceE18} from "@/lib/quote";

/**
 * Where the list of launches comes from.
 *
 * Two sources, one shape. The indexer is preferred: it has been walking the
 * chain on a schedule and can answer a page immediately. Scanning logs from the
 * browser is the fallback, and it only works against a provider that permits a
 * wide getLogs range, which the common free tiers do not.
 *
 * Either way, only addresses come from the source. Names, images, reserves and
 * prices are read live by multicall, which is not rate limited, so nothing that
 * can change is ever served from a cache.
 */

const DEFAULT_LOOKBACK = 180_000n;
const NATIVE = "0x0000000000000000000000000000000000000000";
const INDEXER_URL = envStr(
  import.meta.env.VITE_INDEXER_URL,
  "/.netlify/functions/launches",
);

export type Launch = {
  token: Address;
  curve: Address;
  deployer: Address;
  /** Zero address means the launch is priced in ETH. Anything else is not. */
  pairToken: Address;
  graduationThreshold: bigint;
  blockNumber: bigint;

  name: string;
  symbol: string;
  logo: string;
  description: string;

  quoteReserve: bigint;
  tokenReserve: bigint;
  realQuoteReserve: bigint;
  sellableTokens: bigint;
  feeBps: bigint;
  creatorTaxBps: bigint;
  graduated: boolean;

  priceE18: bigint;
  progress: number;
};

export type LaunchPage = {
  launches: Launch[];
  total: number;
  hasMore: boolean;
  /** Which source answered, so the interface can explain itself accurately. */
  source: "indexer" | "logs";
  /** Last block the indexer has covered, when it answered. */
  indexedFrom: number | null;
  /** When the indexer last advanced. Null when it has never run. */
  updatedAt: string | null;
};

type Row = {
  token: Address;
  curve: Address;
  deployer: Address;
  pairToken: Address;
  threshold: bigint;
  blockNumber: bigint;
};

type LaunchLog = {
  blockNumber: bigint | null;
  args: {
    token?: Address;
    curve?: Address;
    deployer?: Address;
    graduationThreshold?: bigint;
  };
};

type CallResult = {status: "success" | "failure"; result?: unknown};

/* -------------------------------------------------------------------------- */

async function fromIndexer(page: number, limit: number) {
  const response = await fetch(`${INDEXER_URL}?page=${page}&limit=${limit}`, {
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error("INDEXER_UNAVAILABLE");

  const payload = (await response.json()) as {
    launches: {
      token: Address;
      curve: Address;
      deployer: Address;
      graduationThreshold: string;
      pairToken: Address;
      block: number;
    }[];
    total: number;
    hasMore?: boolean;
    indexedFrom: number | null;
    updatedAt: string | null;
  };

  const rows: Row[] = (payload.launches ?? []).map((l) => ({
    token: l.token,
    curve: l.curve,
    deployer: l.deployer,
    pairToken: (l.pairToken ?? NATIVE) as Address,
    threshold: BigInt(l.graduationThreshold ?? "0"),
    blockNumber: BigInt(l.block ?? 0),
  }));

  return {
    rows,
    total: payload.total ?? rows.length,
    hasMore: payload.hasMore ?? false,
    indexedFrom: payload.indexedFrom ?? null,
    updatedAt: payload.updatedAt ?? null,
  };
}

async function fromLogs(client: PublicClient, factory: Address): Promise<Row[]> {
  const head = await client.getBlockNumber();
  const configured = import.meta.env.VITE_INDEXER_START_BLOCK;
  const range = import.meta.env.VITE_LOG_RANGE
    ? BigInt(import.meta.env.VITE_LOG_RANGE)
    : DEFAULT_LOOKBACK;
  const floor = configured ? BigInt(configured) : head - range;
  const from = floor > 0n ? floor : 0n;

  const event = factoryAbi.find(
    (item) => item.type === "event" && item.name === "TokenLaunched",
  );
  if (!event) throw new Error("TokenLaunched is missing from the factory ABI");

  const ranges: [bigint, bigint][] = [];
  for (let start = from; start <= head; start += logChunk) {
    const end = start + logChunk - 1n;
    ranges.push([start, end > head ? head : end]);
  }

  // Log scans go to their own endpoint when one is configured, because
  // providers restrict getLogs far more tightly than ordinary reads.
  const reader = logsRpc
    ? createPublicClient({chain: robinhoodChain, transport: http(logsRpc)})
    : client;

  let refused = 0;
  const chunks = await Promise.all(
    ranges.map(([fromBlock, toBlock]) =>
      reader
        .getLogs({address: factory, event: event as never, fromBlock, toBlock})
        .catch(() => {
          refused += 1;
          return [];
        }),
    ),
  );

  // Every request failing is a different situation from finding no launches,
  // and the interface has to be able to tell them apart.
  if (refused === ranges.length && ranges.length > 0) {
    throw new Error("LOGS_UNAVAILABLE");
  }

  const logs = chunks.flat() as unknown as LaunchLog[];

  return logs
    .map((log) => ({
      token: log.args.token as Address,
      curve: log.args.curve as Address,
      deployer: log.args.deployer as Address,
      pairToken: NATIVE as Address,
      threshold: log.args.graduationThreshold ?? 0n,
      blockNumber: log.blockNumber ?? 0n,
    }))
    .filter((row) => row.token && row.curve)
    .sort((a, b) => Number(b.blockNumber - a.blockNumber));
}

/** Per-launch state, batched into a single multicall. */
async function hydrate(client: PublicClient, rows: Row[]): Promise<Launch[]> {
  if (rows.length === 0) return [];

  const calls = rows.flatMap((row) => [
    {address: row.token, abi: tokenAbi, functionName: "name"},
    {address: row.token, abi: tokenAbi, functionName: "symbol"},
    {address: row.token, abi: tokenAbi, functionName: "getTokenInfo"},
    {address: row.curve, abi: curveAbi, functionName: "getReserves"},
    {address: row.curve, abi: curveAbi, functionName: "realQuoteReserve"},
    {address: row.curve, abi: curveAbi, functionName: "sellableTokens"},
    {address: row.curve, abi: curveAbi, functionName: "feeBps"},
    {address: row.curve, abi: curveAbi, functionName: "creatorTaxBps"},
    {address: row.curve, abi: curveAbi, functionName: "graduated"},
  ]);

  const results = (await client.multicall({
    contracts: calls as never,
    allowFailure: true,
  })) as unknown as CallResult[];

  const PER_ROW = 9;
  const launches: Launch[] = [];

  rows.forEach((row, i) => {
    const slice = results.slice(i * PER_ROW, (i + 1) * PER_ROW);
    // A launch whose reads failed is left out rather than shown wrong.
    if (slice.some((r) => r.status === "failure")) return;

    const [name, symbol, info, reserves, realQuote, sellable, feeBps, taxBps, graduated] =
      slice.map((r) => r.result) as [
        string,
        string,
        [Address, string, string, unknown],
        [bigint, bigint],
        bigint,
        bigint,
        bigint,
        bigint,
        boolean,
      ];

    const [quoteReserve, tokenReserve] = reserves;

    launches.push({
      token: row.token,
      curve: row.curve,
      deployer: row.deployer,
      pairToken: row.pairToken,
      graduationThreshold: row.threshold,
      blockNumber: row.blockNumber,
      name,
      symbol,
      logo: info?.[1] ?? "",
      description: info?.[2] ?? "",
      quoteReserve,
      tokenReserve,
      realQuoteReserve: realQuote,
      sellableTokens: sellable,
      feeBps,
      creatorTaxBps: taxBps,
      graduated,
      priceE18: priceE18(quoteReserve, tokenReserve),
      progress: graduationProgress(realQuote, row.threshold),
    });
  });

  return launches;
}

/* -------------------------------------------------------------------------- */

export function useLaunches(page = 0, limit = 25) {
  const client = usePublicClient();
  const factory = contracts.factory;

  return useQuery({
    queryKey: ["launches", factory, page, limit],
    enabled: Boolean(client && factory),
    staleTime: 20_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<LaunchPage> => {
      if (!client || !factory) {
        return {
          launches: [],
          total: 0,
          hasMore: false,
          source: "logs",
          indexedFrom: null,
          updatedAt: null,
        };
      }

      try {
        const indexed = await fromIndexer(page, limit);
        return {
          launches: await hydrate(client, indexed.rows),
          total: indexed.total,
          hasMore: indexed.hasMore,
          source: "indexer",
          indexedFrom: indexed.indexedFrom,
          updatedAt: indexed.updatedAt,
        };
      } catch {
        // No indexer deployed yet, or it is unreachable. Scan directly and
        // paginate in the browser.
        const rows = await fromLogs(client, factory);
        const slice = rows.slice(page * limit, page * limit + limit);
        return {
          launches: await hydrate(client, slice),
          total: rows.length,
          hasMore: (page + 1) * limit < rows.length,
          source: "logs",
          indexedFrom: null,
          updatedAt: null,
        };
      }
    },
  });
}

/**
 * One launch, read straight from the factory record.
 *
 * Deliberately independent of the list: a token page opened from a link should
 * not need the page it was linked from to have loaded first.
 */
export function useLaunch(token?: Address) {
  const client = usePublicClient();
  const factory = contracts.factory;

  return useQuery({
    queryKey: ["launch", token],
    enabled: Boolean(client && factory && token),
    staleTime: 15_000,
    queryFn: async (): Promise<Launch | undefined> => {
      if (!client || !factory || !token) return undefined;

      const record = (await client.readContract({
        address: factory,
        abi: factoryAbi,
        functionName: "getLaunchedToken",
        args: [token],
      })) as {
        token: Address;
        curve: Address;
        deployer: Address;
        pairToken: Address;
        graduationThreshold: bigint;
        exists: boolean;
      };

      if (!record?.exists) return undefined;

      const [launch] = await hydrate(client, [
        {
          token: record.token,
          curve: record.curve,
          deployer: record.deployer,
          pairToken: record.pairToken,
          threshold: record.graduationThreshold,
          blockNumber: 0n,
        },
      ]);

      return launch;
    },
  });
}
