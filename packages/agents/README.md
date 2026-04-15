# @workers-powertools/agents

Cloudflare Agents SDK integration for Workers Powertools. Provides instrumentation helpers for Agent RPC methods, Durable Object lifecycle methods, and WebSocket connections — where no `Request` object is available and context must be extracted from the Agents SDK or passed explicitly through RPC arguments.

Part of [Workers Powertools](../../README.md) — a developer toolkit for observability and reliability best practices on Cloudflare Workers, inspired by [Powertools for AWS Lambda](https://docs.powertools.aws.dev/lambda/typescript/latest/).

## Features

- **Auto-resolved agent context** — extracts agent name and connection ID from `getCurrentAgent()` without requiring `this`
- **Logger + tracer integration** — enriches both utilities in a single call
- **`using`-based cleanup** — automatic context disposal on scope exit, even on throw
- **Graceful degradation** — works outside agent contexts (e.g., in tests) without errors

## Installation

```bash
pnpm add @workers-powertools/agents
```

## Quick Start

```typescript
import { Agent } from "agents";
import { Logger } from "@workers-powertools/logger";
import { Tracer } from "@workers-powertools/tracer";
import { injectAgentContext } from "@workers-powertools/agents";

const logger = new Logger({ serviceName: "slide-builder" });
const tracer = new Tracer({ serviceName: "slide-builder" });
const agentLog = logger.withComponent("SlideBuilder");

export class SlideBuilder extends Agent<Env> {
  async generateSlides(prompt: string, correlationId?: string) {
    using _ctx = injectAgentContext({
      logger: agentLog,
      tracer,
      operation: "generateSlides",
      correlationId,
    });

    agentLog.info("generating slides", { prompt });
    // { component: "SlideBuilder", agent: "slide-builder-instance",
    //   operation: "generateSlides", connection_id: "conn_abc",
    //   correlation_id: "req-123", ... }
  }

  async onAlarm() {
    using _ctx = injectAgentContext({ logger: agentLog, operation: "onAlarm" });
    agentLog.info("alarm fired");
  }
}
```

## API

| Export                        | Description                                                        |
| ----------------------------- | ------------------------------------------------------------------ |
| `injectAgentContext(options)` | Enrich logger/tracer with agent context; returns disposable handle |
| `AgentContextOptions`         | Options: `logger`, `tracer`, `operation`, `correlationId`, `extra` |
| `AgentContextHandle`          | Disposable handle with `correlationId` and `Symbol.dispose`        |
