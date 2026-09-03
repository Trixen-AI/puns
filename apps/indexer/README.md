# apps/indexer

Chain event indexer. A long-running Node worker that tails chain 4663, decodes events and writes to Postgres, publishing live trades to Redis. Serves no HTTP except a health endpoint. See docs/02-architecture.md.

Not yet implemented. See docs/06-roadmap.md for the phase this belongs to.
