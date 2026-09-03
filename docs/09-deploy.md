# Deploying to Netlify

The site, the image upload endpoint and the indexer deploy together as one
Netlify site. The repository is already pushed:

**https://github.com/Trixen-AI/puns**

## 1. Create the site

In Netlify, **Add new site → Import an existing project → GitHub**, authorise
access to `Trixen-AI/puns`, and pick it.

Netlify will guess the build settings and guess wrong, because this is a
monorepo. Set them by hand:

| Setting | Value |
| --- | --- |
| Base directory | `apps/web` |
| Build command | `npm run build` |
| Publish directory | `dist` |
| Functions directory | `netlify/functions` |

The base directory is the one that matters. Without it Netlify builds the
repository root, finds no application, and fails. Everything else is already in
`apps/web/netlify.toml` and will be picked up automatically.

## 2. Set the environment variables

**Site configuration → Environment variables → Add a variable → Import from a
.env file** is the fastest route, but do not import your local `.env` wholesale:
it contains a deployer private key that has no business on a build server.

Add these instead.

### Reaches the browser

Anything prefixed `VITE_` is compiled into the JavaScript bundle and is public.
Never put a key behind one.

```
VITE_REOWN_PROJECT_ID          your Reown project id
VITE_RPC_MAINNET               your private RPC endpoint
VITE_RPC_FALLBACKS             https://rpc.mainnet.chain.robinhood.com
VITE_CHAIN_ID                  4663
VITE_EXPLORER_URL              https://robinhoodchain.blockscout.com
VITE_PUNS_PASS_ADDRESS         0x6d050DB66e3317C810Cfe52AA8A0b52b6fA28231
VITE_LAUNCH_FACTORY_ADDRESS    0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e
VITE_LAUNCH_AND_BUY_ADDRESS    0xe33E9E479dF8802cb0866d5d05258bEc4cF62948
VITE_IPFS_GATEWAY              https://gateway.pinata.cloud/ipfs/
```

Leave `VITE_INDEXER_URL` unset. The app defaults to the function on the same
site, which is where it will be.

> A variable set to an empty string is not the same as one left out. The app
> treats blank as unset now, but the clearer habit is to omit what you do not
> need rather than adding it empty.

### Stays on the server

Read by the functions, never sent to a browser.

```
PINATA_JWT                     pins uploaded token images
INDEXER_RPC_URL                the endpoint the indexer walks the chain with
LAUNCH_FACTORY_ADDRESS         0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e
INDEXER_LOG_CHUNK              9
INDEXER_REQUESTS_PER_RUN       90
INDEXER_CONCURRENCY            6
```

`INDEXER_LOG_CHUNK` is the provider's cap, not a preference. Nine blocks per
request at ninety requests a minute covers 810 blocks against a chain producing
about 583, so the indexer keeps pace with room to spare. Raise
`INDEXER_REQUESTS_PER_RUN` if it starts falling behind; lower it if the provider
complains.

**Never add** `DEPLOYER_PRIVATE_KEY` or `PRICER_PRIVATE_KEY`. Nothing that runs
on Netlify signs a transaction.

## 3. Deploy

Trigger the deploy. Netlify installs, builds, publishes `dist`, and registers
the three functions.

Netlify Blobs needs no setup. It is available to deployed functions
automatically, which is why the indexer uses it instead of a database.

## 4. Check it worked

**The site.** Open it. The marketing page and `/docs` should render, and
Connect in the app should open the Reown modal. "Wallet unavailable" means
`VITE_REOWN_PROJECT_ID` did not reach the build.

**The indexer.** Its first run happens within a minute. Check it directly:

```
https://<your-site>/.netlify/functions/launches
```

Expect JSON. Right after the first deploy it reads `{"launches":[],"total":0}`
with a non-null `indexedFrom`, because the indexer starts at the head of the
chain and accumulates forward. `total` climbs as launches happen.

Compare `indexedFrom` with the chain head. A gap that keeps growing means the
indexer is falling behind.

**The upload.** Open `/app/create` and choose an image. It should say `pinned`
with an `ipfs://` URI. A message about pinning not being configured means
`PINATA_JWT` is missing.

## 5. Point the domain

**Domain management → Add a custom domain → `punsfun.app`.** Follow Netlify's
DNS instructions and let it issue the certificate. Set `punsfun.app` as the
primary domain so `www` redirects to it.

`netlify.toml` already redirects `www` and the `.netlify.app` subdomain to the
apex, and the site declares `https://punsfun.app/` as canonical, so nothing in
the code needs changing.

Add `punsfun.app` to the allowed domains in your Reown project as well. Wallets
check the origin, and a domain the project does not recognise will be refused.

---

## What the indexer can and cannot see

It catches every launch from the moment it first runs. Launches from before
that stay invisible.

That is the provider's limit rather than a defect: a free tier caps a single
`eth_getLogs` call at nine blocks, and this chain produces a block every 0.1
seconds. Walking forward at that size keeps pace comfortably. Walking backwards
through a day of history at the same size would take about a day.

To see older launches, one of:

- a provider plan permitting a wide `getLogs` range, set as `VITE_RPC_LOGS`,
  which lets the browser scan directly as a fallback
- a one-off backfill against such an endpoint, writing into the same store
- accepting the feed as forward-only, which for a launchpad is defensible

## Costs

| | |
| --- | --- |
| Netlify | Free tier covers the site, functions and Blobs at this size |
| Scheduled function | One run a minute, about 43,000 a month |
| RPC | ~90 `eth_getLogs` a minute. Check this against the provider's monthly compute allowance before relying on it. |
| Pinata | Free tier is enough until token images become numerous |

The RPC line is the one to verify before launch. A rate that is comfortable per
second can still exhaust a monthly quota.

## Redeploying

Netlify rebuilds on every push to `main`. Changing an environment variable does
not rebuild on its own: use **Deploys → Trigger deploy → Clear cache and deploy
site**, because `VITE_` values are compiled into the bundle at build time.
