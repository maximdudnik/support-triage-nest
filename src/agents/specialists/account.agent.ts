/** AccountAgent - a specialist with no tools: pure RAG + generation. */
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { LLM_PROVIDER, type LlmProvider } from '../../llm/llm.types';
import { RagService } from '../../rag/rag.service';
import { SpecialistAgent } from './specialist.agent';

@Injectable()
export class AccountAgent extends SpecialistAgent {
  readonly name = 'account-specialist';
  readonly category = 'account' as const;
  protected readonly kbSource = 'account.md';
  protected readonly persona =
    'You handle login, password, 2FA and account changes. Never ask for or reveal passwords or full card numbers; for identity-sensitive changes, point to the verified self-service flow described in the knowledge base.';

  constructor(@Inject(LLM_PROVIDER) llm: LlmProvider, rag: RagService, config: ConfigService<AppConfig, true>) {
    super(llm, rag, config);
  }
}
