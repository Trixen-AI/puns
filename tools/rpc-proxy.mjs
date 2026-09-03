#!/usr/bin/env node
/**
 * Local JSON-RPC proxy for Robinhood Chain.
 *
 * Two problems this solves, both observed against
 * https://rpc.mainnet.chain.robinhood.com :
 *
 *   1. TLS. The endpoint sits behind a load balancer where at least one node
 *      presents a certificate chain that Foundry's TLS stack (rustls) rejects
 *      with "invalid peer certificate: Expired", while curl and Node accept it.
 *      When that node is hit, `anvil --fork-url` and `forge script` fail
 *      outright. Proxying over plain HTTP on localhost removes Foundry's TLS
 *      stack from the path entirely.
 *
 *   2. Flakiness. Roughly 30% of upstream calls fail with transport errors
 *      under light load. This proxy retries transparently, so a single flaky
 *      response never surfaces as a failed fork or a failed deployment.
 *
 * Usage:
 *
 *   node tools/rpc-proxy.mjs
 *   anvil --fork-url http://127.0.0.1:8546
 *
 * Environment:
 *
 *   RPC_UPSTREAM   upstream endpoint(s), comma separated, tried in order
 *   RPC_PROXY_PORT listen port, default 8546
 *   RPC_RETRIES    attempts per upstream, default 5
 */

import http from "node:http";

const UPSTREAMS = (process.env.RPC_UPSTREAM ?? "https://rpc.mainnet.chain.robinhood.com")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

const PORT = Number(process.env.RPC_PROXY_PORT ?? 8546);
const RETRIES = Number(process.env.RPC_RETRIES ?? 5);

const stats = {requests: 0, upstreamCalls: 0, upstreamFailures: 0, retried: 0};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Forward one payload, trying every upstream and retrying each. */
async function forward(body) {
  let lastError;

  for (const upstream of UPSTREAMS) {
    for (let attempt = 1; attempt <= RETRIES; attempt++) {
      stats.upstreamCalls++;
      try {
        const response = await fetch(upstream, {
          method: "POST",
          headers: {"content-type": "application/json"},
          body,
          signal: AbortSignal.timeout(30_000),
        });

        if (!response.ok) throw new Error(`upstream status ${response.status}`);
        return await response.text();
      } catch (error) {
        lastError = error;
        stats.upstreamFailures++;
        if (attempt < RETRIES) {
          stats.retried++;
          // Exponential backoff with jitter, capped so a fork never stalls.
          const delay = Math.min(100 * 2 ** (attempt - 1), 2_000);
          await sleep(delay + Math.random() * 100);
        }
      }
    }
  }

  throw lastError ?? new Error("all upstreams exhausted");
}

const server = http.createServer((req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405, {"content-type": "application/json"});
    res.end(JSON.stringify({error: "method not allowed"}));
    return;
  }

  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", async () => {
    stats.requests++;
    const body = Buffer.concat(chunks).toString("utf8");

    try {
      const result = await forward(body);
      res.writeHead(200, {"content-type": "application/json"});
      res.end(result);
    } catch (error) {
      res.writeHead(502, {"content-type": "application/json"});
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: {code: -32603, message: `proxy: ${error.message}`},
        }),
      );
    }
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`rpc-proxy listening on http://127.0.0.1:${PORT}`);
  console.log(`upstreams: ${UPSTREAMS.join(", ")}`);
  console.log(`retries per upstream: ${RETRIES}`);
});

// Report how bad the upstream actually is. These numbers are the evidence
// behind the resilience requirements in docs/02-architecture.md.
const report = setInterval(() => {
  if (stats.requests === 0) return;
  const failureRate = ((stats.upstreamFailures / stats.upstreamCalls) * 100).toFixed(1);
  console.log(
    `requests ${stats.requests} | upstream calls ${stats.upstreamCalls} | ` +
      `failures ${stats.upstreamFailures} (${failureRate}%) | retried ${stats.retried}`,
  );
}, 30_000);
report.unref();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.log("\nshutting down");
    server.close(() => process.exit(0));
  });
}
