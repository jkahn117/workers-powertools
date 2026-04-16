import { createStart } from "@tanstack/react-start";
import { injectObservability } from "@workers-powertools/tanstack-start/observability";
import { injectServerFnTracer } from "@workers-powertools/tanstack-start/tracer";
import { logger } from "./lib/logger";
import { metrics } from "./lib/metrics";
import { tracer } from "./lib/tracer";

const requestObservabilityMiddleware = injectObservability({
  logger,
  tracer,
  metrics,
  componentName: "server",
});

const serverFnObservabilityMiddleware = injectServerFnTracer({
  tracer,
});

export const startInstance = createStart(() => ({
  requestMiddleware: [requestObservabilityMiddleware],
  functionMiddleware: [serverFnObservabilityMiddleware],
}));
