import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/kv.ts", "src/d1.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ["@workers-powertools/commons"],
});
