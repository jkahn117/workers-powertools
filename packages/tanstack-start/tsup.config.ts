import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/logger.ts",
    "src/metrics.ts",
    "src/tracer.ts",
    "src/observability.ts",
    "src/requestHelper.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: [
    "@workers-powertools/commons",
    "@workers-powertools/logger",
    "@workers-powertools/metrics",
    "@workers-powertools/metrics/pipelines",
    "@workers-powertools/tracer",
    "@tanstack/start-client-core",
  ],
});
