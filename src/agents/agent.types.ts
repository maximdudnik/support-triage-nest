/**
 * Shared types passed between agents (the "state" of the multi-agent pipeline).
 *
 * CONCEPT: In multi-agent systems, agents communicate through explicit,
 * typed state objects - not through hidden globals. Each agent reads what it
 * needs and returns a new piece of state. This makes the pipeline testable
 * and debuggable (you can log/replay every hand-off).
 */
import { TokenUsage } from '../llm/llm.types';
import { RetrievedChunk } from '../rag/rag.types';
import { Classification, Review } from './schemas';

export interface TicketInput {
  subject: string;
  body: string;
  customerEmail?: string;
  orderId?: string;
}

export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

export interface Draft {
  agent: string;
  reply: string;
  /** KB chunks that were put in the prompt (the evidence the reviewer checks against). */
  context: RetrievedChunk[];
  toolCalls: ToolCallRecord[];
}

/** Events streamed to clients over SSE and kept as a trace. */
export interface PipelineEvent {
  step: 'received' | 'classified' | 'retrieved' | 'tool_call' | 'drafted' | 'reviewed' | 'revised' | 'completed' | 'error';
  agent?: string;
  at: string; // ISO timestamp
  durationMs?: number;
  data?: unknown;
}

/**
 * Per-request context, passed EXPLICITLY to every agent call.
 *
 * WHY not a Nest REQUEST-scoped provider? Request scope "bubbles up": every
 * provider depending on it is re-created per request, which is slower and
 * surprising. Passing a small context object keeps agents as cheap singletons
 * and makes data flow visible in the function signatures.
 */
export interface AgentContext {
  ticketId: string;
  usage: TokenUsage;
  trace: PipelineEvent[];
  /** Optional live listener (SSE). */
  emit?: (event: PipelineEvent) => void;
}

export interface TriageResult {
  ticketId: string;
  classification: Classification;
  reply: string;
  review: Review;
  revised: boolean;
  needsHumanReview: boolean;
  citations: string[];
  toolCalls: ToolCallRecord[];
  usage: TokenUsage;
  durationMs: number;
  trace: PipelineEvent[];
}
