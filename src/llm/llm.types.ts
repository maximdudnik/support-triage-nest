/**
 * The LLM abstraction layer.
 *
 * CONCEPT: Dependency Inversion (the "D" in SOLID) + Ports & Adapters.
 * WHY: Agents should not know they talk to Gemini. They depend on this small
 * `LlmProvider` interface ("port"); GeminiService is one "adapter". Benefits:
 *   1. Unit tests inject a fake provider -> no network, no API key, deterministic.
 *   2. Swapping to OpenAI/Anthropic/a local model = write one new adapter.
 *   3. Cross-cutting concerns (retries, token accounting) live in one place.
 *
 * NestJS DI needs a runtime value to look a dependency up by. TypeScript
 * interfaces are erased at compile time, so we export a Symbol token and
 * inject with `@Inject(LLM_PROVIDER)`.
 */

/** DI token. Use: constructor(@Inject(LLM_PROVIDER) private llm: LlmProvider) */
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

/**
 * A single piece of a message. Mirrors Gemini's "parts" model, which is also
 * conceptually how OpenAI/Anthropic represent tool calls:
 *   - text:             normal natural-language content
 *   - functionCall:     the MODEL asks us to run a tool with these args
 *   - functionResponse: WE send the tool result back to the model
 */
export type LlmPart =
  | { text: string }
  | {
      functionCall: {
        name: string;
        args: Record<string, unknown>;
        /**
         * Opaque value some Gemini models attach to function calls (their
         * internal reasoning state). It must be echoed back unchanged in the
         * history, otherwise multi-turn tool calling can be rejected.
         */
        thoughtSignature?: string;
      };
    }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

/** 'user' = us (incl. tool results), 'model' = the LLM. Same roles Gemini uses. */
export interface LlmMessage {
  role: 'user' | 'model';
  parts: LlmPart[];
}

/** Description of a tool the model may call (JSON Schema for its arguments). */
export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema object
}

export interface LlmRequest {
  /** Which agent is calling - used for logs and per-agent token accounting. */
  agent: string;
  /** System instruction = the agent's "role", rules, and output contract. */
  system?: string;
  messages: LlmMessage[];
  /**
   * If set, ask the model for JSON matching this JSON Schema ("structured
   * output" / "JSON mode"). We STILL validate the result with zod afterwards:
   * never trust the model blindly.
   */
  jsonSchema?: Record<string, unknown>;
  tools?: ToolDeclaration[];
  /** 0 = deterministic-ish (classification), higher = more creative (writing). */
  temperature?: number;
}

export interface TokenUsage {
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface LlmResponse {
  text: string;
  functionCalls: { name: string; args: Record<string, unknown> }[];
  /** The model turn exactly as it should be appended to history (keeps thought signatures). */
  modelMessage: LlmMessage;
  usage: TokenUsage;
}

/** The "port" every agent depends on. */
export interface LlmProvider {
  /** Model name for logs / health output. */
  readonly modelName: string;
  /** Whether the provider is usable right now (e.g. an API key exists). */
  isConfigured(): boolean;
  generate(request: LlmRequest): Promise<LlmResponse>;
  /** Returns one embedding vector per input text (same order). */
  embed(texts: string[], purpose: 'document' | 'query'): Promise<number[][]>;
}
