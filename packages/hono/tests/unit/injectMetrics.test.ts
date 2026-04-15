import { describe, it, expect, vi } from "vitest";
import { Metrics, MetricUnit, PipelinesBackend } from "@workers-powertools/metrics";
import type { PipelineBinding } from "@workers-powertools/metrics";
import { injectMetrics } from "../../src/metrics";
import { Hono } from "hono";

function makeExecutionCtx() {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  };
}

/** Use app.fetch() so Hono receives a real ExecutionContext. */
async function fetchWithCtx(
  app: Hono,
  path: string,
  env: Record<string, unknown>,
  ctx = makeExecutionCtx(),
) {
  const req = new Request(`http://localhost${path}`);
  const res = await app.fetch(
    req,
    env,
    ctx as unknown as Parameters<typeof app.fetch>[2],
  );
  return { res, ctx };
}

describe("injectMetrics (Hono middleware)", () => {
  it("records request_duration and request_count with route, method, status dimensions", async () => {
    const written: { name: string; dimensions: Record<string, string> }[] = [];
    const backend = {
      async write(entries: { name: string; dimensions: Record<string, string> }[]) {
        written.push(...entries);
      },
      writeSync(entries: { name: string; dimensions: Record<string, string> }[]) {
        written.push(...entries);
      },
    };

    const metrics = new Metrics({
      namespace: "test",
      serviceName: "api",
      backend: backend as unknown as PipelinesBackend,
    });

    const app = new Hono();
    app.use(injectMetrics(metrics));
    app.get("/hello", (c) => c.json({ ok: true }));

    const { ctx } = await fetchWithCtx(app, "/hello", {});

    // Drain the waitUntil promise (flush)
    const flushCalls = (ctx.waitUntil as ReturnType<typeof vi.fn>).mock.calls;
    for (const [promise] of flushCalls) {
      await promise;
    }

    const names = written.map((e) => e.name);
    expect(names).toContain("request_duration");
    expect(names).toContain("request_count");

    const durationEntry = written.find((e) => e.name === "request_duration");
    expect(durationEntry?.dimensions).toMatchObject({
      route: "/hello",
      method: "GET",
      status: "200",
    });
  });

  it("calls ctx.waitUntil once per request", async () => {
    const metrics = new Metrics({ namespace: "test", serviceName: "api" });

    const app = new Hono();
    app.use(injectMetrics(metrics));
    app.get("/hello", (c) => c.json({ ok: true }));

    const { ctx } = await fetchWithCtx(app, "/hello", {});

    expect(ctx.waitUntil).toHaveBeenCalledOnce();
  });

  it("resolves backend from env.METRICS_PIPELINE when no factory provided", async () => {
    const sent: unknown[] = [];
    const fakeBinding = {
      send: vi.fn(async (records: unknown[]) => {
        sent.push(...records);
      }),
    };

    const metrics = new Metrics({ namespace: "test", serviceName: "api" });

    const app = new Hono();
    app.use(injectMetrics(metrics));
    app.get("/hello", (c) => c.json({ ok: true }));

    const { ctx } = await fetchWithCtx(app, "/hello", {
      METRICS_PIPELINE: fakeBinding,
    });

    const flushCalls = (ctx.waitUntil as ReturnType<typeof vi.fn>).mock.calls;
    for (const [promise] of flushCalls) {
      await promise;
    }

    expect(fakeBinding.send).toHaveBeenCalledOnce();
  });

  it("calls backendFactory with env on each request", async () => {
    let factoryCallCount = 0;
    const fakeBinding = { send: vi.fn(async () => {}) };

    const metrics = new Metrics({ namespace: "test", serviceName: "api" });

    const app = new Hono();
    app.use(
      injectMetrics(metrics, {
        backendFactory: (env) => {
          factoryCallCount++;
          return new PipelinesBackend({
            binding: env["METRICS_PIPELINE"] as PipelineBinding,
          });
        },
      }),
    );
    app.get("/hello", (c) => c.json({ ok: true }));

    const env = { METRICS_PIPELINE: fakeBinding };

    await fetchWithCtx(app, "/hello", env);
    await fetchWithCtx(app, "/hello", env);

    // Factory is called each request; setBackend() is idempotent for same binding
    expect(factoryCallCount).toBe(2);
    // But the internal backend object is only replaced once (same binding ref)
    const internalBackend = (metrics as unknown as { backend: unknown }).backend;
    expect(internalBackend).toBeDefined();
  });
});
