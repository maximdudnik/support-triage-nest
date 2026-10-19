/**
 * RouterAgent - step 1 of the pipeline.
 *
 * CONCEPT: "Router" multi-agent pattern. A cheap, fast classification call
 * decides WHICH specialist handles the request. Benefits:
 *   - each specialist gets a short, focused prompt (better quality, fewer tokens)
 *   - you can use a smaller/cheaper model for routing than for writing
 *   - routing output (category/priority/sentiment) is also business data:
 *     dashboards, SLAs, escalation.
 *
 * temperature 0: classification should be as repeatable as possible.
 */
import { Inject, Injectable } from '@nestjs/common';
// `type` import: LlmProvider is an interface (erased at runtime). With
// isolatedModules + emitDecoratorMetadata, TS requires interface types used in
// decorated constructors to be type-only imports; Nest resolves the dependency
// by the LLM_PROVIDER token from @Inject, not by the type.
import { LLM_PROVIDER, type LlmProvider } from '../llm/llm.types';
import { AgentContext, TicketInput } from './agent.types';
import { BaseAgent, formatTicket, StructuredOutputError, UNTRUSTED_INPUT_RULE } from './base.agent';
import { Classification, classificationSchema } from './schemas';

/** Few-shot examples: showing beats telling, especially for edge cases. */
const SYSTEM_PROMPT = `You are a customer-support triage router.
Classify the ticket into exactly one category:
- billing: payments, invoices, refunds, charges, subscriptions, pricing, order payment status
- technical: bugs, errors, crashes, performance, integrations, API problems
- account: login, password, 2FA, email change, account deletion, permissions
- general: everything else (feature questions, feedback, how-to)
Priority: urgent (outage, security breach, money lost now), high (blocked from core use), medium (degraded/annoying), low (question).
${UNTRUSTED_INPUT_RULE}

Examples:
"I was charged twice for order ORD-1002!!" -> billing, high, angry
"The app crashes when I upload a PDF" -> technical, high, negative
"How do I enable two-factor auth?" -> account, low, neutral
"Do you have a dark mode?" -> general, low, neutral`;

/** Used when the model output is unusable - the pipeline must still work. */
export const FALLBACK_CLASSIFICATION: Classification = {
  category: 'general',
  priority: 'medium',
  sentiment: 'neutral',
  confidence: 0,
  summary: 'Automatic classification failed; routed to general support.',
};

@Injectable()
export class RouterAgent extends BaseAgent {
  readonly name = 'router';

  constructor(@Inject(LLM_PROVIDER) llm: LlmProvider) {
    super(llm);
  }

  async classify(ctx: AgentContext, ticket: TicketInput): Promise<Classification> {
    const started = Date.now();
    let result: Classification;
    try {
      result = await this.callStructured(ctx, classificationSchema, {
        system: SYSTEM_PROMPT,
        temperature: 0,
        messages: [{ role: 'user', parts: [{ text: formatTicket(ticket) }] }],
      });
    } catch (err) {
      // Only swallow OUTPUT problems. Infra errors (no key, 429 after retries)
      // must propagate so the client gets a correct HTTP status.
      if (!(err instanceof StructuredOutputError)) throw err;
      this.logger.warn(`Falling back to default classification: ${err.message}`);
      result = FALLBACK_CLASSIFICATION;
    }
    this.event(ctx, { step: 'classified', durationMs: Date.now() - started, data: result });
    return result;
  }
}
