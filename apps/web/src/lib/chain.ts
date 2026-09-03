import {defineChain} from "viem";
import {envBig, envOptional} from "@/lib/env";

/**
 * Robinhood Chain. An Arbitrum Orbit rollup that settles in ETH.
 *
 * The public endpoint is unreliable: measured failure rates around 30% under
 * light load, with periods of being fully offline. A private endpoint belongs
 * in VITE_RPC_MAINNET, and the public one stays only as a last resort so the
 * site degrades instead of dying.
 */

const PUBLIC_RPC = "https://rpc.mainnet.chain.robinhood.com";

const rpcUrls = [
  import.meta.env.VITE_RPC_MAINNET,
  ...(import.meta.env.VITE_RPC_FALLBACKS?.split(",") ?? []),
  PUBLIC_RPC,
]
  .map((url?: string) => url?.trim())
  .filter((url): url is string => Boolean(url));

export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: {name: "Ether", symbol: "ETH", decimals: 18},
  rpcUrls: {
    default: {http: rpcUrls},
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://robinhoodchain.blockscout.com",
    },
  },
  contracts: {
    // Multicall3 is deployed at the canonical address on this chain, verified
    // by calling aggregate3 against it. viem will not batch reads unless the
    // chain declares it, and without batching a page of launches becomes
    // hundreds of separate requests, which the endpoint refuses.
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
    },
  },
});

export const EXPLORER = robinhoodChain.blockExplorers.default.url;

/**
 * Where to send eth_getLogs.
 *
 * Log scans need a different endpoint from ordinary reads, because providers
 * price them differently. Alchemy's free tier caps a getLogs range at ten
 * blocks, which on a chain producing a block every 0.1 seconds is one second of
 * history: enough to return nothing, every time. A paid plan or a provider with
 * a generous log range goes here; everything else keeps using the main RPC.
 */
export const logsRpc = envOptional(import.meta.env.VITE_RPC_LOGS);

/** How many blocks one getLogs request may span. Provider dependent. */
export const logChunk = envBig(import.meta.env.VITE_LOG_CHUNK, 40_000n);

export const explorerAddress = (address: string) => `${EXPLORER}/address/${address}`;
export const explorerTx = (hash: string) => `${EXPLORER}/tx/${hash}`;

/** Contracts the app talks to. Filled from the environment, never hardcoded. */
export const contracts = {
  punsPass: import.meta.env.VITE_PUNS_PASS_ADDRESS as `0x${string}` | undefined,
  factory: import.meta.env.VITE_LAUNCH_FACTORY_ADDRESS as `0x${string}` | undefined,
  launchAndBuy: import.meta.env.VITE_LAUNCH_AND_BUY_ADDRESS as `0x${string}` | undefined,
} as const;

export const shortAddress = (address?: string) =>
  address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";
