import {defineConfig, loadEnv, type Plugin} from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import fs from "node:fs/promises";

/**
 * One environment file, at the repository root.
 *
 * Vite reads .env from its own directory by default, which in a monorepo means
 * a second file that looks identical to the one at the root and silently wins
 * or silently loses. Pointing envDir at the root removes the duplicate: there
 * is one file to edit, and it is the obvious one.
 */
const HERE = import.meta.dirname;
const ROOT = path.resolve(HERE, "../..");

/* -------------------------------------------------------------------------- */

/**
 * Image pinning during development.
 *
 * In production this endpoint is a Netlify function. Locally there is no
 * Netlify runtime, so the dev server serves the same route. Without this,
 * uploads only work on the deployed site and the create form cannot be
 * finished by hand.
 *
 * The credential is read with loadEnv and never given a VITE_ prefix, so it
 * stays on the server in both environments.
 */
function uploadInDev(jwt?: string): Plugin {
  return {
    name: "puns-upload-dev",
    configureServer(server) {
      server.middlewares.use("/.netlify/functions/upload", async (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(body));
        };

        if (req.method !== "POST") return send(405, {error: "Send the image as a POST."});
        if (!jwt) {
          return send(501, {
            error:
              "Image pinning is not configured. Add PINATA_JWT to the .env at the repository root and restart the dev server.",
          });
        }

        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);

          // Rebuild the multipart body as a web Request so the same parsing
          // runs here as in the deployed function.
          const parsed = await new Request("http://local/upload", {
            method: "POST",
            headers: {"content-type": req.headers["content-type"] ?? ""},
            body: Buffer.concat(chunks),
          }).formData();

          const file = parsed.get("file");
          if (!file || typeof file === "string") return send(400, {error: "No file was attached."});

          const body = new FormData();
          body.append("file", file, (file as File).name || "image");
          body.append("pinataOptions", JSON.stringify({cidVersion: 1}));

          const pinned = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
            method: "POST",
            headers: {Authorization: `Bearer ${jwt}`},
            body,
          });

          if (!pinned.ok) return send(502, {error: "The pinning service refused that upload."});

          const {IpfsHash} = (await pinned.json()) as {IpfsHash: string};
          send(200, {uri: `ipfs://${IpfsHash}`, cid: IpfsHash});
        } catch {
          send(500, {error: "That upload could not be read."});
        }
      });
    },
  };
}

/**
 * The indexer, running in the dev server.
 *
 * In production a scheduled Netlify function walks the chain and Netlify Blobs
 * holds the result. Neither exists locally, so without this the app falls back
 * to scanning logs from the browser, which the provider's block-range cap makes
 * impossible. The list would be permanently empty in development and full in
 * production, which is the worst way to find out something is wrong.
 *
 * The logic is imported, not copied. Storage is a folder instead of Blobs, and
 * that is the only difference between the two environments.
 */
function indexerInDev(env: Record<string, string>): Plugin {
  const dir = path.resolve(HERE, ".indexer");

  const store = {
    async get(key: string) {
      try {
        return JSON.parse(await fs.readFile(path.join(dir, `${key}.json`), "utf8"));
      } catch {
        return undefined;
      }
    },
    async set(key: string, value: unknown) {
      const file = path.join(dir, `${key}.json`);
      await fs.mkdir(path.dirname(file), {recursive: true});
      await fs.writeFile(file, JSON.stringify(value));
    },
  };

  const options = {
    rpcUrl:
      env.INDEXER_RPC_URL ||
      env.RPC_MAINNET_ALCHEMY ||
      "https://rpc.mainnet.chain.robinhood.com",
    factory:
      env.LAUNCH_FACTORY_ADDRESS || "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e",
    chunk: Number(env.INDEXER_LOG_CHUNK ?? 9),
    requestsPerRun: Number(env.INDEXER_REQUESTS_PER_RUN ?? 40),
    concurrency: Number(env.INDEXER_CONCURRENCY ?? 6),
  };

  return {
    name: "puns-indexer-dev",
    async configureServer(server) {
      const {advance, readPage} = await import("./shared/indexer-core.mjs");

      let running = false;
      const tick = async () => {
        if (running) return;
        running = true;
        try {
          const result = await advance(store, options);
          if (result.found) {
            server.config.logger.info(
              `  indexer  found ${result.found}, total ${result.total}, ${result.behind} blocks behind`,
            );
          }
        } catch (error) {
          server.config.logger.warn(`  indexer  ${(error as Error).message}`);
        } finally {
          running = false;
        }
      };

      void tick();
      const timer = setInterval(tick, 12_000);
      server.httpServer?.on("close", () => clearInterval(timer));

      server.middlewares.use("/.netlify/functions/launches", async (req, res) => {
        const url = new URL(req.url ?? "/", "http://local");
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 25)));
        const page = Math.max(0, Number(url.searchParams.get("page") ?? 0) || 0);

        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(await readPage(store, page, limit)));
      });
    },
  };
}

/* -------------------------------------------------------------------------- */

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, ROOT, "");

  return {
    envDir: ROOT,
    plugins: [react(), tailwindcss(), uploadInDev(env.PINATA_JWT), indexerInDev(env)],
    resolve: {
      alias: {"@": path.resolve(HERE, "./src")},
    },
    server: {port: 5173},
  };
});
