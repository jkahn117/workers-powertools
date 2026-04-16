import { Tracer } from "@workers-powertools/tracer";

export const tracer = new Tracer({
  serviceName: "tanstack-start-worker",
});
