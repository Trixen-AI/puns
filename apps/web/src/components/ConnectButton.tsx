import {useAppKit} from "@reown/appkit/react";
import {useAccount} from "wagmi";
import {hasAppKit} from "@/lib/wallet";
import {shortAddress} from "@/lib/chain";

/**
 * The one control that connects a wallet.
 *
 * There is exactly one of these in the app, in the header. Screens that need a
 * connected wallet say so in a sentence and point here, rather than each
 * carrying a button of their own.
 *
 * Two implementations chosen at module level, so hook order stays stable
 * whether or not AppKit was created.
 */

function AppKitButton() {
  const {address, isConnected} = useAccount();
  const {open} = useAppKit();

  return (
    <button
      type="button"
      onClick={() => open()}
      className={isConnected ? "btn btn-quiet font-mono" : "btn btn-solid"}
      title={address}
    >
      {isConnected && address ? shortAddress(address) : "Connect wallet"}
    </button>
  );
}

/**
 * Shown only when no Reown project id is configured. It does not fall back to
 * an injected wallet: silently opening MetaMask when the app was asked to open
 * Reown is a different product than the one that was configured.
 */
function Unconfigured() {
  return (
    <button
      type="button"
      disabled
      className="btn btn-quiet opacity-60"
      title="Wallet connection is not set up on this site yet"
    >
      Wallet unavailable
    </button>
  );
}

export const ConnectButton = hasAppKit ? AppKitButton : Unconfigured;
