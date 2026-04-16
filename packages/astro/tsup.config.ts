import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/logger.ts",
    "src/metrics.ts",
    "src/tracer.ts",
    "src/observability.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: [
    "astro",
    "astro/middleware",
    "@workers-powertools/logger",
    "@workers-powertools/metrics",
    "@workers-powertools/metrics/pipelines",
    "@workers-powertools/tracer",
  ],
});
