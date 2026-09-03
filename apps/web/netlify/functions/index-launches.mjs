import {getStore} from "@netlify/blobs";
import {advance} from "../../shared/indexer-core.mjs";

/**
 * Walks the chain forward on a schedule so the browser never has to.
 *
 * The provider caps a single eth_getLogs call at a handful of blocks, which is
 * far too little for a browser starting from nothing on every page load. This
 * remembers where it stopped, advances a little further each minute, and never
 * re-reads a block it has covered.
 *
 * It stores only what cannot be asked again cheaply: the list of addresses.
 * Names, images, prices and progress are read live in the browser by multicall,
 * which is not rate limited, so nothing that can change is duplicated here.
 *
 * Storage is Netlify Blobs, a key-value store that needs no server and no
 * migrations. The logic itself lives in shared/indexer-core.mjs so the dev
 * server can run exactly the same code against a file.
 */

const blobStore = () => {
  const store = getStore("puns-launches");
  return {
    get: (key) => store.get(key, {type: "json"}),
    set: (key, value) => store.setJSON(key, value),
  };
};

export default async function handler() {
  const result = await advance(blobStore(), {
    rpcUrl:
      process.env.INDEXER_RPC_URL ??
      process.env.RPC_MAINNET_ALCHEMY ??
      "https://rpc.mainnet.chain.robinhood.com",
    factory:
      process.env.LAUNCH_FACTORY_ADDRESS ??
      "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e",
    chunk: Number(process.env.INDEXER_LOG_CHUNK ?? 9),
    requestsPerRun: Number(process.env.INDEXER_REQUESTS_PER_RUN ?? 90),
    concurrency: Number(process.env.INDEXER_CONCURRENCY ?? 6),
  });

  return new Response(JSON.stringify(result), {
    status: result.advanced === false ? 502 : 200,
    headers: {"content-type": "application/json"},
  });
}

export const config = {
  schedule: "* * * * *",
};
