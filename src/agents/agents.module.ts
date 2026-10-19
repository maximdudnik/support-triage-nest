/**
 * AgentsModule - composes agents from lower-level modules.
 *
 * Dependency graph (arrows = "imports"):
 *   TicketsModule -> AgentsModule -> { LlmModule, RagModule, ToolsModule }
 * Only the OrchestratorService is exported: the controller should not reach
 * into individual agents (encapsulation / facade).
 */
import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { RagModule } from '../rag/rag.module';
import { ToolsModule } from '../tools/tools.module';
import { OrchestratorService } from './orchestrator.service';
import { ReviewerAgent } from './reviewer.agent';
import { RouterAgent } from './router.agent';
import { AccountAgent } from './specialists/account.agent';
import { BillingAgent } from './specialists/billing.agent';
import { GeneralAgent } from './specialists/general.agent';
import { SPECIALIST_AGENTS, SpecialistRegistry } from './specialists/specialist.registry';
import { TechnicalAgent } from './specialists/technical.agent';

const SPECIALISTS = [BillingAgent, TechnicalAgent, AccountAgent, GeneralAgent];

@Module({
  imports: [LlmModule, RagModule, ToolsModule],
  providers: [
    RouterAgent,
    ReviewerAgent,
    ...SPECIALISTS,
    // useFactory provider: collects all specialist singletons into one array.
    // `inject` lists what Nest resolves and passes to the factory, in order.
    {
      provide: SPECIALIST_AGENTS,
      useFactory: (...agents: InstanceType<(typeof SPECIALISTS)[number]>[]) => agents,
      inject: SPECIALISTS,
    },
    SpecialistRegistry,
    OrchestratorService,
  ],
  exports: [OrchestratorService],
})
export class AgentsModule {}
