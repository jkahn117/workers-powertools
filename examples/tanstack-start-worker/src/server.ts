import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import type { AppEnv } from "./env";

const handler = createStartHandler(({ request, router, responseHeaders }) => {
  return defaultStreamHandler({
    request,
    router,
    responseHeaders,
  });
});

export default {
  async fetch(request: Request, env: AppEnv, ctx: ExecutionContext) {
    return handler(request, {
      context: {
        env,
        ctx,
      } as any,
    });
  },
};
