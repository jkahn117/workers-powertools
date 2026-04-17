/**
 * check-exports.mjs
 *
 * Validates that every file referenced in each package's `exports` map
 * actually exists on disk.  Run this after `pnpm build` (and before
 * `changeset publish`) to catch the class of bug where a new subpath export
 * is added to package.json but the corresponding dist file is missing because
 * the build was either skipped or out-of-date.
 *
 * Usage:
 *   node scripts/check-exports.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Packages to validate — keep in sync with the workspace packages list. */
const PACKAGES = [
  "packages/commons",
  "packages/logger",
  "packages/metrics",
  "packages/tracer",
  "packages/idempotency",
  "packages/hono",
  "packages/agents",
  "packages/tanstack-start",
  "packages/astro",
];

/**
 * Recursively collect all string values from an `exports` condition object.
 * Handles both shorthand strings and nested condition maps.
 *
 * @param {unknown} node - A node from the exports map.
 * @returns {string[]} Flat list of relative file paths.
 */
function collectPaths(node) {
  if (typeof node === "string") {
    return [node];
  }

  if (node && typeof node === "object" && !Array.isArray(node)) {
    return Object.values(node).flatMap(collectPaths);
  }

  return [];
}

let failed = false;

for (const pkgDir of PACKAGES) {
  const pkgJsonPath = join(ROOT, pkgDir, "package.json");

  if (!existsSync(pkgJsonPath)) {
    console.warn(`SKIP  ${pkgDir} — no package.json found`);
    continue;
  }

  const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));

  if (!pkg.exports) {
    console.log(`SKIP  ${pkg.name} — no exports map`);
    continue;
  }

  // Collect all file paths declared across the entire exports map.
  const declaredPaths = collectPaths(pkg.exports);

  for (const relativePath of declaredPaths) {
    // Only check paths that point into dist/ (ignore conditions like "node").
    if (!relativePath.startsWith("./dist/")) {
      continue;
    }

    const absolutePath = join(ROOT, pkgDir, relativePath.slice(2)); // strip "./"

    if (!existsSync(absolutePath)) {
      console.error(
        `FAIL  ${pkg.name}: exports declares "${relativePath}" but the file does not exist.\n` +
          `      Expected: ${absolutePath}\n` +
          `      Run \`pnpm build\` and verify the tsup entry list is complete.`,
      );
      failed = true;
    } else {
      console.log(`OK    ${pkg.name}: ${relativePath}`);
    }
  }
}

if (failed) {
  console.error(
    "\nExports check failed — one or more declared export paths are missing from dist.",
  );
  process.exit(1);
} else {
  console.log("\nAll declared export paths exist.");
}
