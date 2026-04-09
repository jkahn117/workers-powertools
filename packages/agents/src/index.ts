/**
 * @workers-powertools/agents
 *
 * Cloudflare Agents SDK integration for Workers Powertools.
 *
 * Provides instrumentation helpers for Agent RPC methods, Durable Object
 * lifecycle methods, and WebSocket connections — where no Request object
 * is available and context must be extracted from the Agents SDK or passed
 * explicitly through RPC arguments.
 */

export { injectAgentContext } from "./injectAgentContext";
export type { AgentContextOptions, AgentContextHandle } from "./injectAgentContext";
