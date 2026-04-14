import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ["@workers-powertools/commons"],
  esbuildOptions(options) {
    // Tell esbuild that the target does not natively support TC39 Stage 3
    // decorators, forcing it to lower decorator syntax at build time.
    // This ensures the distributed package works in runtimes that haven't
    // implemented native decorator support yet (Node, workerd, etc.).
    options.supported = { ...options.supported, decorators: false };
  },
});
