import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: [
    "@workers-powertools/commons",
    "@workers-powertools/logger",
    "@workers-powertools/metrics",
    "@workers-powertools/tracer",
    "@workers-powertools/idempotency",
    "hono",
  ],
});
