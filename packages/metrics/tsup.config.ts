import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/pipelines.ts", "src/analyticsEngine.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ["@workers-powertools/commons"],
});
