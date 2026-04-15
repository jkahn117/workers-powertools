import { describe, it, expect, vi, beforeEach } from "vitest";
import { Metrics } from "../../src/metrics";
import { MetricUnit } from "../../src/units";
import type { MetricsBackend, MetricEntry, MetricContext } from "../../src/types";
import type { PipelineBinding } from "../../src/pipelinesBackend";

function makeMockBackend(): MetricsBackend & {
  writtenEntries: { entries: MetricEntry[]; context: MetricContext }[];
} {
  const writtenEntries: { entries: MetricEntry[]; context: MetricContext }[] = [];
  return {
    writtenEntries,
    async write(entries, context) {
      writtenEntries.push({ entries, context });
    },
    writeSync(entries, context) {
      writtenEntries.push({ entries, context });
    },
  };
}

describe("Metrics / initialization", () => {
  it("accepts optional namespace in constructor", () => {
    const metrics = new Metrics({ namespace: "ecommerce", serviceName: "api" });
    expect(metrics).toBeDefined();
  });

  it("defaults namespace to 'default_namespace' when not provided", async () => {
    const backend = makeMockBackend();
    const metrics = new Metrics({ serviceName: "api" });
    metrics.setBackend(backend);
    metrics.addMetric("hits", MetricUnit.Count, 1);
    await metrics.flush();

    expect(backend.writtenEntries[0]?.context.namespace).toBe("default_namespace");
  });

  it("uses provided namespace", async () => {
    const backend = makeMockBackend();
    const metrics = new Metrics({ namespace: "ecommerce", serviceName: "api" });
    metrics.setBackend(backend);
    metrics.addMetric("hits", MetricUnit.Count, 1);
    await metrics.flush();

    expect(backend.writtenEntries[0]?.context.namespace).toBe("ecommerce");
  });

  it.todo("reads namespace from POWERTOOLS_METRICS_NAMESPACE env var");
});

describe("Metrics / setBackend", () => {
  it("accepts a backend via constructor config", async () => {
    const backend = makeMockBackend();
    const metrics = new Metrics({ namespace: "ns", backend });
    metrics.addMetric("hits", MetricUnit.Count, 1);
    await metrics.flush();

    expect(backend.writtenEntries).toHaveLength(1);
  });

  it("accepts a backend via setBackend()", async () => {
    const backend = makeMockBackend();
    const metrics = new Metrics({ namespace: "ns" });
    metrics.setBackend(backend);
    metrics.addMetric("hits", MetricUnit.Count, 1);
    await metrics.flush();

    expect(backend.writtenEntries).toHaveLength(1);
  });

  it("skips setBackend when the binding reference is the same", async () => {
    const { PipelinesBackend } = await import("../../src/pipelinesBackend");
    const fakeBinding = { send: vi.fn() };
    const backend1 = new PipelinesBackend({
      binding: fakeBinding as unknown as PipelineBinding,
    });
    const backend2 = new PipelinesBackend({
      binding: fakeBinding as unknown as PipelineBinding,
    });

    const metrics = new Metrics({ namespace: "ns" });
    metrics.setBackend(backend1);
    metrics.setBackend(backend2);

    const internalBackend = (metrics as unknown as { backend: MetricsBackend }).backend;
    expect(internalBackend).toBe(backend1);
  });

  it("replaces backend when the binding reference differs", async () => {
    const { PipelinesBackend } = await import("../../src/pipelinesBackend");
    const binding1 = { send: vi.fn() };
    const binding2 = { send: vi.fn() };
    const backend1 = new PipelinesBackend({
      binding: binding1 as unknown as PipelineBinding,
    });
    const backend2 = new PipelinesBackend({
      binding: binding2 as unknown as PipelineBinding,
    });

    const metrics = new Metrics({ namespace: "ns" });
    metrics.setBackend(backend1);
    metrics.setBackend(backend2);

    const internalBackend = (metrics as unknown as { backend: MetricsBackend }).backend;
    expect(internalBackend).toBe(backend2);
  });
});

describe("Metrics / addMetric", () => {
  let metrics: Metrics;
  let backend: ReturnType<typeof makeMockBackend>;

  beforeEach(() => {
    backend = makeMockBackend();
    metrics = new Metrics({ namespace: "ecommerce", serviceName: "api" });
    metrics.setBackend(backend);
  });

  it("passes metric name, unit, and value to the backend", async () => {
    metrics.addMetric("successfulBooking", MetricUnit.Count, 1);
    await metrics.flush();

    const entry = backend.writtenEntries[0]?.entries[0];
    expect(entry?.name).toBe("successfulBooking");
    expect(entry?.unit).toBe("Count");
    expect(entry?.value).toBe(1);
  });

  it("batches multiple metrics into a single write call", async () => {
    metrics.addMetric("a", MetricUnit.Count, 1);
    metrics.addMetric("b", MetricUnit.Milliseconds, 42);
    await metrics.flush();

    expect(backend.writtenEntries).toHaveLength(1);
    expect(backend.writtenEntries[0]?.entries).toHaveLength(2);
  });

  it("clears entries after flush", async () => {
    metrics.addMetric("a", MetricUnit.Count, 1);
    await metrics.flush();
    await metrics.flush();

    expect(backend.writtenEntries).toHaveLength(1);
  });

  it("includes serviceName in context", async () => {
    metrics.addMetric("hits", MetricUnit.Count, 1);
    await metrics.flush();

    expect(backend.writtenEntries[0]?.context.serviceName).toBe("api");
  });
});

describe("Metrics / dimensions", () => {
  it("per-metric dimensions are included in entry dimensions", async () => {
    const backend = makeMockBackend();
    const metrics = new Metrics({ namespace: "ns", serviceName: "svc" });
    metrics.setBackend(backend);

    metrics.addMetric("successfulBooking", MetricUnit.Count, 1, {
      paymentMethod: "card",
    });
    await metrics.flush();

    const entry = backend.writtenEntries[0]?.entries[0];
    expect(entry?.dimensions["paymentMethod"]).toBe("card");
  });

  it("defaultDimensions are merged into every metric", async () => {
    const backend = makeMockBackend();
    const metrics = new Metrics({
      namespace: "ns",
      serviceName: "svc",
      defaultDimensions: { environment: "prod" },
    });
    metrics.setBackend(backend);

    metrics.addMetric("hits", MetricUnit.Count, 1);
    await metrics.flush();

    expect(backend.writtenEntries[0]?.entries[0]?.dimensions["environment"]).toBe("prod");
  });

  it("per-metric dimensions override defaultDimensions", async () => {
    const backend = makeMockBackend();
    const metrics = new Metrics({
      namespace: "ns",
      serviceName: "svc",
      defaultDimensions: { environment: "prod" },
    });
    metrics.setBackend(backend);

    metrics.addMetric("hits", MetricUnit.Count, 1, { environment: "staging" });
    await metrics.flush();

    expect(backend.writtenEntries[0]?.entries[0]?.dimensions["environment"]).toBe(
      "staging",
    );
  });

  it("different metrics can have different dimensions", async () => {
    const backend = makeMockBackend();
    const metrics = new Metrics({ namespace: "ns", serviceName: "svc" });
    metrics.setBackend(backend);

    metrics.addMetric("request_duration", MetricUnit.Milliseconds, 42, {
      route: "/orders",
      method: "GET",
      status: "200",
    });
    metrics.addMetric("itemCreated", MetricUnit.Count, 1, { paymentMethod: "card" });
    await metrics.flush();

    const entries = backend.writtenEntries[0]?.entries ?? [];
    expect(entries[0]?.dimensions).toEqual({
      route: "/orders",
      method: "GET",
      status: "200",
    });
    expect(entries[1]?.dimensions).toEqual({ paymentMethod: "card" });
  });

  it("no dimensions bleed between flushes", async () => {
    const backend = makeMockBackend();
    const metrics = new Metrics({ namespace: "ns" });
    metrics.setBackend(backend);

    metrics.addMetric("hits", MetricUnit.Count, 1, { route: "/orders" });
    await metrics.flush();

    metrics.addMetric("hits2", MetricUnit.Count, 1);
    await metrics.flush();

    expect(backend.writtenEntries[1]?.entries[0]?.dimensions["route"]).toBeUndefined();
  });
});

describe("Metrics / correlationId", () => {
  it("setCorrelationId includes correlation_id in context", async () => {
    const backend = makeMockBackend();
    const metrics = new Metrics({ namespace: "ns", serviceName: "svc" });
    metrics.setBackend(backend);

    metrics.setCorrelationId("req-123");
    metrics.addMetric("hits", MetricUnit.Count, 1);
    await metrics.flush();

    expect(backend.writtenEntries[0]?.context.correlationId).toBe("req-123");
  });

  it("correlationId is cleared after flush", async () => {
    const backend = makeMockBackend();
    const metrics = new Metrics({ namespace: "ns", serviceName: "svc" });
    metrics.setBackend(backend);

    metrics.setCorrelationId("req-123");
    metrics.addMetric("hits", MetricUnit.Count, 1);
    await metrics.flush();

    metrics.addMetric("hits2", MetricUnit.Count, 1);
    await metrics.flush();

    expect(backend.writtenEntries[1]?.context.correlationId).toBeUndefined();
  });

  it("context omits correlationId when not set", async () => {
    const backend = makeMockBackend();
    const metrics = new Metrics({ namespace: "ns", serviceName: "svc" });
    metrics.setBackend(backend);

    metrics.addMetric("hits", MetricUnit.Count, 1);
    await metrics.flush();

    expect(backend.writtenEntries[0]?.context.correlationId).toBeUndefined();
  });
});

describe("Metrics / flush", () => {
  it("warns when no backend is set", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const metrics = new Metrics({ namespace: "ns" });
    metrics.addMetric("x", MetricUnit.None, 1);

    await metrics.flush();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("No backend configured"),
    );
    vi.restoreAllMocks();
  });

  it("is a no-op when no entries are buffered", async () => {
    const backend = makeMockBackend();
    const metrics = new Metrics({ namespace: "ns" });
    metrics.setBackend(backend);

    await metrics.flush();

    expect(backend.writtenEntries).toHaveLength(0);
  });
});

describe("Metrics / flushSync", () => {
  it("calls backend.writeSync() synchronously", () => {
    const backend = makeMockBackend();
    const metrics = new Metrics({ namespace: "ns" });
    metrics.setBackend(backend);

    metrics.addMetric("hits", MetricUnit.Count, 1);
    metrics.addMetric("latency", MetricUnit.Milliseconds, 42);
    metrics.flushSync();

    expect(backend.writtenEntries).toHaveLength(1);
    expect(backend.writtenEntries[0]?.entries).toHaveLength(2);
  });

  it("clears entries after flushSync", () => {
    const backend = makeMockBackend();
    const metrics = new Metrics({ namespace: "ns" });
    metrics.setBackend(backend);

    metrics.addMetric("hits", MetricUnit.Count, 1);
    metrics.flushSync();
    metrics.flushSync();

    expect(backend.writtenEntries).toHaveLength(1);
  });

  it("warns when no backend is set", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const metrics = new Metrics({ namespace: "ns" });
    metrics.addMetric("x", MetricUnit.None, 1);

    metrics.flushSync();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("No backend configured"),
    );
    vi.restoreAllMocks();
  });
});

describe("Metrics / autoFlush", () => {
  it("writes each metric immediately via backend.writeSync()", () => {
    const backend = makeMockBackend();
    const metrics = new Metrics({ namespace: "ns", autoFlush: true });
    metrics.setBackend(backend);

    metrics.addMetric("hits", MetricUnit.Count, 1);
    expect(backend.writtenEntries).toHaveLength(1);

    metrics.addMetric("latency", MetricUnit.Milliseconds, 42);
    expect(backend.writtenEntries).toHaveLength(2);
  });

  it("flush() is a no-op in autoFlush mode", async () => {
    const backend = makeMockBackend();
    const metrics = new Metrics({ namespace: "ns", autoFlush: true });
    metrics.setBackend(backend);

    metrics.addMetric("hits", MetricUnit.Count, 1);
    await metrics.flush();

    expect(backend.writtenEntries).toHaveLength(1);
  });

  it("per-metric dimensions work with autoFlush", () => {
    const backend = makeMockBackend();
    const metrics = new Metrics({ namespace: "ns", autoFlush: true });
    metrics.setBackend(backend);

    metrics.addMetric("hits", MetricUnit.Count, 1, { route: "/orders" });
    metrics.addMetric("latency", MetricUnit.Milliseconds, 42, { route: "/payments" });

    expect(backend.writtenEntries[0]?.entries[0]?.dimensions["route"]).toBe("/orders");
    expect(backend.writtenEntries[1]?.entries[0]?.dimensions["route"]).toBe("/payments");
  });
});

describe("Metrics / PipelinesBackend (integration)", () => {
  it("sends named-field JSON records with metric value as metric_value", async () => {
    const { PipelinesBackend } = await import("../../src/pipelinesBackend");

    const sent: unknown[] = [];
    const fakePipeline = {
      send: vi.fn(async (records: unknown[]) => sent.push(...records)),
    };

    const backend = new PipelinesBackend({
      binding: fakePipeline as unknown as PipelineBinding,
    });

    const metrics = new Metrics({ namespace: "ecommerce", serviceName: "orders" });
    metrics.setBackend(backend);
    metrics.addMetric("successfulBooking", MetricUnit.Count, 1, { environment: "prod" });
    await metrics.flush();

    expect(fakePipeline.send).toHaveBeenCalledOnce();
    const record = sent[0] as Record<string, unknown>;
    expect(record["namespace"]).toBe("ecommerce");
    expect(record["service"]).toBe("orders");
    expect(record["metric_name"]).toBe("successfulBooking");
    expect(record["metric_unit"]).toBe("Count");
    expect(record["metric_value"]).toBe(1);
    expect(record["environment"]).toBe("prod");
    expect(typeof record["timestamp"]).toBe("string");
  });

  it("does not include correlation_id when undefined", async () => {
    const { PipelinesBackend } = await import("../../src/pipelinesBackend");
    const sent: unknown[] = [];
    const fakePipeline = {
      send: vi.fn(async (records: unknown[]) => sent.push(...records)),
    };
    const backend = new PipelinesBackend({
      binding: fakePipeline as unknown as PipelineBinding,
    });

    await backend.write(
      [
        {
          name: "hits",
          unit: MetricUnit.Count,
          value: 1,
          dimensions: {},
          timestamp: Date.now(),
        },
      ],
      { namespace: "ns", serviceName: "svc" },
    );

    expect((sent[0] as Record<string, unknown>)["correlation_id"]).toBeUndefined();
  });

  it("includes correlation_id when provided in context", async () => {
    const { PipelinesBackend } = await import("../../src/pipelinesBackend");
    const sent: unknown[] = [];
    const fakePipeline = {
      send: vi.fn(async (records: unknown[]) => sent.push(...records)),
    };
    const backend = new PipelinesBackend({
      binding: fakePipeline as unknown as PipelineBinding,
    });

    await backend.write(
      [
        {
          name: "hits",
          unit: MetricUnit.Count,
          value: 1,
          dimensions: {},
          timestamp: Date.now(),
        },
      ],
      { namespace: "ns", serviceName: "svc", correlationId: "req-123" },
    );

    expect((sent[0] as Record<string, unknown>)["correlation_id"]).toBe("req-123");
  });
});

describe("Metrics / AnalyticsEngineBackend (integration)", () => {
  it("calls writeDataPoint with metric value in doubles[0]", async () => {
    const { AnalyticsEngineBackend } = await import("../../src/analyticsEngineBackend");
    const writeDataPoint = vi.fn();
    const binding = { writeDataPoint } as unknown as AnalyticsEngineDataset;
    const backend = new AnalyticsEngineBackend({ binding });

    await backend.write(
      [
        {
          name: "orderCount",
          unit: MetricUnit.Count,
          value: 5,
          dimensions: {},
          timestamp: Date.now(),
        },
      ],
      { namespace: "ecommerce", serviceName: "orders" },
    );

    expect(writeDataPoint).toHaveBeenCalledOnce();
    const call = writeDataPoint.mock.calls[0]?.[0];
    expect(call?.doubles[0]).toBe(5);
  });

  it("packs namespace and metric_name into blobs positionally", async () => {
    const { AnalyticsEngineBackend } = await import("../../src/analyticsEngineBackend");
    const writeDataPoint = vi.fn();
    const backend = new AnalyticsEngineBackend({
      binding: { writeDataPoint } as unknown as AnalyticsEngineDataset,
    });

    await backend.write(
      [
        {
          name: "orderCount",
          unit: MetricUnit.Count,
          value: 1,
          dimensions: {},
          timestamp: Date.now(),
        },
      ],
      { namespace: "ecommerce", serviceName: "orders" },
    );

    const call = writeDataPoint.mock.calls[0]?.[0];
    expect(call?.blobs).toContain("ecommerce");
    expect(call?.blobs).toContain("orderCount");
  });
});
