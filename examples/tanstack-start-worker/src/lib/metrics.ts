import { Metrics } from "@workers-powertools/metrics";

export const metrics = new Metrics({
  namespace: "workers-powertools-example",
  serviceName: "tanstack-start-worker",
});
