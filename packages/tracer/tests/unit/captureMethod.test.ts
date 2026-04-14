import { describe, it, expect, vi, afterEach } from "vitest";
import { Tracer } from "../../src/tracer";

/**
 * captureMethod() is a decorator factory — it returns a standard TC39
 * Stage 3 ClassMethodDecoratorContext-compatible function. We test it
 * by calling the factory directly and applying the returned decorator
 * manually, rather than using @ syntax in the test file itself.
 *
 * This avoids needing esbuild to lower decorator syntax in tests while
 * still fully exercising the decorator logic. The @ syntax in real
 * application code is transformed by tsup at build time.
 */

const tracer = new Tracer({ serviceName: "svc" });

/** Helper to extract trace_span entries from console.log output. */
async function captureSpans(fn: () => Promise<void>) {
  const spans: Record<string, unknown>[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((msg: string) => {
    try {
      const parsed = JSON.parse(msg) as Record<string, unknown>;
      if (parsed["type"] === "trace_span") spans.push(parsed);
    } catch {
      // non-JSON log — ignore
    }
  });
  await fn().finally(() => spy.mockRestore());
  return spans;
}

/**
 * Apply a captureMethod decorator to a plain async function, simulating
 * what the TC39 decorator runtime does at class decoration time.
 *
 * context.name     — the method name string
 * context.addInitializer — called with `this` = the class instance
 */
function applyDecorator<T>(
  method: (...args: unknown[]) => Promise<T>,
  options: {
    className: string;
    methodName: string;
    decoratorOptions?: Parameters<typeof tracer.captureMethod>[0];
  },
): (instance: object, ...args: unknown[]) => Promise<T> {
  const { className, methodName, decoratorOptions } = options;

  // Simulate ClassMethodDecoratorContext
  let initializerFn: ((this: unknown) => void) | undefined;
  const context = {
    name: methodName,
    kind: "method" as const,
    static: false,
    private: false,
    addInitializer(fn: (this: unknown) => void) {
      initializerFn = fn;
    },
    access: { has: () => true, get: () => method },
    metadata: {},
  };

  const decorated = tracer.captureMethod(decoratorOptions)(method, context);

  // Create a fake instance to run the initializer (sets className on spanName)
  const fakeInstance = { constructor: { name: className } };
  initializerFn?.call(fakeInstance);

  // Return a bound wrapper that simulates calling the method on an instance
  return (instance: object, ...args: unknown[]) => decorated.call(instance, ...args);
}

describe("Tracer / captureMethod() decorator", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    tracer.setCorrelationId(undefined);
  });

  it("wraps an async method and emits a span", async () => {
    const processPayment = async (amount: number) => amount * 2;
    const wrapped = applyDecorator(
      processPayment as unknown as (...args: unknown[]) => Promise<number>,
      { className: "PaymentService", methodName: "processPayment" },
    );

    const spans = await captureSpans(async () => {
      const result = await wrapped({}, 5);
      expect(result).toBe(10);
    });

    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({
      type: "trace_span",
      span_name: "PaymentService.processPayment",
      success: true,
    });
  });

  it("derives span name as ClassName.methodName by default", async () => {
    const save = async () => {};
    const wrapped = applyDecorator(
      save as unknown as (...args: unknown[]) => Promise<void>,
      { className: "DeckRepository", methodName: "save" },
    );

    const spans = await captureSpans(async () => {
      await wrapped({});
    });

    expect(spans[0]?.["span_name"]).toBe("DeckRepository.save");
  });

  it("uses the explicit name option when provided", async () => {
    const generate = async () => {};
    const wrapped = applyDecorator(
      generate as unknown as (...args: unknown[]) => Promise<void>,
      {
        className: "SlideBuilder",
        methodName: "generate",
        decoratorOptions: { name: "buildSlides" },
      },
    );

    const spans = await captureSpans(async () => {
      await wrapped({});
    });

    expect(spans[0]?.["span_name"]).toBe("buildSlides");
  });

  it("records success: false and error when the method throws", async () => {
    const placeOrder = async () => {
      throw new Error("out of stock");
    };
    const wrapped = applyDecorator(
      placeOrder as unknown as (...args: unknown[]) => Promise<void>,
      { className: "OrderService", methodName: "placeOrder" },
    );

    const spans = await captureSpans(async () => {
      await wrapped({}).catch(() => {});
    });

    expect(spans[0]).toMatchObject({ success: false, error: "out of stock" });
  });

  it("re-throws errors by default", async () => {
    const fail = async () => {
      throw new Error("boom");
    };
    const wrapped = applyDecorator(
      fail as unknown as (...args: unknown[]) => Promise<void>,
      { className: "Svc", methodName: "fail" },
    );

    await expect(wrapped({})).rejects.toThrow("boom");
  });

  it("swallows errors when rethrowError is false", async () => {
    const fail = async (): Promise<string> => {
      throw new Error("swallowed");
    };
    const wrapped = applyDecorator(
      fail as unknown as (...args: unknown[]) => Promise<string>,
      { className: "Svc", methodName: "fail", decoratorOptions: { rethrowError: false } },
    );

    const result = await wrapped({});
    expect(result).toBeUndefined();
  });

  it("preserves the return value from the original method", async () => {
    const add = async (a: number, b: number) => a + b;
    const wrapped = applyDecorator(
      add as unknown as (...args: unknown[]) => Promise<number>,
      { className: "Calculator", methodName: "add" },
    );

    expect(await wrapped({}, 3, 4)).toBe(7);
  });

  it("preserves the `this` context inside the decorated method", async () => {
    const instance = { count: 0 };
    const increment = async function (this: typeof instance) {
      this.count += 1;
      return this.count;
    };
    const wrapped = applyDecorator(
      increment as unknown as (...args: unknown[]) => Promise<number>,
      { className: "Counter", methodName: "increment" },
    );

    await wrapped(instance);
    await wrapped(instance);
    expect(instance.count).toBe(2);
  });

  it("records duration_ms > 0 on the span", async () => {
    const slow = async () => {
      await new Promise((r) => setTimeout(r, 10));
    };
    const wrapped = applyDecorator(
      slow as unknown as (...args: unknown[]) => Promise<void>,
      { className: "Svc", methodName: "slow" },
    );

    const spans = await captureSpans(async () => {
      await wrapped({});
    });

    expect(spans[0]?.["duration_ms"]).toBeGreaterThan(0);
  });

  it("includes the correlation_id from the tracer on the span", async () => {
    const doWork = async () => {};
    const wrapped = applyDecorator(
      doWork as unknown as (...args: unknown[]) => Promise<void>,
      { className: "Svc", methodName: "doWork" },
    );

    tracer.setCorrelationId("test-corr-id");

    const spans = await captureSpans(async () => {
      await wrapped({});
    });

    expect(spans[0]?.["correlation_id"]).toBe("test-corr-id");
  });

  it("multiple decorated methods each get their own span", async () => {
    const validate = async () => {};
    const transform = async () => {};

    const wrappedValidate = applyDecorator(
      validate as unknown as (...args: unknown[]) => Promise<void>,
      { className: "Pipeline", methodName: "validate" },
    );
    const wrappedTransform = applyDecorator(
      transform as unknown as (...args: unknown[]) => Promise<void>,
      { className: "Pipeline", methodName: "transform" },
    );

    const spans = await captureSpans(async () => {
      await wrappedValidate({});
      await wrappedTransform({});
    });

    const names = spans.map((s) => s["span_name"]);
    expect(names).toContain("Pipeline.validate");
    expect(names).toContain("Pipeline.transform");
  });

  it.todo("span annotations added inside the method appear on the span");
  it.todo("nested decorated methods produce correctly named child spans");
});
