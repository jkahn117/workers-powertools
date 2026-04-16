import { readFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";

const SIZE_BUDGETS = [
  {
    packageName: "@workers-powertools/commons",
    filePath: "packages/commons/dist/index.js",
    budgetBytes: 2 * 1024,
  },
  {
    packageName: "@workers-powertools/logger",
    filePath: "packages/logger/dist/index.js",
    budgetBytes: 5 * 1024,
  },
  {
    packageName: "@workers-powertools/metrics",
    filePath: "packages/metrics/dist/index.js",
    budgetBytes: 4 * 1024,
  },
  {
    packageName: "@workers-powertools/tracer",
    filePath: "packages/tracer/dist/index.js",
    budgetBytes: 5 * 1024,
  },
  {
    packageName: "@workers-powertools/idempotency",
    filePath: "packages/idempotency/dist/index.js",
    budgetBytes: 6 * 1024,
  },
  {
    packageName: "@workers-powertools/hono",
    filePath: "packages/hono/dist/index.js",
    budgetBytes: 4 * 1024,
  },
  {
    packageName: "@workers-powertools/agents",
    filePath: "packages/agents/dist/index.js",
    budgetBytes: 2 * 1024,
  },
  {
    packageName: "@workers-powertools/tanstack-start",
    filePath: "packages/tanstack-start/dist/index.js",
    budgetBytes: 4 * 1024,
  },
  {
    packageName: "@workers-powertools/astro",
    filePath: "packages/astro/dist/index.js",
    budgetBytes: 4 * 1024,
  },
];

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  return `${(bytes / 1024).toFixed(1)} KB`;
}

const results = SIZE_BUDGETS.map((entry) => {
  const absolutePath = resolve(entry.filePath);

  if (!existsSync(absolutePath)) {
    throw new Error(
      `Missing build output for ${entry.packageName}: ${entry.filePath}. Run \`pnpm build\` first.`,
    );
  }

  const fileContents = readFileSync(absolutePath);
  const gzippedSize = gzipSync(fileContents).byteLength;

  return {
    ...entry,
    gzippedSize,
    withinBudget: gzippedSize <= entry.budgetBytes,
  };
});

console.log("Package size report (gzipped ESM entrypoints):");

for (const result of results) {
  const status = result.withinBudget ? "PASS" : "FAIL";
  console.log(
    `${status} ${result.packageName}: ${formatBytes(result.gzippedSize)} / ${formatBytes(result.budgetBytes)}`,
  );
}

const failures = results.filter((result) => !result.withinBudget);

if (failures.length > 0) {
  console.error("\nBundle size budget exceeded:");
  for (const failure of failures) {
    console.error(
      `- ${failure.packageName}: ${formatBytes(failure.gzippedSize)} exceeds ${formatBytes(failure.budgetBytes)}`,
    );
  }
  process.exit(1);
}
