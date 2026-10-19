/**
 * GeminiService - the concrete LlmProvider "adapter" for Google Gemini.
 *
 * CONCEPTS shown here:
 *  - Adapter pattern: translate our provider-neutral LlmRequest into the
 *    @google/genai SDK format, and the SDK response back into LlmResponse.
 *  - Cross-cutting resilience: every call goes through timeout + retry.
 *  - Observability: Nest Logger + token accounting on every call.
 *
 * Agents never import this file; they inject the LLM_PROVIDER token.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiError, Content, GenerateContentConfig, GoogleGenAI, Part } from '@google/genai';
import { AppConfig } from '../config/configuration';
import { LlmApiError, LlmNotConfiguredError } from './llm.errors';
import { LlmMessage, LlmPart, LlmProvider, LlmRequest, LlmResponse } from './llm.types';
import { withRetry, withTimeout } from './retry.util';
import { TokenUsageService } from './token-usage.service';

/** Gemini's batch embed endpoint accepts at most 100 inputs per request. */
const EMBED_BATCH_SIZE = 100;

@Injectable()
export class GeminiService implements LlmProvider {
  private readonly logger = new Logger(GeminiService.name);
  // Created lazily: constructing the client without a key would throw at boot.
  private client?: GoogleGenAI;
  readonly modelName: string;
  private readonly cfg: AppConfig['gemini'];
  private readonly llmCfg: AppConfig['llm'];

  // Constructor injection: Nest sees the parameter types (thanks to
  // emitDecoratorMetadata) and passes in the singleton instances.
  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly usage: TokenUsageService,
  ) {
    this.cfg = config.get('gemini', { infer: true });
    this.llmCfg = config.get('llm', { infer: true });
    this.modelName = this.cfg.model;
  }

  isConfigured(): boolean {
    return this.cfg.apiKey.length > 0;
  }

  private getClient(): GoogleGenAI {
    if (!this.isConfigured()) throw new LlmNotConfiguredError();
    this.client ??= new GoogleGenAI({ apiKey: this.cfg.apiKey });
    return this.client;
  }

  async generate(req: LlmRequest): Promise<LlmResponse> {
    const client = this.getClient();
    const started = Date.now();

    const config: GenerateContentConfig = {
      systemInstruction: req.system,
      temperature: req.temperature ?? 0.3,
    };
    if (req.jsonSchema) {
      // Structured output: the model is constrained to emit JSON that matches
      // the schema. This is far more reliable than "please reply in JSON".
      config.responseMimeType = 'application/json';
      config.responseJsonSchema = req.jsonSchema;
    }
    if (req.tools?.length) {
      // Function calling: we describe tools; the MODEL decides whether to call
      // one and with which arguments. WE execute it (the model never runs code).
      config.tools = [
        {
          functionDeclarations: req.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parametersJsonSchema: t.parameters,
          })),
        },
      ];
    }

    const response = await this.callWithResilience(req.agent, (signal) =>
      client.models.generateContent({
        model: this.cfg.model,
        contents: req.messages.map(toGeminiContent),
        config: { ...config, abortSignal: signal },
      }),
    );

    const meta = response.usageMetadata;
    const usage = {
      promptTokens: meta?.promptTokenCount ?? 0,
      // "Thinking" models bill reasoning tokens as output, so include them.
      outputTokens: (meta?.candidatesTokenCount ?? 0) + (meta?.thoughtsTokenCount ?? 0),
      totalTokens: meta?.totalTokenCount ?? 0,
    };
    this.usage.record(req.agent, usage);

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const modelMessage: LlmMessage = { role: 'model', parts: parts.flatMap(fromGeminiPart) };
    const functionCalls = (response.functionCalls ?? []).map((fc) => ({
      name: fc.name ?? '',
      args: (fc.args ?? {}) as Record<string, unknown>,
    }));

    this.logger.debug(
      `[${req.agent}] ${Date.now() - started}ms tokens=${usage.totalTokens} toolCalls=${functionCalls.length}`,
    );
    return { text: response.text ?? '', functionCalls, modelMessage, usage };
  }

  async embed(texts: string[], purpose: 'document' | 'query'): Promise<number[][]> {
    const client = this.getClient();
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
      const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
      const res = await this.callWithResilience('embeddings', (signal) =>
        client.models.embedContent({
          model: this.cfg.embeddingModel,
          contents: batch,
          // Task type tells the model to optimise vectors for asymmetric
          // retrieval: short questions vs. longer documents.
          config: {
            taskType: purpose === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT',
            abortSignal: signal,
          },
        }),
      );
      for (const e of res.embeddings ?? []) vectors.push(e.values ?? []);
    }
    return vectors;
  }

  /** Timeout INSIDE retry: each attempt gets its own deadline. */
  private callWithResilience<T>(agent: string, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    return withRetry(
      async () => {
        try {
          return await withTimeout(fn, this.llmCfg.timeoutMs);
        } catch (err) {
          throw normaliseError(err);
        }
      },
      {
        maxRetries: this.llmCfg.maxRetries,
        baseDelayMs: this.llmCfg.retryBaseDelayMs,
        onRetry: ({ attempt, delayMs, error }) =>
          this.logger.warn(
            `[${agent}] retry #${attempt} in ${delayMs}ms: ${(error as Error).message}`,
          ),
      },
    );
  }
}

/** Map SDK errors to our own error type (keeps SDK details out of the rest of the app). */
function normaliseError(err: unknown): unknown {
  if (err instanceof ApiError) return new LlmApiError(err.message, err.status);
  return err;
}

function toGeminiContent(m: LlmMessage): Content {
  return {
    role: m.role,
    parts: m.parts.map((p): Part => {
      if ('text' in p) return { text: p.text };
      if ('functionCall' in p) {
        const { thoughtSignature, ...call } = p.functionCall;
        return { functionCall: call, ...(thoughtSignature ? { thoughtSignature } : {}) };
      }
      return { functionResponse: p.functionResponse };
    }),
  };
}

function fromGeminiPart(p: Part): LlmPart[] {
  if (p.functionCall) {
    return [
      {
        functionCall: {
          name: p.functionCall.name ?? '',
          args: (p.functionCall.args ?? {}) as Record<string, unknown>,
          thoughtSignature: p.thoughtSignature,
        },
      },
    ];
  }
  // Skip "thought" summary parts; keep normal text.
  if (typeof p.text === 'string' && !p.thought) return [{ text: p.text }];
  return [];
}
