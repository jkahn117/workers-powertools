import { createStart } from "@tanstack/react-start";
import { injectObservability } from "@workers-powertools/tanstack-start/observability";
import { logger } from "./lib/logger";
import { metrics } from "./lib/metrics";

const requestObservabilityMiddleware = injectObservability({
  logger,
  metrics,
  wideEvent: true,
  componentName: "server",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [requestObservabilityMiddleware],
}));
