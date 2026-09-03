/**
 * Marketing copy and the facts behind it.
 *
 * Every number here was read from live chain state, not estimated. If a value
 * changes on chain, it changes here first. See docs/03-launch-core.md.
 */

export const site = {
  name: "Puns",
  domain: "punsfun.app",
  url: "https://punsfun.app",
  x: "https://x.com/PunsApp_",
  xHandle: "@PunsApp_",
};

export const PUNS_PASS_ADDRESS = "0x6d050DB66e3317C810Cfe52AA8A0b52b6fA28231";
export const CHAIN_ID = 4663;
export const EXPLORER = "https://robinhoodchain.blockscout.com";

export const nav = [
  {label: "How it works", href: "/#how"},
  {label: "Fair entry", href: "/#fair-entry"},
  {label: "Pass", href: "/#pass"},
  {label: "Docs", href: "/docs"},
];

export const appTabs = [
  {to: "/app", label: "Explore", end: true},
  {to: "/app/create", label: "Create"},
  {to: "/app/pass", label: "Pass"},
  {to: "/app/portfolio", label: "Portfolio"},
];

export const hero = {
  headline: "Every launch starts on the same curve",
  headlineQuiet: "and ends in a pool nobody can drain.",
  lede: "Puns is a launchpad for meme tokens. There is no presale, no team allocation, and no liquidity anyone can pull out later.",
};

/**
 * The shape of every launch. Uniform by construction: the same supply, the
 * same opening price, the same graduation target, so understanding one launch
 * is understanding all of them.
 */
export const launchFacts = [
  {label: "Total supply", value: "1,000,000,000", note: "Fixed at creation. Nothing can mint more."},
  {label: "Sold on the curve", value: "714,285,714", note: "71.43% of supply, available to anyone."},
  {label: "Held back for the pool", value: "285,714,285", note: "28.57%, becomes locked liquidity."},
  {label: "Opening price", value: "1.68 gwei", note: "Never zero. The first buyer pays a real price."},
  {label: "Graduates at", value: "4.2 ETH", note: "When the curve sells out."},
  {label: "Rise to graduation", value: "12.25×", note: "Identical for every launch, by arithmetic."},
];

export const lifecycle = [
  {
    title: "Create",
    body: "Name it, give it an image, set your fee. The entire supply mints straight to the curve, so there is no allocation to argue about.",
  },
  {
    title: "Trade the curve",
    body: "Anyone can buy. Price rises as people buy and falls as they sell, and you can always sell back to the curve while it is open.",
  },
  {
    title: "Graduate",
    body: "Once the curve sells out, the collected ETH and the held-back tokens become a Uniswap pool. It happens inside the buy that fills the curve.",
  },
  {
    title: "Pool",
    body: "Trading carries on as an ordinary pool. The liquidity is locked permanently, and the token in your wallet is the same token it was before.",
  },
];

export const safety = {
  title: "There is no withdraw function",
  body: "Rug pulls almost always work the same way: the creator removes the liquidity. On a graduated launch that is not a policy, a promise, or a timelock. The function to do it does not exist in the contract.",
  points: [
    {
      label: "What a creator can change",
      value: "Where their fees are paid, and whether buybacks are on.",
    },
    {
      label: "What a creator cannot change",
      value: "Supply, pricing, the pairing asset, the fee they set at launch, or the terms of graduation.",
    },
  ],
};

export const fairEntry = {
  title: "The first five seconds",
  body: "New launches carry a tax on buys that starts at 99% and decays to zero over five seconds. It exists to make sniping unprofitable, and nothing on chain warns an ordinary person about it.",
  resolution:
    "Puns reads that tax for your wallet and shows it in ETH before you sign anything. The buy button stays off until it clears, and you can schedule a buy for the moment it does.",
  decay: [
    {at: "0s", tax: "99%"},
    {at: "1s", tax: "≈25%"},
    {at: "2s", tax: "≈3%"},
    {at: "5s", tax: "0%"},
  ],
};

export const pass = {
  title: "Puns Pass",
  body: "An on-chain pass that unlocks presentation and analysis. It never gates creating, buying, selling or claiming. Those stay permissionless, and any interface that gated them would simply be routed around.",
  tiers: [
    {
      name: "Creator",
      price: "0.004 ETH",
      usd: "$10",
      term: "Lifetime",
      for: "For people launching tokens",
      includes: [
        "Banner and extended description on your token page",
        "Pinned announcement",
        "Rotation in the promoted row",
        "One purchase covers every launch from your wallet",
      ],
    },
    {
      name: "Pro",
      price: "0.0032 ETH",
      usd: "$8",
      term: "30 days",
      for: "For people trading",
      includes: [
        "Holder cohorts and early-buyer tracking",
        "Creator history and wallet labels",
        "Scheduled buys, price and graduation alerts",
        "Authenticated access to the Puns index",
      ],
    },
  ],
  note: "Prices are held in ETH and adjusted to track their dollar figure.",
};

