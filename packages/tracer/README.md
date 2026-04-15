# @workers-powertools/tracer

Request correlation and trace enrichment for Cloudflare Workers. Complements the platform's built-in automatic tracing with correlation ID propagation, custom application-level spans, and outbound fetch instrumentation.

Part of [Workers Powertools](../../README.md) — a developer toolkit for observability and reliability best practices on Cloudflare Workers, inspired by [Powertools for AWS Lambda](https://docs.powertools.aws.dev/lambda/typescript/latest/).

## Features

- **Correlation ID management** — extract from request headers or auto-generate; propagate on outbound `fetch` calls
- **Custom spans** — `captureAsync()` wraps async operations with timing, annotations, and error state
- **Method decorators** — `@tracer.captureMethod()` automatically wraps class methods in named spans (TC39 Stage 3)
- **Outbound fetch instrumentation** — `captureFetch()` injects `x-correlation-id` and `x-request-id` headers
- **Structured span output** — spans are emitted as JSON log entries compatible with Workers Observability

## Installation

```bash
pnpm add @workers-powertools/tracer
```

## Quick Start

### Basic usage — Workers fetch handler

```typescript
import { Tracer } from "@workers-powertools/tracer";

const tracer = new Tracer({ serviceName: "payment-api" });

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    tracer.addContext(request, ctx, env);

    const result = await tracer.captureAsync("processPayment", async (span) => {
      span.annotations["paymentMethod"] = "credit_card";
      return await chargeCustomer(request);
    });

    await tracer.captureFetch("https://notifications.example.com/send", {
      method: "POST",
      body: JSON.stringify({ orderId: result.id }),
    });

    return new Response(JSON.stringify(result));
  },
};
```

### Method decorators

```typescript
class PaymentService {
  @tracer.captureMethod()
  async processPayment(amount: number): Promise<Receipt> {
    // span: "PaymentService.processPayment"
    return charge(amount);
  }

  @tracer.captureMethod({ name: "chargeCard" })
  async internalCharge(): Promise<void> {
    // span: "chargeCard"
  }
}
```

Requires TypeScript 5+ with `experimentalDecorators: false` (TC39 Stage 3 decorator syntax).

### With Hono

```typescript
import { injectTracer } from "@workers-powertools/hono";

app.use(injectTracer(tracer));
```

The middleware calls `addContext()` and wraps the handler in a route-level span named `METHOD /path`.

## API

| Method                            | Description                                                |
| --------------------------------- | ---------------------------------------------------------- |
| `addContext(request, ctx?, env?)` | Extract correlation ID and apply env var config            |
| `setCorrelationId(id)`            | Explicitly set the correlation ID                          |
| `getCorrelationId()`              | Get the current correlation ID                             |
| `captureAsync(name, fn)`          | Create a custom span around an async operation             |
| `captureFetch(input, init?)`      | Fetch with automatic correlation ID propagation            |
| `captureMethod(options?)`         | Decorator factory for async class methods                  |
| `putAnnotation(key, value)`       | Attach a low-cardinality annotation to the current context |
