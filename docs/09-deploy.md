# Deploying to Netlify

The site, the image upload endpoint and the indexer all deploy together. Netlify
builds from a git repository, so that comes first.

## 1. Put the project in git

The project is not a repository yet.

```bash
cd "New Project Claude"
git init
git add .
git commit -m "Puns: contracts, marketing site, app and indexer"
```

Before pushing, confirm no secret is in the commit. `.env` is ignored, but check
rather than assume:

```bash
git ls-files | grep -E "^\.env$|private|secret" || echo "clean"
```

That must print `clean`. If `.env` appears, stop and fix `.gitignore` first: a
key pushed to a remote is a key that has to be rotated, whether or not the
repository is public.

Then create an empty repository on GitHub and push:

```bash
git remote add origin git@github.com:<you>/puns.git
git branch -M main
git push -u origin main
```

## 2. Create the Netlify site

In Netlify, **Add new site → Import an existing project**, pick the repository,
then set:

| Setting | Value |
| --- | --- |
| Base directory | `apps/web` |
| Build command | `npm run build` |
| Publish directory | `dist` |
| Functions directory | `netlify/functions` |

The base directory matters. This is a monorepo, and without it Netlify builds
the root, finds no app, and fails. Everything else is already in
`apps/web/netlify.toml`, so Netlify will pick those up on its own.

## 3. Set the environment variables

**Site configuration → Environment variables.** The local `.env` is not
committed, so nothing carries over; these have to be entered here.

Reaches the browser. Anything with a `VITE_` prefix is public in the bundle, so
never put a key behind one:

```
VITE_REOWN_PROJECT_ID          your Reown project id
VITE_RPC_MAINNET               your private endpoint
VITE_RPC_FALLBACKS             https://rpc.mainnet.chain.robinhood.com
VITE_CHAIN_ID                  4663
VITE_EXPLORER_URL              https://robinhoodchain.blockscout.com
VITE_PUNS_PASS_ADDRESS         0x6d050DB66e3317C810Cfe52AA8A0b52b6fA28231
VITE_LAUNCH_FACTORY_ADDRESS    0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e
VITE_LAUNCH_AND_BUY_ADDRESS    0xe33E9E479dF8802cb0866d5d05258bEc4cF62948
VITE_IPFS_GATEWAY              https://gateway.pinata.cloud/ipfs/
```

Stays on the server. These are read by the functions and never sent to a
browser:

```
PINATA_JWT                     pins uploaded token images
INDEXER_RPC_URL                endpoint the indexer walks the chain with
LAUNCH_FACTORY_ADDRESS         0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e
INDEXER_LOG_CHUNK              9
INDEXER_REQUESTS_PER_RUN       90
INDEXER_CONCURRENCY            6
```

`VITE_INDEXER_URL` can be left unset. The app defaults to the function on the
same site, which is where it will be.

## 4. Deploy

Trigger a deploy. Netlify installs, builds, and publishes `dist`, and picks up
the three functions from `netlify/functions`.

Netlify Blobs needs no setup at all. It is available to deployed functions
automatically, which is the reason the indexer uses it instead of a database.

## 5. Check that it worked

**The site.** Open it. The marketing page and `/docs` should render, and the
Connect button in the app should open the Reown modal rather than a wallet
directly. If it says "Wallet unavailable", `VITE_REOWN_PROJECT_ID` did not
reach the build.

**The indexer.** Its first run happens within a minute of deploying. Check it:

```
https://<your-site>/.netlify/functions/launches
```

Expect JSON. Immediately after the first deploy it will read
`{"launches":[],"total":0,...}` with a non-null `indexedFrom`, because the
indexer starts at the head of the chain and accumulates forward. `total` climbs
as launches happen.

`indexedFrom` is the last block it has covered. Compare it with the chain head:
if the gap keeps growing, the indexer is falling behind and
`INDEXER_REQUESTS_PER_RUN` needs raising.

**The upload.** Open `/app/create` and choose an image. It should say `pinned`
with an `ipfs://` URI. If it reports that pinning is not configured, `PINATA_JWT`
is missing from the environment.

## 6. Point the domain

**Domain management → Add a custom domain → `punsfun.app`.** Follow Netlify's
DNS instructions, and let it issue the certificate. The site already declares
`https://punsfun.app/` as its canonical URL and in its Open Graph tags, so
nothing in the code needs changing.

---

## What the indexer can and cannot see

It catches every launch from the moment it first runs. Launches from before
that stay invisible.

That is not a bug in the indexer, it is the provider's limit: a free tier caps a
single `eth_getLogs` call at around nine blocks, and this chain produces a block
every 0.1 seconds. Walking forward at that size keeps pace comfortably, at 810
blocks a minute against a chain producing 583. Walking *backwards* through a day
of history at the same size would take about a day.

To see older launches, one of:

- a provider plan that permits a wide `getLogs` range, set as `VITE_RPC_LOGS`,
  which lets the browser fall back to scanning directly
- a one-off backfill run against such an endpoint, writing into the same store
- accepting the feed as forward-only, which for a launchpad is defensible: what
  people come to see is what launched recently

## Costs

| | |
| --- | --- |
| Netlify | Free tier covers the site, the functions and Blobs at this size |
| Scheduled function | One run a minute, roughly 43,000 runs a month |
| RPC | ~90 `eth_getLogs` a minute. Confirm this against the provider's monthly compute allowance before relying on it. |
| Pinata | Free tier is enough until token images become numerous |

The RPC line is the one worth checking before launch. A rate that is fine per
second can still exhaust a monthly quota.
