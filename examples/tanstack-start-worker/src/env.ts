import type { PipelineBinding } from "@workers-powertools/metrics";

export interface AppEnv {
  METRICS_PIPELINE?: PipelineBinding;
}
