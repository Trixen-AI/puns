#!/usr/bin/env node
/**
 * Keeps PunsPass tier prices tracking their USD peg.
 *
 * Prices are stored on chain in wei, so a fixed ETH price drifts in USD terms
 * as the market moves. Reading a price feed inside the contract was rejected:
 * a stale or reverting oracle would halt pass sales entirely, which is a real
 * failure mode traded for a cosmetic benefit. Instead this job reads the
 * intended peg from the contract itself, compares it to the market, and calls
 * `repeg` when the drift is worth correcting.
 *
 * The contract stores `usdCents` per tier, so this job is stateless: the chain
 * is the source of truth for what each tier is meant to cost.
 *
 * The key this runs with should be the `pricer`, never the owner. A pricer can
 * only move prices, within a 50% band, and cannot touch durations, the
 * treasury, grants or ownership.
 *
 * Usage:
 *
 *   node tools/repeg.mjs           # apply changes
 *   node tools/repeg.mjs --dry-run # report only
 *
 * Environment:
 *
 *   PUNS_PASS_ADDRESS    deployed PunsPass
 *   RPC_URL              defaults to the local proxy on 8546
 *   PRICER_PRIVATE_KEY   omit for --dry-run
 *   REPEG_THRESHOLD_BPS  minimum drift worth a transaction, default 300 (3%)
 */

import {execFileSync} from "node:child_process";

const PASS = process.env.PUNS_PASS_ADDRESS;
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8546";
const KEY = process.env.PRICER_PRIVATE_KEY;
const THRESHOLD_BPS = BigInt(process.env.REPEG_THRESHOLD_BPS ?? 300);
const DRY_RUN = process.argv.includes("--dry-run");

/** Mirrors MAX_REPEG_DEVIATION_BPS in PunsPass.sol. */
const MAX_DEVIATION_BPS = 5_000n;
const BPS = 10_000n;

const TIERS = [
  {id: 1, name: "Creator"},
  {id: 2, name: "Pro"},
];

if (!PASS) {
  console.error("PUNS_PASS_ADDRESS is not set");
  process.exit(1);
}

const cast = (args) => execFileSync("cast", args, {encoding: "utf8"}).trim();

/** Read a tier's on-chain terms. `usdCents` is the peg we are tracking. */
function readTerms(tierId) {
  const raw = cast([
    "call",
    PASS,
    "termsOf(uint8)(uint256,uint64,uint32,uint64)",
    String(tierId),
    "--rpc-url",
    RPC,
  ]);
  const [price, duration, usdCents, repeggedAt] = raw
    .split("\n")
    .map((line) => BigInt(line.trim().split(" ")[0]));
  return {price, duration, usdCents, repeggedAt};
}

/** Spot ETH/USD, scaled to 1e18 so the arithmetic stays in integers. */
async function fetchEthUsdE18() {
  const response = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
    {signal: AbortSignal.timeout(15_000)},
  );
  if (!response.ok) throw new Error(`price source returned ${response.status}`);

  const usd = (await response.json())?.ethereum?.usd;
  if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0) {
    throw new Error(`price source returned an unusable value: ${usd}`);
  }
  // Six decimals of the quoted price is far more precision than a pass needs.
  return BigInt(Math.round(usd * 1e6)) * 10n ** 12n;
}

const abs = (value) => (value < 0n ? -value : value);
const formatEth = (wei) => (Number(wei) / 1e18).toFixed(8);
const formatUsd = (cents) => `$${(Number(cents) / 100).toFixed(2)}`;

async function main() {
  const ethUsdE18 = await fetchEthUsdE18();
  console.log(`ETH/USD          ${(Number(ethUsdE18) / 1e18).toFixed(2)}`);
  console.log(`contract         ${PASS}`);
  console.log(`threshold        ${THRESHOLD_BPS} bps`);
  console.log(`mode             ${DRY_RUN ? "dry run" : "apply"}`);
  console.log("");

  for (const tier of TIERS) {
    const terms = readTerms(tier.id);

    if (terms.price === 0n) {
      console.log(`${tier.name.padEnd(8)} not for sale, skipping`);
      continue;
    }
    if (terms.usdCents === 0n) {
      console.log(`${tier.name.padEnd(8)} no USD peg recorded, skipping`);
      continue;
    }

    // target wei = (usdCents / 100) / ethUsd, in 1e18 fixed point
    const targetWei = (terms.usdCents * 10n ** 18n * 10n ** 18n) / (100n * ethUsdE18);
    const driftBps = (abs(targetWei - terms.price) * BPS) / terms.price;
    const currentUsdCents = (terms.price * ethUsdE18 * 100n) / 10n ** 36n;

    console.log(
      `${tier.name.padEnd(8)} peg ${formatUsd(terms.usdCents)} | ` +
        `now ${formatEth(terms.price)} ETH (${formatUsd(currentUsdCents)}) | ` +
        `target ${formatEth(targetWei)} ETH | drift ${driftBps} bps`,
    );

    if (driftBps < THRESHOLD_BPS) {
      console.log(`         within threshold, no action`);
      continue;
    }

    // The contract enforces this too. Checking here turns a failed transaction
    // into a clear message, and a move this large deserves a human anyway.
    if (driftBps > MAX_DEVIATION_BPS) {
      console.log(
        `         REFUSING: ${driftBps} bps exceeds the ${MAX_DEVIATION_BPS} bps band. ` +
          `The owner must correct this with setTerms.`,
      );
      continue;
    }

    if (DRY_RUN) {
      console.log(`         would repeg to ${targetWei} wei`);
      continue;
    }
    if (!KEY) {
      console.log(`         PRICER_PRIVATE_KEY is not set, skipping`);
      continue;
    }

    cast([
      "send",
      PASS,
      "repeg(uint8,uint256)",
      String(tier.id),
      String(targetWei),
      "--private-key",
      KEY,
      "--rpc-url",
      RPC,
    ]);
    console.log(`         repegged to ${formatEth(targetWei)} ETH`);
  }
}

main().catch((error) => {
  console.error(`repeg failed: ${error.message}`);
  process.exit(1);
});
