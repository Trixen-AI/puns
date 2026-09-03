import {createAppKit} from "@reown/appkit/react";
import {WagmiAdapter} from "@reown/appkit-adapter-wagmi";
import type {AppKitNetwork} from "@reown/appkit/networks";
import {createConfig, http} from "wagmi";
import {robinhoodChain} from "@/lib/chain";

/**
 * Wallet connection, through Reown AppKit and nothing else.
 *
 * A note on the stack, because it looks like two competing libraries and is
 * not: `@reown/appkit-adapter-wagmi` is built on wagmi. wagmi is the adapter
 * Reown ships, not an alternative to it. Removing wagmi would mean swapping in
 * Reown's ethers adapter and rewriting every contract read in the app, for no
 * change in behaviour.
 *
 * What did need removing was the fallback. An earlier version quietly connected
 * through an injected provider when no project id was configured, which is why
 * pressing Connect opened MetaMask directly instead of the Reown modal. There is
 * no fallback now: without a project id there is no connector at all, and the
 * interface says so rather than substituting something else.
 */

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID?.trim();

const origin =
  typeof window !== "undefined" ? window.location.origin : "https://punsfun.app";

export const hasAppKit = Boolean(projectId);

const networks = [robinhoodChain] as unknown as [AppKitNetwork, ...AppKitNetwork[]];
const transports = {[robinhoodChain.id]: http()};

function build() {
  if (!projectId) {
    // Reads still work. Only connecting is unavailable, and deliberately so.
    return {
      wagmiConfig: createConfig({
        chains: [robinhoodChain],
        connectors: [],
        transports,
      }),
    };
  }

  const adapter = new WagmiAdapter({projectId, networks, transports});

  createAppKit({
    adapters: [adapter],
    networks,
    projectId,
    metadata: {
      name: "Puns",
      description:
        "A launchpad for meme tokens. Every launch starts on the same bonding curve.",
      // Taken from wherever the page is actually served. Hardcoding the
      // production domain makes every wallet warn about a mismatch in
      // development, and the warning is correct: the origin is what a wallet
      // checks against.
      url: origin,
      icons: [`${origin}/favicon.svg`],
    },
    features: {analytics: false, email: false, socials: false},
    themeMode: "light",
    themeVariables: {
      "--w3m-accent": "#0a0a0a",
      "--w3m-border-radius-master": "1px",
      "--w3m-font-family":
        '"Roboto Variable", Roboto, system-ui, -apple-system, sans-serif',
    },
  });

  return {wagmiConfig: adapter.wagmiConfig};
}

export const {wagmiConfig} = build();
