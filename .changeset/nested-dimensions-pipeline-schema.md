---
"@workers-powertools/metrics": minor
---

Nest dimensions under a `dimensions` JSON field instead of spreading them as top-level columns. This keeps the Pipelines stream schema stable when new dimensions are added — no stream recreation needed.

**Breaking change:** If you previously relied on dimensions as top-level fields in your stream schema, you'll need to either update your schema to use a `dimensions` JSON column, or subclass `PipelinesBackend` to restore the old behavior (see "Custom dimension mapping" in the README).

Also adds:

- `schema.json` — reference stream schema shipped with the package
- `PIPELINES_SETUP.md` — standalone deployment guide for consumers
- Expanded README with 7-step pipeline setup, R2 SQL query examples, and custom dimension mapping
