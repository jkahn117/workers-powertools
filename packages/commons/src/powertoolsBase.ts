import type { PowertoolsConfig } from "./types";

/**
 * Base class for all Powertools utilities.
 * Provides shared configuration and environment variable resolution.
 */
export abstract class PowertoolsBase {
  protected readonly serviceName: string;
  protected readonly devMode: boolean;

  constructor(config?: PowertoolsConfig) {
    this.serviceName = config?.serviceName ?? "service_undefined";
    this.devMode = config?.devMode ?? false;
  }

  /**
   * Resolve a configuration value from an explicit option or an
   * environment variable, with a fallback default.
   */
  protected resolveConfig<T>(
    explicitValue: T | undefined,
    envValue: string | undefined,
    defaultValue: T,
    parser?: (raw: string) => T,
  ): T {
    if (explicitValue !== undefined) {
      return explicitValue;
    }

    if (envValue !== undefined && envValue !== "") {
      return parser ? parser(envValue) : (envValue as unknown as T);
    }

    return defaultValue;
  }
}
