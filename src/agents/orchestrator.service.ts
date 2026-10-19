/**
 * OrchestratorService - wires the agents into a pipeline.
 *
 * CONCEPT: Orchestration patterns for multi-agent systems.
 *   - Sequential pipeline: router -> specialist -> reviewer.
 *   - Router / dispatcher: router output selects the specialist.
 *   - Reflection loop: reviewer may send the draft back ONCE for revision.
 * The control flow is plain, deterministic TypeScript; only the individual
 * steps are LLM-powered. This "workflow with agentic steps" is usually more
 * reliable, debuggable and cheaper than letting one LLM decide everything
 * (a fully autonomous "supervisor agent"). Frameworks like LangGraph model the
 * same thing as a graph of nodes and edges.
 *
 * Production concerns handled here or below:
 *   - retry/backoff for 429 + per-call timeouts  -> GeminiService
 *   - bounded loops (1 revision, N tool steps)   -> cost/latency ceilings
 *   - token usage per request                    -> ctx.usage
 *   - trace of every step with timings           -> ctx.trace (+ SSE)
 *   - human-in-the-loop flag                     -> needsHumanReview
 */
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { emptyUsage } from '../llm/token-usage.service';
import { AgentContext, PipelineEvent, TicketInput, TriageResult } from './agent.types';
import { ReviewerAgent } from './reviewer.agent';
import { RouterAgent } from './router.agent';
import { SpecialistRegistry } from './specialists/specialist.registry';

/** Bounded reflection: more rounds rarely help and always cost tokens. */
export const MAX_REVISIONS = 1;

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(
    private readonly router: RouterAgent,
    private readonly specialists: SpecialistRegistry,
    private readonly reviewer: ReviewerAgent,
  ) {}

  async process(ticket: TicketInput, emit?: (e: PipelineEvent) => void): Promise<TriageResult> {
    const started = Date.now();
    const ctx: AgentContext = { ticketId: randomUUID(), usage: emptyUsage(), trace: [], emit };
    const push = (e: Omit<PipelineEvent, 'at'>) => {
      const full = { ...e, at: new Date().toISOString() };
      ctx.trace.push(full);
      emit?.(full);
    };
    push({ step: 'received', data: { ticketId: ctx.ticketId, subject: ticket.subject } });

    try {
      // 1) Route
      const classification = await this.router.classify(ctx, ticket);
      // 2) Draft with the matching specialist (RAG + optional tools)
      const specialist = this.specialists.get(classification.category);
      let draft = await specialist.draft(ctx, ticket, classification);
      // 3) Review, and revise at most MAX_REVISIONS times
      let review = await this.reviewer.review(ctx, ticket, draft);
      let revisions = 0;
      while (!review.approved && revisions < MAX_REVISIONS) {
        const feedback = review.revisionInstructions || review.issues.join('; ') || 'Improve tone and grounding.';
        draft = await specialist.revise(ctx, ticket, classification, draft, feedback);
        review = await this.reviewer.review(ctx, ticket, draft);
        revisions++;
      }

      const result: TriageResult = {
        ticketId: ctx.ticketId,
        classification,
        reply: draft.reply,
        review,
        revised: revisions > 0,
        // Human-in-the-loop: never auto-send what the critic rejected, and
        // let a human glance at urgent tickets regardless.
        needsHumanReview: !review.approved || classification.priority === 'urgent',
        citations: draft.context.map((c) => c.id).filter((id) => draft.reply.includes(id)),
        toolCalls: draft.toolCalls,
        usage: ctx.usage,
        durationMs: Date.now() - started,
        trace: ctx.trace,
      };
      push({ step: 'completed', durationMs: result.durationMs, data: { usage: result.usage } });
      this.logger.log(
        `ticket=${ctx.ticketId} category=${classification.category} approved=${review.approved} ` +
          `revised=${result.revised} tokens=${ctx.usage.totalTokens} ${result.durationMs}ms`,
      );
      return result;
    } catch (err) {
      push({ step: 'error', data: { message: (err as Error).message } });
      this.logger.error(`ticket=${ctx.ticketId} failed: ${(err as Error).message}`);
      throw err;
    }
  }
}
