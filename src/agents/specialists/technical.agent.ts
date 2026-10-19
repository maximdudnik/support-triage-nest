/** TechnicalAgent - a specialist with no tools: pure RAG + generation. */
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { LLM_PROVIDER, type LlmProvider } from '../../llm/llm.types';
import { RagService } from '../../rag/rag.service';
import { SpecialistAgent } from './specialist.agent';

@Injectable()
export class TechnicalAgent extends SpecialistAgent {
  readonly name = 'technical-specialist';
  readonly category = 'technical' as const;
  protected readonly kbSource = 'technical.md';
  protected readonly persona =
    'You troubleshoot bugs and errors. Give numbered, concrete troubleshooting steps from the knowledge base and ask for missing diagnostics (app version, OS, screenshots) if needed.';

  constructor(@Inject(LLM_PROVIDER) llm: LlmProvider, rag: RagService, config: ConfigService<AppConfig, true>) {
    super(llm, rag, config);
  }
}
