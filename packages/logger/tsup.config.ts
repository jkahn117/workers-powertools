import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/redactPatterns.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ["@workers-powertools/commons"],
});
