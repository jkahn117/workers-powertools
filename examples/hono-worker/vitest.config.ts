import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },

      // Miniflare provides in-memory simulations of Cloudflare bindings so
      // tests run locally without a real account. When you're ready to test
      // against real bindings, run `wrangler dev` or `wrangler deploy` and
      // test against the live Worker instead.
      miniflare: {
        // Simulates the Pipelines binding for injectMetrics PipelinesBackend.
        // send() calls are accepted and silently discarded in-process.
        pipelines: ["METRICS_PIPELINE"],

        // KV accepts a string[] of binding names.
        kvNamespaces: ["IDEMPOTENCY_KV"],
      },
    }),
  ],
  test: {
    include: ["test/**/*.spec.ts"],
  },
});
