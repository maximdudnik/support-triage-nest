/** GeneralAgent - a specialist with no tools: pure RAG + generation. */
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { LLM_PROVIDER, type LlmProvider } from '../../llm/llm.types';
import { RagService } from '../../rag/rag.service';
import { SpecialistAgent } from './specialist.agent';

@Injectable()
export class GeneralAgent extends SpecialistAgent {
  readonly name = 'general-specialist';
  readonly category = 'general' as const;
  protected readonly kbSource = 'general.md';
  protected readonly persona =
    'You answer general product questions and feedback. Thank the customer for feedback and be clear about what exists today versus what you cannot confirm.';

  constructor(@Inject(LLM_PROVIDER) llm: LlmProvider, rag: RagService, config: ConfigService<AppConfig, true>) {
    super(llm, rag, config);
  }
}
