import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Metrics } from "../../src/metrics";
import { MetricUnit } from "../../src/units";

/** Minimal Analytics Engine binding mock. */
function makeAnalyticsBinding() {
  return { writeDataPoint: vi.fn() };
}

describe("Metrics / initialization", () => {
  it("requires a namespace", () => {
    const metrics = new Metrics({ namespace: "ecommerce", serviceName: "api" });
    expect(metrics).toBeDefined();
  });

  it.todo("accepts defaultDimensions merged into every metric");
});

describe("Metrics / addMetric", () => {
  let metrics: Metrics;
  let binding: ReturnType<typeof makeAnalyticsBinding>;

  beforeEach(() => {
    binding = makeAnalyticsBinding();
    metrics = new Metrics({ namespace: "ecommerce", serviceName: "api" });
    metrics.setBinding(binding as unknown as AnalyticsEngineDataset);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls writeDataPoint with metric value in doubles", async () => {
    metrics.addMetric("orderCount", MetricUnit.Count, 1);
    await metrics.flush();

    expect(binding.writeDataPoint).toHaveBeenCalledOnce();
    const call = binding.writeDataPoint.mock.calls[0]?.[0];
    expect(call?.doubles).toContain(1);
  });

  it("includes namespace and metric_name in blobs", async () => {
    metrics.addMetric("orderCount", MetricUnit.Count, 5);
    await metrics.flush();

    const call = binding.writeDataPoint.mock.calls[0]?.[0];
    expect(call?.blobs).toContain("ecommerce");
    expect(call?.blobs).toContain("orderCount");
  });

  it("clears entries after flush", async () => {
    metrics.addMetric("a", MetricUnit.Count, 1);
    await metrics.flush();
    await metrics.flush(); // second flush should be a no-op

    expect(binding.writeDataPoint).toHaveBeenCalledTimes(1);
  });

  it.todo("respects MAX_BLOBS limit of 20 dimensions");
  it.todo("writes multiple metrics in the same flush call");
});

describe("Metrics / dimensions", () => {
  it("addDimension includes key-value pair in blobs", async () => {
    const binding = makeAnalyticsBinding();
    const metrics = new Metrics({ namespace: "ns", serviceName: "svc" });
    metrics.setBinding(binding as unknown as AnalyticsEngineDataset);

    metrics.addDimension("endpoint", "/orders");
    metrics.addMetric("hits", MetricUnit.Count, 1);
    await metrics.flush();

    const call = binding.writeDataPoint.mock.calls[0]?.[0];
    expect(call?.blobs).toContain("/orders");
  });

  it.todo("defaultDimensions are included when no request dimensions are set");
  it.todo("request dimensions are cleared after flush");
});

describe("Metrics / flush", () => {
  it("warns when no binding is set", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const metrics = new Metrics({ namespace: "ns", serviceName: "svc" });
    metrics.addMetric("x", MetricUnit.None, 1);

    await metrics.flush();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("No Analytics Engine binding"),
    );
  });
});

describe("Metrics / flushSync", () => {
  it("writes buffered entries synchronously", () => {
    const binding = makeAnalyticsBinding();
    const metrics = new Metrics({ namespace: "ns", serviceName: "svc" });
    metrics.setBinding(binding as unknown as AnalyticsEngineDataset);

    metrics.addMetric("hits", MetricUnit.Count, 1);
    metrics.addMetric("latency", MetricUnit.Milliseconds, 42);
    metrics.flushSync();

    expect(binding.writeDataPoint).toHaveBeenCalledTimes(2);
  });

  it("clears entries after flushSync", () => {
    const binding = makeAnalyticsBinding();
    const metrics = new Metrics({ namespace: "ns", serviceName: "svc" });
    metrics.setBinding(binding as unknown as AnalyticsEngineDataset);

    metrics.addMetric("hits", MetricUnit.Count, 1);
    metrics.flushSync();
    metrics.flushSync(); // second call should be a no-op

    expect(binding.writeDataPoint).toHaveBeenCalledTimes(1);
  });

  it("warns when no binding is set", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const metrics = new Metrics({ namespace: "ns", serviceName: "svc" });
    metrics.addMetric("x", MetricUnit.None, 1);

    metrics.flushSync();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("No Analytics Engine binding"),
    );
  });
});

describe("Metrics / autoFlush", () => {
  it("writes each metric immediately on addMetric()", () => {
    const binding = makeAnalyticsBinding();
    const metrics = new Metrics({
      namespace: "ns",
      serviceName: "svc",
      autoFlush: true,
    });
    metrics.setBinding(binding as unknown as AnalyticsEngineDataset);

    metrics.addMetric("hits", MetricUnit.Count, 1);
    expect(binding.writeDataPoint).toHaveBeenCalledTimes(1);

    metrics.addMetric("latency", MetricUnit.Milliseconds, 42);
    expect(binding.writeDataPoint).toHaveBeenCalledTimes(2);
  });

  it("flush() is a no-op in autoFlush mode", async () => {
    const binding = makeAnalyticsBinding();
    const metrics = new Metrics({
      namespace: "ns",
      serviceName: "svc",
      autoFlush: true,
    });
    metrics.setBinding(binding as unknown as AnalyticsEngineDataset);

    metrics.addMetric("hits", MetricUnit.Count, 1);
    await metrics.flush(); // should not double-write

    expect(binding.writeDataPoint).toHaveBeenCalledTimes(1);
  });

  it.todo("warns on addMetric() when binding not yet set in autoFlush mode");
});
