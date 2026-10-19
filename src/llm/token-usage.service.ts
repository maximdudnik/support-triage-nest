/**
 * Token usage tracking.
 *
 * CONCEPT: Cost observability. With LLMs, cost and latency scale with tokens,
 * so you must measure them per feature/agent to know what to optimise
 * (shorter prompts? smaller model for the router? cache?).
 *
 * This singleton keeps process-wide totals per agent (exposed on /health).
 * Per-request usage is returned in each ticket response by the orchestrator.
 * In production you would export these as Prometheus/OpenTelemetry metrics.
 */
import { Injectable } from '@nestjs/common';
import { TokenUsage } from './llm.types';

export const emptyUsage = (): TokenUsage => ({ promptTokens: 0, outputTokens: 0, totalTokens: 0 });

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

@Injectable() // default scope = SINGLETON: one instance shared by the whole app
export class TokenUsageService {
  private readonly byAgent = new Map<string, TokenUsage & { calls: number }>();

  record(agent: string, usage: TokenUsage): void {
    const prev = this.byAgent.get(agent) ?? { ...emptyUsage(), calls: 0 };
    this.byAgent.set(agent, { ...addUsage(prev, usage), calls: prev.calls + 1 });
  }

  snapshot(): { total: TokenUsage; byAgent: Record<string, TokenUsage & { calls: number }> } {
    let total = emptyUsage();
    for (const u of this.byAgent.values()) total = addUsage(total, u);
    return { total, byAgent: Object.fromEntries(this.byAgent) };
  }
}
