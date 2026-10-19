/**
 * BillingAgent - the specialist that demonstrates FUNCTION CALLING.
 * It gets the lookupOrderStatus tool; the model decides when to use it.
 */
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { LLM_PROVIDER, type LlmProvider } from '../../llm/llm.types';
import { RagService } from '../../rag/rag.service';
import { OrderStatusTool } from '../../tools/order-status.tool';
import { AgentTool } from '../../tools/tool.types';
import { SpecialistAgent } from './specialist.agent';

@Injectable()
export class BillingAgent extends SpecialistAgent {
  readonly name = 'billing-specialist';
  readonly category = 'billing' as const;
  protected readonly kbSource = 'billing.md';
  protected readonly persona =
    'You handle payments, refunds and invoices. If the customer mentions an order ID, ALWAYS call lookupOrderStatus first and base your answer on its result.';

  constructor(
    @Inject(LLM_PROVIDER) llm: LlmProvider,
    rag: RagService,
    config: ConfigService<AppConfig, true>,
    private readonly orderStatusTool: OrderStatusTool,
  ) {
    super(llm, rag, config);
  }

  protected override tools(): AgentTool[] {
    return [this.orderStatusTool];
  }
}
