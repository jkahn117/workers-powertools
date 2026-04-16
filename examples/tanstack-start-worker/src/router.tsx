import { createRouter } from "@tanstack/react-router";
import type { Metrics } from "@workers-powertools/metrics";
import type { Logger } from "@workers-powertools/logger";
import type { Tracer } from "@workers-powertools/tracer";
import type { AppEnv } from "./env";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: "intent",
    scrollRestoration: true,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
    server: {
      requestContext: {
        env: AppEnv;
        ctx: ExecutionContext;
        logger?: Logger;
        tracer?: Tracer;
        metrics?: Metrics;
        correlationId?: string;
      };
    };
  }
}
