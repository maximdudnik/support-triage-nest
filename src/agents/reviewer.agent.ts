/**
 * ReviewerAgent - the critic in a "generator / critic" (a.k.a. reflection) pattern.
 *
 * CONCEPT: A second model call with a DIFFERENT role catches problems the
 * writer misses: rude tone, hallucinated policies ("ungrounded" claims),
 * promises the company cannot keep. It is a cheap, automated hallucination
 * check before anything reaches a customer.
 *
 * Design decisions worth mentioning in an interview:
 *  - The critic sees the SAME evidence the writer had (KB chunks + tool
 *    results), so "grounded" is checked against facts, not vibes.
 *  - The final approve/reject decision is enforced in CODE (`isAcceptable`),
 *    not only by the model's `approved` flag - deterministic guardrails
 *    around probabilistic components.
 *  - If the reviewer itself fails, we fail CLOSED (not approved) - the
 *    ticket is flagged for a human rather than auto-sent.
 */
import { Inject, Injectable } from '@nestjs/common';
import { LLM_PROVIDER, type LlmProvider } from '../llm/llm.types';
import { AgentContext, Draft, TicketInput } from './agent.types';
import { BaseAgent, formatTicket, StructuredOutputError, UNTRUSTED_INPUT_RULE } from './base.agent';
import { Review, reviewSchema } from './schemas';

const SYSTEM_PROMPT = `You are a strict senior support QA reviewer.
Evaluate a draft reply to a customer ticket:
1. Tone: empathetic, professional, not defensive, not robotic (score 1-5).
2. Grounding: every policy, number, date or timeline must be supported by the KB context or tool results given. Flag anything invented.
3. Safety: no promises of actions that were not performed, no requests for passwords or full card numbers.
4. Helpfulness: does it actually address the customer's question?
Approve only if tone >= 4, fully grounded, and helpful. If not approved, write short, actionable revisionInstructions.
${UNTRUSTED_INPUT_RULE}`;

export const MIN_TONE_SCORE = 4;

@Injectable()
export class ReviewerAgent extends BaseAgent {
  readonly name = 'reviewer';

  constructor(@Inject(LLM_PROVIDER) llm: LlmProvider) {
    super(llm);
  }

  async review(ctx: AgentContext, ticket: TicketInput, draft: Draft): Promise<Review> {
    const started = Date.now();
    const evidence = [
      draft.context.length
        ? draft.context.map((c) => `[${c.id}]\n${c.text}`).join('\n\n')
        : '(no KB context)',
      draft.toolCalls.length ? `Tool results:\n${JSON.stringify(draft.toolCalls)}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    let review: Review;
    try {
      review = await this.callStructured(ctx, reviewSchema, {
        system: SYSTEM_PROMPT,
        temperature: 0,
        messages: [
          {
            role: 'user',
            parts: [{ text: `Evidence:\n${evidence}\n\n${formatTicket(ticket)}\n\nDraft reply:\n"""${draft.reply}"""` }],
          },
        ],
      });
    } catch (err) {
      if (!(err instanceof StructuredOutputError)) throw err;
      review = {
        approved: false,
        toneScore: 1,
        grounded: false,
        issues: ['Automatic review failed; human review required.'],
        revisionInstructions: '',
      };
    }
    // Deterministic guardrail on top of the model's judgement.
    review = { ...review, approved: ReviewerAgent.isAcceptable(review) };
    this.event(ctx, { step: 'reviewed', durationMs: Date.now() - started, data: review });
    return review;
  }

  static isAcceptable(r: Review): boolean {
    return r.approved && r.grounded && r.toneScore >= MIN_TONE_SCORE;
  }
}
