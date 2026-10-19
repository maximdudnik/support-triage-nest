/**
 * GET /health - liveness/readiness info for load balancers, k8s probes and humans.
 * Reports whether the LLM is configured, the RAG mode, and token totals.
 * (For real k8s use, split into /health/live and /health/ready, e.g. with @nestjs/terminus.)
 */
import { Controller, Get, Inject } from '@nestjs/common';
import { LLM_PROVIDER, type LlmProvider } from '../llm/llm.types';
import { TokenUsageService } from '../llm/token-usage.service';
import { RagService } from '../rag/rag.service';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly rag: RagService,
    private readonly usage: TokenUsageService,
  ) {}

  @Get()
  check() {
    return {
      status: 'ok',
      uptimeSec: Math.round(process.uptime()),
      llm: { model: this.llm.modelName, configured: this.llm.isConfigured() },
      rag: this.rag.stats(),
      tokenUsage: this.usage.snapshot(),
    };
  }
}
