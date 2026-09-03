/**
 * Types for the shared indexer.
 *
 * The implementation is plain JavaScript so the Netlify runtime can load it
 * without a build step. These declarations give the dev server and the config
 * the same guarantees the rest of the app has.
 */

export type IndexedLaunch = {
  token: `0x${string}`;
  curve: `0x${string}`;
  deployer: `0x${string}`;
  pairToken: `0x${string}`;
  /** Hex encoded, because JSON cannot carry a bigint. */
  graduationThreshold: string;
  block: number;
};

export type IndexMeta = {
  lastBlock: number | null;
  total: number;
  shards: number;
  updatedAt?: string;
};

/** Anything that can hold JSON under a key: Netlify Blobs, or a folder. */
export type Store = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
};

export type AdvanceOptions = {
  rpcUrl: string;
  factory: string;
  chunk: number;
  requestsPerRun: number;
  concurrency: number;
};

export type AdvanceResult = {
  status: string;
  scanned?: number;
  failures?: number;
  found?: number;
  lastBlock?: number;
  head?: number;
  behind?: number;
  total?: number;
  advanced?: boolean;
};

export type LaunchPageResult = {
  launches: IndexedLaunch[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  indexedFrom: number | null;
  updatedAt: string | null;
};

export declare const TOPIC_TOKEN_LAUNCHED: string;
export declare const SHARD_SIZE: number;
export declare const META_KEY: string;

export declare function makeRpc(url: string): (method: string, params: unknown[]) => Promise<never>;
export declare function decodeLaunch(log: {
  topics: string[];
  data: string;
  blockNumber: string;
}): IndexedLaunch;
export declare function advance(store: Store, opts: AdvanceOptions): Promise<AdvanceResult>;
export declare function readPage(
  store: Store,
  page: number,
  limit: number,
): Promise<LaunchPageResult>;
