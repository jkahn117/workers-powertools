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
 * ─── POWERTOOLS INTEGRATION ──────────────────────────────────────────────────
 *
 * Logger  — resetContext() + addContext(request, ctx, env) at the start of each
 *           request prevents state leaking between requests on a reused logger.
 *           createEvent() accumulates context and emits a single wide event.
 *
 * Metrics — PipelinesBackend writes named-field JSON records to Cloudflare
 *           Pipelines → R2/Iceberg, queryable by column name via R2 SQL.
 *
 * Idempotency — makeIdempotent() wraps ItemService.create so duplicate POSTs
 *               with the same Idempotency-Key header return the stored result.
 *
 * captureFetch — propagates correlation ID on outbound fetch calls.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Logger } from "@workers-powertools/logger";
import { Metrics, MetricUnit, PipelinesBackend } from "@workers-powertools/metrics";
import type { PipelineBinding } from "@workers-powertools/metrics";
import { makeIdempotent, IdempotencyConfig } from "@workers-powertools/idempotency";
import { KVPersistenceLayer } from "@workers-powertools/idempotency/kv";

export interface Env {
  // POWERTOOLS_SERVICE_NAME, POWERTOOLS_LOG_LEVEL, POWERTOOLS_METRICS_NAMESPACE
  // are set as vars in wrangler.jsonc and applied via addContext(..., env).
  METRICS_PIPELINE: PipelineBinding;
  IDEMPOTENCY_KV: KVNamespace;
}

type Item = { id: string; name: string; createdAt: string };
type CreateItemEvent = { idempotencyKey: string; name: string };

// serviceName / logLevel / namespace resolved from env vars at runtime.
const logger = new Logger();
const metrics = new Metrics();

// Lazily initialised on first request — env bindings unavailable at module scope.
let persistenceLayer: KVPersistenceLayer | undefined;

const idempotencyConfig = new IdempotencyConfig({
  eventKeyPath: "idempotencyKey",
  expiresAfterSeconds: 3600,
});

/**
 * ItemService encapsulates the business logic for the items resource.
 *
 * Methods are plain async functions — timing and context are captured
 * by the wide event on the outer handler instead of per-method spans.
 */
class ItemService {
  // In-memory store — replace with KV or D1 in production.
  private readonly store = new Map<string, Item>();

  async list(): Promise<Item[]> {
    return Array.from(this.store.values());
  }

  async create(event: CreateItemEvent): Promise<Item> {
    const id = crypto.randomUUID();
    const item: Item = { id, name: event.name, createdAt: new Date().toISOString() };
    this.store.set(id, item);
    metrics.addMetric("itemCreated", MetricUnit.Count, 1, {
      route: "/items",
      method: "POST",
    });
    return item;
  }

  async getById(id: string): Promise<Item | undefined> {
    return this.store.get(id);
  }
}

const service = new ItemService();

const createItemIdempotent = makeIdempotent(
  (event: CreateItemEvent) => service.create(event),
  {
    get persistenceLayer() {
      if (!persistenceLayer)
        throw new Error("Idempotency persistence layer not initialised");
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

    // Reset per-request state, then enrich with current request context.
    logger.resetContext();
    logger.addContext(request, ctx, env as unknown as Record<string, unknown>);
    metrics.setBackend(new PipelinesBackend({ binding: env.METRICS_PIPELINE }));

    // Create a wide event that accumulates context throughout the request.
    const event = logger.createEvent("request handled");
    event.set({ method, path });

    try {
      if (method === "GET" && path === "/items") {
        const items = await service.list();
        event.set({ itemCount: items.length });
        return Response.json(items);
      }

      if (method === "POST" && path === "/items") {
        const body = (await request.json()) as { name?: string };
        if (!body.name) {
          event.set({ status: 400, error: "missing_name" });
          return new Response("Missing required field: name", { status: 400 });
        }
        persistenceLayer ??= new KVPersistenceLayer({ binding: env.IDEMPOTENCY_KV });
        const idempotencyKey = request.headers.get("Idempotency-Key") ?? body.name;
        const item = await createItemIdempotent({ idempotencyKey, name: body.name });
        event.set({ itemId: item.id, action: "create", status: 201 });
        return Response.json(item, { status: 201 });
      }

      const itemMatch = path.match(/^\/items\/([^/]+)$/);
      if (method === "GET" && itemMatch) {
        const item = await service.getById(itemMatch[1] ?? "");
        if (!item) {
          event.set({ itemId: itemMatch[1], found: false, status: 404 });
          return new Response("Not Found", { status: 404 });
        }
        event.set({ itemId: item.id, found: true, status: 200 });
        return Response.json(item);
      }

      event.set({ status: 404 });
      return new Response("Not Found", { status: 404 });
    } catch (error) {
      logger.error("Unhandled error", error as Error);
      event.set({ status: 500, error: (error as Error).message });
      return new Response("Internal Server Error", { status: 500 });
    } finally {
      event.emit();
      ctx.waitUntil(metrics.flush());
    }
  },
} satisfies ExportedHandler<Env>;
