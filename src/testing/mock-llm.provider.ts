/**
 * MockLlmProvider - a hand-written test double for the LlmProvider port.
 *
 * CONCEPT: Testing LLM apps without the network.
 * Real LLM calls are slow, cost money, need secrets, and are NON-deterministic,
 * so unit tests replace the provider via DI (`overrideProvider(LLM_PROVIDER)`)
 * and script the model's answers per agent. We then test OUR logic:
 * routing, validation & repair, the tool loop, the revision loop, fallbacks.
 * Output QUALITY is measured separately with evals (golden datasets,
 * LLM-as-judge) - see README.
 */
import { LlmMessage, LlmProvider, LlmRequest, LlmResponse } from '../llm/llm.types';

export type MockReply =
  | string
  | { text?: string; functionCalls?: { name: string; args: Record<string, unknown> }[] }
  | Error;

export class MockLlmProvider implements LlmProvider {
  readonly modelName = 'mock-model';
  configured = true;
  /** Every request received, for assertions. */
  readonly calls: LlmRequest[] = [];
  /** Fallback when an agent's queue is empty. */
  handler?: (req: LlmRequest) => MockReply;
  /** Optional embedding implementation; throws if not provided. */
  embedImpl?: (texts: string[]) => number[][];
  private readonly queues = new Map<string, MockReply[]>();

  /** Queue scripted replies for one agent, consumed in order. */
  enqueue(agent: string, ...replies: MockReply[]): this {
    this.queues.set(agent, [...(this.queues.get(agent) ?? []), ...replies]);
    return this;
  }

  callsFor(agent: string): LlmRequest[] {
    return this.calls.filter((c) => c.agent === agent);
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async generate(req: LlmRequest): Promise<LlmResponse> {
    // Snapshot messages: agents mutate their history array after the call.
    this.calls.push({ ...req, messages: [...req.messages] });
    const reply = this.queues.get(req.agent)?.shift() ?? this.handler?.(req);
    if (reply === undefined) throw new Error(`MockLlmProvider: no scripted reply for agent "${req.agent}"`);
    if (reply instanceof Error) throw reply;

    const r = typeof reply === 'string' ? { text: reply } : reply;
    const functionCalls = r.functionCalls ?? [];
    const modelMessage: LlmMessage = {
      role: 'model',
      parts: functionCalls.length
        ? functionCalls.map((fc) => ({ functionCall: fc }))
        : [{ text: r.text ?? '' }],
    };
    return {
      text: r.text ?? '',
      functionCalls,
      modelMessage,
      usage: { promptTokens: 10, outputTokens: 5, totalTokens: 15 },
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.embedImpl) throw new Error('MockLlmProvider: embeddings not mocked');
    return this.embedImpl(texts);
  }
}

/** Helpers to build valid structured replies quickly. */
export const json = (o: unknown) => JSON.stringify(o);

export const classificationReply = (overrides: Record<string, unknown> = {}) =>
  json({
    category: 'billing',
    priority: 'high',
    sentiment: 'angry',
    confidence: 0.95,
    summary: 'Customer was charged twice.',
    ...overrides,
  });

export const reviewReply = (overrides: Record<string, unknown> = {}) =>
  json({ approved: true, toneScore: 5, grounded: true, issues: [], revisionInstructions: '', ...overrides });
