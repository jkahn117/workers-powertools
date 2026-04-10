/**
 * Vanilla Worker example — Simple Items API
 *
 * Demonstrates Workers Powertools without a framework.
 * The API has three routes handled via manual URL routing:
 *
 *   GET  /items        — list all items
 *   POST /items        — create an item (idempotent via Idempotency-Key header)
 *   GET  /items/:id    — get a single item
 *
 * ─── HOW TO INTEGRATE POWERTOOLS ────────────────────────────────────────────
 *
 * Step 1 — Logger
 *   import { Logger } from "@workers-powertools/logger";
 *   const logger = new Logger({ serviceName: "vanilla-worker", logLevel: "INFO" });
 *   In fetch(): call logger.addContext(request, ctx) at the top of every request.
 *   Replace any console.log calls with logger.info / logger.warn / logger.error.
 *
 * Step 2 — Tracer
 *   import { Tracer } from "@workers-powertools/tracer";
 *   const tracer = new Tracer({ serviceName: "vanilla-worker" });
 *   In fetch(): call tracer.addContext(request, ctx).
 *   Wrap handler logic in tracer.captureAsync("handleRequest", async () => { ... }).
 *
 * Step 3 — Metrics
 *   import { Metrics, MetricUnit, PipelinesBackend } from "@workers-powertools/metrics";
 *   const metrics = new Metrics(); // namespace from POWERTOOLS_METRICS_NAMESPACE env var
 *   In fetch(): call metrics.setBackend(new PipelinesBackend({ binding: env.METRICS_PIPELINE })).
 *   Record metrics (e.g. metrics.addMetric("itemCreated", MetricUnit.Count, 1)).
 *   Flush with ctx.waitUntil(metrics.flush()) before returning.
 *   Requires: "pipelines" binding in wrangler.jsonc.
 *
 * Step 4 — Idempotency (POST /items only)
 *   import { makeIdempotent, IdempotencyConfig } from "@workers-powertools/idempotency";
 *   import { KVPersistenceLayer } from "@workers-powertools/idempotency/kv";
 *   Wrap createItem() with makeIdempotent(), keyed on the Idempotency-Key header.
 *   Requires: "kv_namespaces" binding in wrangler.jsonc.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Logger } from "@workers-powertools/logger";
import { Tracer } from "@workers-powertools/tracer";
import { Metrics, MetricUnit, PipelinesBackend } from "@workers-powertools/metrics";
import type { PipelineBinding } from "@workers-powertools/metrics";
import { makeIdempotent, IdempotencyConfig } from "@workers-powertools/idempotency";
import { KVPersistenceLayer } from "@workers-powertools/idempotency/kv";

export interface Env {
  // POWERTOOLS_SERVICE_NAME, POWERTOOLS_LOG_LEVEL, POWERTOOLS_METRICS_NAMESPACE
  // can be set as plain environment variables in wrangler.jsonc [vars] and
  // are applied at runtime via addContext(request, ctx, env) / setBackend().
  METRICS_PIPELINE: PipelineBinding;
  IDEMPOTENCY_KV: KVNamespace;
}

// In-memory store — replace with a real binding (KV, D1) as desired
const items = new Map<string, { id: string; name: string; createdAt: string }>();

// serviceName / logLevel / namespace omitted — resolved from env vars at runtime:
//   POWERTOOLS_SERVICE_NAME, POWERTOOLS_LOG_LEVEL, POWERTOOLS_METRICS_NAMESPACE
const logger = new Logger();
const tracer = new Tracer();
const metrics = new Metrics();

// Lazily initialised on first request — the KV binding is only available
// inside the fetch handler, not at module scope.
let persistenceLayer: KVPersistenceLayer | undefined;

const idempotencyConfig = new IdempotencyConfig({
  eventKeyPath: "idempotencyKey",
  expiresAfterSeconds: 3600,
});

type CreateItemEvent = { idempotencyKey: string; name: string };
type CreateItemResult = { id: string; name: string; createdAt: string };

// makeIdempotent wraps the core business logic. It receives a plain
// serialisable event and returns a plain serialisable result — Response
// construction happens outside so KV serialisation stays clean.
const createItemIdempotent = makeIdempotent(
  (event: CreateItemEvent): Promise<CreateItemResult> => {
    return tracer.captureAsync("createItem", async () => {
      const id = crypto.randomUUID();
      const item: CreateItemResult = {
        id,
        name: event.name,
        createdAt: new Date().toISOString(),
      };
      items.set(id, item);

      logger.info("Item created", { itemId: id });
      metrics.addMetric("itemCreated", MetricUnit.Count, 1);

      return item;
    });
  },
  {
    // persistenceLayer is set before first call via createItemIdempotent's
    // closure — see handleCreateItem below.
    get persistenceLayer() {
      if (!persistenceLayer) {
        throw new Error("Idempotency persistence layer not initialised");
      }
      return persistenceLayer;
    },
    config: idempotencyConfig,
  },
);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { method } = request;
    const path = url.pathname;

    // Pass env so POWERTOOLS_SERVICE_NAME and POWERTOOLS_LOG_LEVEL are applied.
    logger.addContext(request, ctx, env as unknown as Record<string, unknown>);
    tracer.addContext(request, ctx, env as unknown as Record<string, unknown>);
    // PipelinesBackend resolved per-request from the env binding.
    metrics.setBackend(new PipelinesBackend({ binding: env.METRICS_PIPELINE }));

    try {
      // Route: GET /items
      if (method === "GET" && path === "/items") {
        return await handleListItems();
      }

      // Route: POST /items
      if (method === "POST" && path === "/items") {
        const body = (await request.json()) as { name?: string };
        return await handleCreateItem(body, request, env);
      }

      // Route: GET /items/:id
      const itemMatch = path.match(/^\/items\/([^/]+)$/);
      if (method === "GET" && itemMatch) {
        const id = itemMatch[1] ?? "";
        return await handleGetItem(id);
      }

      return new Response("Not Found", { status: 404 });
    } catch (error) {
      logger.error("Unhandled error", error as Error);
      return new Response("Internal Server Error", { status: 500 });
    } finally {
      ctx.waitUntil(metrics.flush());
    }
  },
} satisfies ExportedHandler<Env>;

function handleListItems(): Promise<Response> {
  return tracer.captureAsync("listItems", async () => {
    const all = Array.from(items.values());
    logger.info("Listed items", { count: all.length });
    return Response.json(all);
  });
}

async function handleCreateItem(
  body: { name?: string },
  request: Request,
  env: Env,
): Promise<Response> {
  if (!body.name) {
    return new Response("Missing required field: name", { status: 400 });
  }

  // Initialise the persistence layer on first use, then reuse across
  // requests on the same isolate (env bindings are stable per isolate).
  persistenceLayer ??= new KVPersistenceLayer({ binding: env.IDEMPOTENCY_KV });

  // Use the Idempotency-Key header if provided, otherwise fall back to the
  // item name. In production you'd require the header for strict idempotency.
  const idempotencyKey = request.headers.get("Idempotency-Key") ?? body.name;

  const item = await createItemIdempotent({ idempotencyKey, name: body.name });

  return Response.json(item, { status: 201 });
}

function handleGetItem(id: string): Promise<Response> {
  return tracer.captureAsync("getItem", async () => {
    const item = items.get(id);
    if (!item) {
      logger.warn("Item not found", { itemId: id });
      return new Response("Not Found", { status: 404 });
    }
    return Response.json(item);
  });
}
