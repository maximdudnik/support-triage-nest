/**
 * LlmModule - owns everything about talking to a model.
 *
 * CONCEPT: NestJS modules & custom providers.
 *  - `providers` registers classes in this module's DI container.
 *  - `{ provide: LLM_PROVIDER, useExisting: GeminiService }` is a CUSTOM
 *    PROVIDER: "whoever asks for the LLM_PROVIDER token gets the GeminiService
 *    singleton". Tests replace it with `.overrideProvider(LLM_PROVIDER)`.
 *    Other options: useClass (new instance of a class), useValue (a constant /
 *    mock object), useFactory (computed, can be async and inject deps).
 *  - `exports` makes providers visible to modules that import LlmModule.
 *    Everything not exported is private to the module (encapsulation).
 *  - @Global() would avoid importing it everywhere; we import explicitly so
 *    module dependencies stay visible - a deliberate design choice.
 */
import { Module } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { LLM_PROVIDER } from './llm.types';
import { TokenUsageService } from './token-usage.service';

@Module({
  providers: [
    TokenUsageService,
    GeminiService,
    { provide: LLM_PROVIDER, useExisting: GeminiService },
  ],
  exports: [LLM_PROVIDER, TokenUsageService],
})
export class LlmModule {}
