/**
 * Builds a Nest testing module with the real wiring but a mocked LLM.
 * CONCEPT: `Test.createTestingModule(...).overrideProvider(TOKEN)` is the
 * payoff of injecting by token - one line swaps Gemini for a fake everywhere.
 */
import { ModuleMetadata } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import configuration from '../config/configuration';
import { LLM_PROVIDER } from '../llm/llm.types';
import { MockLlmProvider } from './mock-llm.provider';

export async function createTestingModule(
  imports: ModuleMetadata['imports'],
  mock = new MockLlmProvider(),
): Promise<{ moduleRef: TestingModule; mock: MockLlmProvider }> {
  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true, load: [configuration], ignoreEnvFile: true }), ...(imports ?? [])],
  })
    .overrideProvider(LLM_PROVIDER)
    .useValue(mock)
    .compile();
  return { moduleRef, mock };
}

/** Deterministic env for tests: keyword RAG, no real key, fast retries. */
export function setTestEnv(): void {
  process.env.GEMINI_API_KEY = '';
  process.env.RAG_USE_EMBEDDINGS = 'false';
  process.env.KB_DIR = 'kb';
  process.env.LLM_RETRY_BASE_DELAY_MS = '0';
  process.env.AGENT_MAX_TOOL_STEPS = '4';
}
