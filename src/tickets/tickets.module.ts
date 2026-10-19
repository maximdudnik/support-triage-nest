import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module';
import { LlmModule } from '../llm/llm.module';
import { RagModule } from '../rag/rag.module';
import { HealthController } from './health.controller';
import { TicketsController } from './tickets.controller';

/**
 * Feature module for the HTTP API.
 * Note: importing LlmModule/RagModule here does NOT create second instances -
 * Nest modules are singletons, so everyone shares the same GeminiService and index.
 */
@Module({
  imports: [AgentsModule, LlmModule, RagModule],
  controllers: [TicketsController, HealthController],
})
export class TicketsModule {}
