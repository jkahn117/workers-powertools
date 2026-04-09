/**
 * Base configuration shared across all Powertools utilities.
 */
export interface PowertoolsConfig {
  /** Logical name of the service (e.g., "payment-api") */
  serviceName?: string;

  /**
   * Whether the toolkit is running in development mode.
   * When true, utilities may emit additional debug information.
   * Can also be set via the POWERTOOLS_DEV environment variable.
   */
  devMode?: boolean;
}

/**
 * Normalized representation of the Workers execution context
 * and Cloudflare-specific request properties.
 */
export interface WorkersContext {
  /** Cloudflare Ray ID from the cf-ray header */
  cfRay?: string;

  /** Cloudflare colo that handled the request (e.g., "SJC") */
  colo?: string;

  /** Two-letter country code of the client */
  country?: string;

  /** ASN of the client network */
  asn?: number;

  /** Whether this is the first request to this isolate instance */
  coldStart: boolean;

  /** Correlation ID for the current request */
  correlationId: string;
}

/**
 * Configuration for correlation ID extraction and generation.
 */
export interface CorrelationIdConfig {
  /**
   * Header name to extract correlation ID from.
   * Checked in order; first non-empty value wins.
   * @default ["x-request-id", "x-correlation-id", "cf-ray"]
   */
  headerNames?: string[];

  /**
   * Whether to generate a correlation ID if none is found in headers.
   * @default true
   */
  generateIfMissing?: boolean;
}
