/**
 * SpecialistAgent - abstract base for the per-category reply writers.
 *
 * CONCEPT: RAG + generation. Each specialist:
 *   1. retrieves relevant KB chunks (RagService)
 *   2. puts them in the prompt as numbered, citable context
 *   3. runs the agent loop (with tools, if the subclass provides any)
 *   4. can revise its draft given reviewer feedback (critic pattern)
 *
 * Subclasses only declare WHAT is different (persona, preferred KB file,
 * tools). That is the Open/Closed principle: add a "shipping" specialist by
 * adding a class, without touching this one or the orchestrator's logic.
 */
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { LlmMessage, LlmProvider } from '../../llm/llm.types';
import { RagService } from '../../rag/rag.service';
import { RetrievedChunk } from '../../rag/rag.types';
import { AgentTool } from '../../tools/tool.types';
import { AgentContext, Draft, TicketInput } from '../agent.types';
import { BaseAgent, formatTicket, UNTRUSTED_INPUT_RULE } from '../base.agent';
import { Category, Classification } from '../schemas';

export abstract class SpecialistAgent extends BaseAgent {
  abstract readonly category: Category;
  /** KB file to boost during retrieval, e.g. 'billing.md'. */
  protected abstract readonly kbSource: string;
  /** Domain-specific instructions appended to the shared rules. */
  protected abstract readonly persona: string;
  private readonly maxToolSteps: number;

  protected constructor(
    llm: LlmProvider,
    protected readonly rag: RagService,
    config: ConfigService<AppConfig, true>,
  ) {
    super(llm);
    this.maxToolSteps = config.get('agents', { infer: true }).maxToolSteps;
  }

  /** Override to give the specialist tools (see BillingAgent). */
  protected tools(): AgentTool[] {
    return [];
  }

  async draft(ctx: AgentContext, ticket: TicketInput, cls: Classification): Promise<Draft> {
    const started = Date.now();
    const context = await this.rag.retrieve(`${ticket.subject}\n${ticket.body}`, {
      preferSources: [this.kbSource],
    });
    this.event(ctx, { step: 'retrieved', data: context.map((c) => ({ id: c.id, score: round(c.score) })) });

    const messages: LlmMessage[] = [{ role: 'user', parts: [{ text: this.buildUserPrompt(ticket, cls, context) }] }];
    const { text, toolCalls } = await this.runToolLoop(
      ctx,
      { system: this.systemPrompt(), temperature: 0.4, messages },
      this.tools(),
      this.maxToolSteps,
    );
    const draft: Draft = { agent: this.name, reply: text, context, toolCalls };
    this.event(ctx, { step: 'drafted', durationMs: Date.now() - started, data: { chars: text.length } });
    return draft;
  }

  /**
   * Revision = same agent, same evidence, plus the critic's feedback.
   * We reuse the original context and tool results instead of re-retrieving,
   * so the reviewer judges the revision against the same evidence.
   */
  async revise(ctx: AgentContext, ticket: TicketInput, cls: Classification, previous: Draft, feedback: string): Promise<Draft> {
    const started = Date.now();
    const toolEvidence = previous.toolCalls.length
      ? `\nTool results already obtained:\n${JSON.stringify(previous.toolCalls.map((t) => ({ tool: t.name, result: t.result })))}`
      : '';
    const prompt = `${this.buildUserPrompt(ticket, cls, previous.context)}${toolEvidence}

Your previous draft:
"""${previous.reply}"""

A senior reviewer requested changes:
"""${feedback}"""

Rewrite the reply addressing every point. Output only the new reply.`;
    const { text } = await this.runToolLoop(
      ctx,
      { system: this.systemPrompt(), temperature: 0.3, messages: [{ role: 'user', parts: [{ text: prompt }] }] },
      [], // no new tool calls during revision: keeps evidence stable and cost bounded
      1,
    );
    const draft: Draft = { ...previous, reply: text };
    this.event(ctx, { step: 'revised', durationMs: Date.now() - started, data: { chars: text.length } });
    return draft;
  }

  protected systemPrompt(): string {
    return `You are a ${this.category} support specialist writing a reply email to a customer.
${this.persona}
Rules:
- Be empathetic, concise (under 180 words), and professional. Acknowledge the problem first.
- Use ONLY facts from the provided knowledge-base context and tool results. If the answer is not there, say you are escalating to a human colleague - never invent policies, prices, or timelines.
- Cite the knowledge-base sections you used like [billing.md#refund-policy] at the end of the sentence.
- Do not promise actions you cannot perform (e.g. "I have refunded you") unless a tool result confirms it.
- ${UNTRUSTED_INPUT_RULE}
Output only the reply text, starting with a greeting.`;
  }

  /** "Context stuffing": numbered evidence blocks the model can cite. */
  protected buildUserPrompt(ticket: TicketInput, cls: Classification, context: RetrievedChunk[]): string {
    const kb = context.length
      ? context.map((c) => `[${c.id}] ${c.title}\n${c.text}`).join('\n\n')
      : '(no relevant knowledge-base articles found)';
    return `Knowledge-base context:
${kb}

Triage: category=${cls.category}, priority=${cls.priority}, sentiment=${cls.sentiment}
Summary: ${cls.summary}

${formatTicket(ticket)}`;
  }
}

const round = (n: number) => Math.round(n * 1000) / 1000;
