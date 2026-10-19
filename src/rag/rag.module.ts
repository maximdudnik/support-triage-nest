import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { RagService } from './rag.service';

/** RagModule depends on LlmModule (for embeddings) and exports RagService to agents. */
@Module({
  imports: [LlmModule],
  providers: [RagService],
  exports: [RagService],
})
export class RagModule {}
