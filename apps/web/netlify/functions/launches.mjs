import {getStore} from "@netlify/blobs";
import {readPage} from "../../shared/indexer-core.mjs";

/**
 * Serves the indexed launch list, newest first.
 *
 * The reading logic is shared with the dev server, so what you test locally is
 * what runs here.
 */

const MAX_LIMIT = 100;

const clamp = (value, min, max) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

export default async function handler(request) {
  const url = new URL(request.url);
  const limit = clamp(Number(url.searchParams.get("limit") ?? 25), 1, MAX_LIMIT);
  const page = Math.max(0, Number(url.searchParams.get("page") ?? 0) || 0);

  const store = getStore("puns-launches");
  const payload = await readPage(
    {
      get: (key) => store.get(key, {type: "json"}),
      set: (key, value) => store.setJSON(key, value),
    },
    page,
    limit,
  );

  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json",
      // The list changes at most once a minute, so a short shared cache spares
      // the store a great many identical reads.
      "cache-control": "public, max-age=15, stale-while-revalidate=60",
    },
  });
}
