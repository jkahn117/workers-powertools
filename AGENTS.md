# AGENTS Guidelines for this Repository

## Project Overview

A developer toolkit to implement observability and reliability best practices for Cloudflare Workers.

## Coding Style

- TypeScript strict mode
- Only use spaces for indentation
- Double quotes; semicolons on all lines
- Backticks for template literals
- Utilize comments to clearly and concisely explain
- Only use pnpm for package management

## TypeScript Conventions

### Types and Interfaces

- Use interface for data models, type for unions/helpers
- Prefix input types with Create or Update
- Avoid using any except in specific cases (see Code Quality section below)

### Type Imports

- Always use explicit type imports

### Naming Conventions

#### Variables and Functions

- camelCase for variables, functions, and parameters
- SCREAMING_SNAKE_CASE for constants (if any)

#### Files

- camelCase for utilities: utils.ts

## Bundle Size

Workers are extremely sensitive to bundle size — cold start cost, CPU time limits, and the 1MB compressed bundle ceiling all make this a hard constraint, not a soft preference.

### Rules

- **Zero external runtime dependencies in core packages.** Every `dependency` entry in a core package `package.json` (`logger`, `metrics`, `tracer`, `idempotency`, `commons`) must be justified with an explicit comment explaining why it cannot be avoided. `devDependencies` and `peerDependencies` are exempt.
- **Framework adapter packages** (`hono`, future `astro`, etc.) may depend on the framework itself as a `peerDependency` only — never as a bundled `dependency`.
- **No transitive bloat.** Before adding any dependency, check its own dependency tree. A package that pulls in 20 transitive dependencies is not acceptable even if the package itself is small.
- **Bundle size is a first-class metric.** Every package must have its gzipped ESM output size tracked. If a change increases any package's gzipped size by more than 10%, it must be explicitly justified in the PR.

### Enforcement

Add a size check script to CI that fails if any package exceeds its budget:

| Package                           | Gzipped size budget |
| --------------------------------- | ------------------- |
| `@workers-powertools/commons`     | 2 KB                |
| `@workers-powertools/logger`      | 5 KB                |
| `@workers-powertools/metrics`     | 4 KB                |
| `@workers-powertools/tracer`      | 5 KB                |
| `@workers-powertools/idempotency` | 6 KB                |
| `@workers-powertools/hono`        | 4 KB                |
| `@workers-powertools/agents`      | 2 KB                |

These budgets are initial estimates and should be tightened once baseline measurements are established.

Current baseline (post-implementation, for reference):

| Package                           | Gzipped (actual) |
| --------------------------------- | ---------------- |
| `@workers-powertools/commons`     | 707 B            |
| `@workers-powertools/logger`      | 3.5 KB           |
| `@workers-powertools/metrics`     | 2.2 KB           |
| `@workers-powertools/tracer`      | 1.4 KB           |
| `@workers-powertools/idempotency` | 1.1 KB           |
| `@workers-powertools/hono`        | 1.4 KB           |
| `@workers-powertools/agents`      | 416 B            |

### Checking Bundle Size

To check the gzipped output size of a package after building:

```bash
# From repo root — build first, then measure
pnpm build
find packages/*/dist -name "*.js" | xargs gzip -c | wc -c
# Or per-package:
gzip -c packages/logger/dist/index.js | wc -c
```

## Keep Dependencies in Sync

If you add or update dependencies remember to:

- Update the appropriate lockfile (pnpm-lock.yaml).

Following these practices ensures that the agent-assisted development workflow stays fast and dependable.
