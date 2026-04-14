import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";
import esbuild from "esbuild";

export default defineConfig({
  plugins: [
    // Lower TC39 Stage 3 decorator syntax before the worker source reaches
    // workerd. See vanilla-worker/vitest.config.ts for full explanation.
    {
      name: "lower-tc39-decorators",
      enforce: "pre",
      async transform(code, id) {
        if (!id.endsWith(".ts") || id.includes("node_modules")) return null;
        const result = await esbuild.transform(code, {
          loader: "ts",
          target: "es2022",
          tsconfigRaw: {
            compilerOptions: { experimentalDecorators: false },
          },
        });
        return { code: result.code, map: result.map };
      },
    },
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        pipelines: ["METRICS_PIPELINE"],
        kvNamespaces: ["IDEMPOTENCY_KV"],
      },
    }),
  ],
  test: {
    include: ["test/**/*.spec.ts"],
  },
});
