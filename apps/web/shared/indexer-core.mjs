/**
 * The indexing logic, shared by the deployed function and the dev server.
 *
 * Written once and given a store rather than reaching for one, so the Netlify
 * build and `npm run dev` run identical code against different storage. When
 * the two diverge, the thing you tested locally is not the thing you shipped.
 */

export const TOPIC_TOKEN_LAUNCHED =
  "0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607";

export const SHARD_SIZE = 500;
export const META_KEY = "meta";

const hex = (n) => `0x${n.toString(16)}`;

export function makeRpc(url) {
  return async function rpc(method, params) {
    const response = await fetch(url, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({jsonrpc: "2.0", id: 1, method, params}),
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json();
    if (payload.error) throw new Error(payload.error.message ?? "rpc error");
    return payload.result;
  };
}

/** Decode a TokenLaunched log. Indexed args are topics; the rest is data. */
export function decodeLaunch(log) {
  const addr = (topic) => `0x${topic.slice(26)}`;
  const data = log.data.replace(/^0x/, "");
  const word = (i) => data.slice(i * 64, (i + 1) * 64);
  const trimmed = word(2).replace(/^0+/, "");

  return {
    token: addr(log.topics[1]),
    curve: addr(log.topics[2]),
    deployer: addr(log.topics[3]),
    pairToken: `0x${word(0).slice(24)}`,
    graduationThreshold: `0x${trimmed || "0"}`,
    block: Number(BigInt(log.blockNumber)),
  };
}

/** Run tasks with a ceiling on how many are in flight. */
async function pooled(tasks, limit) {
  const results = [];
  let cursor = 0;
  const workers = Array.from({length: Math.min(limit, tasks.length)}, async () => {
    while (cursor < tasks.length) {
      const index = cursor++;
      results[index] = await tasks[index]();
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Advance the index by one run.
 *
 * @param store  {get(key), set(key, value)} holding JSON
 * @param opts   rpcUrl, factory, chunk, requestsPerRun, concurrency
 */
export async function advance(store, opts) {
  const rpc = makeRpc(opts.rpcUrl);

  const meta = (await store.get(META_KEY)) ?? {lastBlock: null, total: 0, shards: 0};
  const head = BigInt(await rpc("eth_blockNumber", []));

  // The first run starts at the head. Backfilling from genesis at this chunk
  // size would take longer than the chain has existed.
  let from = meta.lastBlock === null ? head : BigInt(meta.lastBlock) + 1n;
  if (from > head) {
    return {status: "up to date", head: Number(head), total: meta.total, found: 0};
  }

  const chunk = BigInt(opts.chunk);
  const ranges = [];
  for (let i = 0; i < opts.requestsPerRun && from <= head; i++) {
    const to = from + chunk - 1n > head ? head : from + chunk - 1n;
    ranges.push([from, to]);
    from = to + 1n;
  }

  let failures = 0;
  const batches = await pooled(
    ranges.map(([fromBlock, toBlock]) => async () => {
      try {
        return await rpc("eth_getLogs", [
          {
            address: opts.factory,
            topics: [TOPIC_TOKEN_LAUNCHED],
            fromBlock: hex(fromBlock),
            toBlock: hex(toBlock),
          },
        ]);
      } catch {
        failures += 1;
        return [];
      }
    }),
    opts.concurrency,
  );

  // A run where nothing succeeded must not advance the cursor, or those blocks
  // are skipped permanently.
  if (failures === ranges.length && ranges.length > 0) {
    return {status: "rpc refused every request", advanced: false, failures};
  }

  const found = batches.flat().map(decodeLaunch);
  const reached = ranges.at(-1)?.[1] ?? head;

  if (found.length > 0) {
    let shardIndex = Math.max(0, meta.shards - 1);
    let shard = (await store.get(`shard/${shardIndex}`)) ?? [];

    for (const launch of found) {
      if (shard.length >= SHARD_SIZE) {
        await store.set(`shard/${shardIndex}`, shard);
        shardIndex += 1;
        shard = [];
      }
      shard.push(launch);
    }

    await store.set(`shard/${shardIndex}`, shard);
    meta.shards = shardIndex + 1;
    meta.total += found.length;
  }

  meta.lastBlock = Number(reached);
  meta.updatedAt = new Date().toISOString();
  await store.set(META_KEY, meta);

  return {
    status: "ok",
    scanned: ranges.length,
    failures,
    found: found.length,
    lastBlock: meta.lastBlock,
    head: Number(head),
    behind: Number(head) - meta.lastBlock,
    total: meta.total,
  };
}

/**
 * Read one page, newest first.
 *
 * Shards are written oldest to newest, so walking them backwards and reversing
 * each gives that order without sorting. Only enough shards are touched to fill
 * the page that was asked for.
 */
export async function readPage(store, page, limit) {
  const meta = await store.get(META_KEY);

  if (!meta || meta.shards === 0) {
    return {
      launches: [],
      total: 0,
      page,
      limit,
      hasMore: false,
      indexedFrom: meta?.lastBlock ?? null,
      updatedAt: meta?.updatedAt ?? null,
    };
  }

  const skip = page * limit;
  if (skip >= meta.total) {
    return {
      launches: [],
      total: meta.total,
      page,
      limit,
      hasMore: false,
      indexedFrom: meta.lastBlock,
      updatedAt: meta.updatedAt ?? null,
    };
  }

  const collected = [];
  let seen = 0;

  for (let index = meta.shards - 1; index >= 0 && collected.length < limit; index--) {
    const shard = (await store.get(`shard/${index}`)) ?? [];
    for (const entry of shard.slice().reverse()) {
      if (seen++ < skip) continue;
      collected.push(entry);
      if (collected.length >= limit) break;
    }
  }

  return {
    launches: collected,
    total: meta.total,
    page,
    limit,
    hasMore: skip + collected.length < meta.total,
    indexedFrom: meta.lastBlock,
    updatedAt: meta.updatedAt ?? null,
  };
}
