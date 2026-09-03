import {useMemo, useState} from "react";
import {envStr} from "@/lib/env";
import {useAccount, useReadContracts, useWaitForTransactionReceipt, useWriteContract} from "wagmi";
import {isAddress, parseEther, toHex, type Address} from "viem";
import {factoryAbi, launchAndBuyAbi} from "@/lib/abi";
import {contracts, explorerTx} from "@/lib/chain";
import {eth} from "@/lib/format";
import {ImageUpload} from "@/components/app/ImageUpload";
import {Failed} from "@/components/app/States";

/**
 * Creating a launch.
 *
 * Two decisions on this form can never be undone, and both are stated where
 * they are made rather than in a tooltip: the creator fee is fixed at launch,
 * and the list of addresses exempt from the opening tax is fixed with it.
 *
 * Economics are pinned immediately before sending. The contract rejects a stale
 * pin, which is a feature: the terms cannot shift between the preview a creator
 * read and the transaction they signed.
 */

const NATIVE = "0x0000000000000000000000000000000000000000" as const;
const CONFIG_ID = 0n;
const EMPTY_SOCIALS = {twitter: "", telegram: "", discord: "", website: "", farcaster: ""};

type Form = {
  name: string;
  symbol: string;
  logo: string;
  description: string;
  twitter: string;
  telegram: string;
  website: string;
  taxPercent: number;
  buyback: boolean;
  firstBuy: string;
  exemptions: string[];
};

export default function Create() {
  const factory = contracts.factory;
  const launcher = contracts.launchAndBuy;
  const {address, isConnected} = useAccount();

  const [form, setForm] = useState<Form>({
    name: "",
    symbol: "",
    logo: "",
    description: "",
    twitter: "",
    telegram: "",
    website: "",
    taxPercent: 0,
    buyback: true,
    firstBuy: "",
    exemptions: [],
  });
  const [draftExemption, setDraftExemption] = useState("");

  const {data: chainData} = useReadContracts({
    query: {enabled: Boolean(factory), staleTime: 30_000},
    contracts: factory
      ? [
          {address: factory, abi: factoryAbi, functionName: "launchFee"},
          {address: factory, abi: factoryAbi, functionName: "maxCreatorTaxBps"},
          {
            address: factory,
            abi: factoryAbi,
            functionName: "previewLaunchEconomics",
            args: [CONFIG_ID, NATIVE],
          },
          {address: factory, abi: factoryAbi, functionName: "canLaunch", args: [address ?? NATIVE]},
        ]
      : [],
  });

  const launchFee = (chainData?.[0]?.result as bigint | undefined) ?? 0n;
  const maxTaxPercent = Number((chainData?.[1]?.result as number | undefined) ?? 1000) / 100;
  const economics = chainData?.[2]?.result as `0x${string}` | undefined;
  const canLaunch = (chainData?.[3]?.result as boolean | undefined) ?? true;

  const {writeContract, data: hash, isPending, error} = useWriteContract();
  const receipt = useWaitForTransactionReceipt({hash});

  const firstBuyWei = useMemo(() => {
    const trimmed = form.firstBuy.trim();
    if (!trimmed) return 0n;
    try {
      return parseEther(trimmed);
    } catch {
      return 0n;
    }
  }, [form.firstBuy]);

  const needsLauncher = firstBuyWei > 0n || form.exemptions.length > 0;
  const totalCost = launchFee + firstBuyWei;

  if (!factory) {
    return (
      <div className="page py-20">
        <Failed body="Puns is not finished setting up on this address yet. Nothing is wrong with your wallet." />
      </div>
    );
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({...f, [key]: value}));

  const addExemption = () => {
    const candidate = draftExemption.trim();
    if (!isAddress(candidate)) return;
    if (form.exemptions.some((a) => a.toLowerCase() === candidate.toLowerCase())) return;
    set("exemptions", [...form.exemptions, candidate]);
    setDraftExemption("");
  };

  const params = () => ({
    name: form.name.trim(),
    symbol: form.symbol.trim().toUpperCase(),
    logo: form.logo.trim(),
    description: form.description.trim(),
    socials: {
      ...EMPTY_SOCIALS,
      twitter: form.twitter.trim(),
      telegram: form.telegram.trim(),
      website: form.website.trim(),
    },
    creatorFeeRecipient: address as Address,
    creatorTaxBps: Math.round(form.taxPercent * 100),
    buybackEnabled: form.buyback,
    expectedEconomics: economics!,
    salt: toHex(crypto.getRandomValues(new Uint8Array(32))),
  });

  const submit = () => {
    if (!economics || !address) return;

    if (needsLauncher) {
      if (!launcher) return;
      writeContract({
        address: launcher,
        abi: launchAndBuyAbi,
        functionName: "launchAndBuy",
        args: [
          params(),
          CONFIG_ID,
          NATIVE,
          firstBuyWei,
          // The creator is exempt from the opening tax automatically, so the
          // first buy cannot be sniped out from under them by the decay curve.
          0n,
          address,
          form.exemptions as Address[],
        ],
        value: totalCost,
      });
      return;
    }

    writeContract({
      address: factory,
      abi: factoryAbi,
      functionName: "launchToken",
      args: [params(), CONFIG_ID, NATIVE],
      value: launchFee,
    });
  };

  const ready =
    form.name.trim().length > 0 &&
    form.symbol.trim().length > 0 &&
    Boolean(economics) &&
    (!needsLauncher || Boolean(launcher));

  return (
    <div className="page py-12">
      <div className="max-w-[44rem]">
        <h1 className="display-2">Launch a token</h1>
        <p className="prose-tight mt-4">
          The whole supply mints to the curve. You start with none of it, and so
          does everyone else.
        </p>
      </div>

      {!canLaunch && (
        <p className="row mt-10 py-5 text-ink">
          This address cannot create a launch right now. Launching is
          permissionless today, so if you are seeing this the restriction was
          turned on upstream.
        </p>
      )}

      <div className="mt-12 grid gap-14 lg:grid-cols-[minmax(0,36rem)_minmax(0,1fr)] lg:gap-20">
        <form
          className="min-w-0"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Group title="The token">
            <Field label="Name">
              <input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                maxLength={64}
                className="input"
                placeholder="Sixty Seconds"
              />
            </Field>

            <Field
              label="Symbol"
              hint="Not unique. Nothing stops another launch using the same one, which is why the address matters more."
            >
              <input
                value={form.symbol}
                onChange={(e) => set("symbol", e.target.value.toUpperCase())}
                maxLength={11}
                className="input font-mono"
                placeholder="SIXTY"
              />
            </Field>

            <Field label="Image">
              <ImageUpload value={form.logo} onChange={(uri) => set("logo", uri)} />
            </Field>

            <Field label="Description">
              <textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                rows={3}
                maxLength={500}
                className="input resize-y"
                placeholder="What is this."
              />
            </Field>
          </Group>

          <Group title="Links" note="All optional.">
            <Field label="X">
              <input
                value={form.twitter}
                onChange={(e) => set("twitter", e.target.value)}
                className="input"
                placeholder="https://x.com/..."
              />
            </Field>
            <Field label="Telegram">
              <input
                value={form.telegram}
                onChange={(e) => set("telegram", e.target.value)}
                className="input"
                placeholder="https://t.me/..."
              />
            </Field>
            <Field label="Website">
              <input
                value={form.website}
                onChange={(e) => set("website", e.target.value)}
                className="input"
                placeholder="https://"
              />
            </Field>
          </Group>

          <Group title="Your terms">
            <Field
              label="Your fee"
              hint="Taken on every trade and paid to you. Fixed the moment you launch: it can never be raised, and it can never be lowered."
            >
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={0}
                  max={maxTaxPercent}
                  step={0.25}
                  value={form.taxPercent}
                  onChange={(e) => set("taxPercent", Number(e.target.value))}
                  className="flex-1 accent-ink-deep"
                />
                <span className="w-16 text-right font-mono text-[0.9375rem] text-ink-deep">
                  {form.taxPercent.toFixed(2)}%
                </span>
              </div>
              {form.taxPercent > 5 && (
                <p className="meta mt-2">
                  Above 5% will put buyers off. They see this number before they trade.
                </p>
              )}
            </Field>

            <Field label="Buybacks" hint="Funded from your own fee, not from anyone else's.">
              <label className="flex cursor-pointer items-center gap-2.5 text-ink-muted">
                <input
                  type="checkbox"
                  checked={form.buyback}
                  onChange={(e) => set("buyback", e.target.checked)}
                  className="accent-ink-deep"
                />
                Spend part of my fee buying the token back
              </label>
            </Field>
          </Group>

          <Group
            title="The opening window"
            note="Buys in the first five seconds are taxed, starting at 99% and decaying to nothing. You are exempt automatically."
          >
            <Field
              label="Your first buy"
              hint="Bought in the same transaction as the launch, before anyone else can reach it. Leave empty to skip."
            >
              <div className="flex items-center gap-3">
                <input
                  value={form.firstBuy}
                  onChange={(e) => set("firstBuy", e.target.value.replace(/[^0-9.]/g, ""))}
                  inputMode="decimal"
                  className="input font-mono"
                  placeholder="0.0"
                />
                <span className="meta shrink-0">ETH</span>
              </div>
            </Field>

            <Field
              label="Exempt addresses"
              hint="Other wallets that should also skip the opening tax, for a team buying together. This list is written once, at creation, and can never be added to afterwards."
            >
              <div className="flex items-center gap-2">
                <input
                  value={draftExemption}
                  onChange={(e) => setDraftExemption(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addExemption();
                    }
                  }}
                  className="input font-mono"
                  placeholder="0x"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={addExemption}
                  disabled={!isAddress(draftExemption.trim())}
                  className="btn btn-quiet shrink-0"
                >
                  Add
                </button>
              </div>

              {draftExemption.trim().length > 0 && !isAddress(draftExemption.trim()) && (
                <p className="meta mt-2">That is not a valid address.</p>
              )}

              {form.exemptions.length > 0 && (
                <ul className="mt-4">
                  {form.exemptions.map((addr) => (
                    <li
                      key={addr}
                      className="flex items-center justify-between gap-4 border-t border-rule-soft py-2.5"
                    >
                      <span className="truncate font-mono text-xs text-ink-muted">{addr}</span>
                      <button
                        type="button"
                        onClick={() =>
                          set(
                            "exemptions",
                            form.exemptions.filter((a) => a !== addr),
                          )
                        }
                        className="meta shrink-0 underline underline-offset-4 hover:text-ink"
                      >
                        remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {needsLauncher && !launcher && (
                <p className="meta mt-3">
                  Buying at launch and exempt addresses are unavailable right
                  now. You can still launch without them.
                </p>
              )}
            </Field>
          </Group>

          <div className="mt-10 border-t border-rule pt-8">
            <button
              type="submit"
              disabled={!ready || isPending || !canLaunch || !isConnected}
              className="btn btn-solid"
              title={isConnected ? undefined : "Connect a wallet from the header first"}
            >
              {!isConnected
                ? "Connect to launch"
                : isPending
                  ? "Confirm in your wallet"
                  : "Launch"}
            </button>

            <p className="meta mt-3">
              {eth(totalCost)} ETH plus gas
              {firstBuyWei > 0n ? ` · ${eth(launchFee)} fee, ${eth(firstBuyWei)} first buy` : ""}
            </p>
          </div>

          {hash && (
            <div className="row mt-8 py-5">
              <p className="text-ink">
                {receipt.isSuccess
                  ? "Launched"
                  : receipt.isError
                    ? "That transaction failed"
                    : "Waiting for confirmation"}
              </p>
              <a
                href={explorerTx(hash)}
                target="_blank"
                rel="noreferrer"
                className="meta mt-1 block break-all underline decoration-rule underline-offset-4 hover:text-ink"
              >
                {hash}
              </a>
            </div>
          )}

          {error && !hash && (
            <p className="row mt-8 py-5 text-ink">
              {error.message.includes("User rejected")
                ? "You cancelled that in your wallet."
                : "The wallet refused that transaction. Check your balance, then try again."}
            </p>
          )}
        </form>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="meta mb-4">how it will look</p>
          <PreviewCard form={form} />

          <p className="meta mt-10 mb-4">what you are agreeing to</p>
          <dl>
            {[
              ["Supply", "1,000,000,000, all of it to the curve"],
              ["You receive", "Nothing at launch. Buy like anyone else."],
              ["Opening price", "1.68 gwei per token"],
              ["Graduates at", "4.2 ETH raised"],
              ["Trading fee", "1% to the protocol"],
              ["Your fee", `${form.taxPercent.toFixed(2)}%, permanent`],
              [
                "Exempt addresses",
                form.exemptions.length === 0
                  ? "None, and none can be added later"
                  : `${form.exemptions.length}, permanent`,
              ],
            ].map(([label, value]) => (
              <div key={label} className="row py-3.5">
                <dt className="text-ink">{label}</dt>
                <dd className="prose-tight mt-0.5">{value}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>
    </div>
  );
}

/** The token as it will appear in the Explore list. */
function PreviewCard({form}: {form: Form}) {
  const gateway = envStr(import.meta.env.VITE_IPFS_GATEWAY, "https://gateway.pinata.cloud/ipfs/");
  const src = form.logo.startsWith("ipfs://") ? `${gateway}${form.logo.slice(7)}` : form.logo;

  return (
    <div className="border-y border-rule py-5">
      <div className="flex items-center gap-4">
        {src ? (
          <img src={src} alt="" className="h-10 w-10 shrink-0 rounded-[2px] object-cover" />
        ) : (
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[2px] bg-paper-block">
            <span className="meta">{form.symbol.slice(0, 2) || "--"}</span>
          </div>
        )}

        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <p className="truncate text-ink">{form.name || "Your token"}</p>
            <p className="meta shrink-0">{form.symbol || "SYMBOL"}</p>
            {form.taxPercent > 0 && (
              <p className="meta shrink-0">+{form.taxPercent.toFixed(2)}%</p>
            )}
          </div>
          <p className="meta">1.68 gwei · 0.0% to graduation</p>
        </div>
      </div>
    </div>
  );
}

function Group({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-12">
      <h2 className="display-3 mb-1">{title}</h2>
      {note && <p className="prose-tight mb-4 text-[0.8125rem]">{note}</p>}
      <div className={note ? "" : "mt-4"}>{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="row py-5">
      <p className="mb-1 text-ink">{label}</p>
      {hint && <p className="prose-tight mb-3 text-[0.8125rem]">{hint}</p>}
      {children}
    </div>
  );
}
