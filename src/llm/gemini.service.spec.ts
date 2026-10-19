/**
 * Adapter test: verifies how we translate to/from the @google/genai SDK.
 * jest.mock replaces the SDK module, so NO network call is ever made.
 */
const generateContent = jest.fn();
const embedContent = jest.fn();
jest.mock('@google/genai', () => {
  class ApiError extends Error {
    constructor(public opts: { message: string; status: number }) {
      super(opts.message);
    }
    get status() {
      return this.opts.status;
    }
  }
  return {
    ApiError,
    GoogleGenAI: jest.fn().mockImplementation(() => ({ models: { generateContent, embedContent } })),
  };
});

import { ConfigService } from '@nestjs/config';
import { ApiError } from '@google/genai';
import { GeminiService } from './gemini.service';
import { LlmApiError, LlmNotConfiguredError } from './llm.errors';
import { TokenUsageService } from './token-usage.service';

function makeService(apiKey = 'test-key', maxRetries = 2) {
  const values: Record<string, unknown> = {
    gemini: { apiKey, model: 'gemini-2.5-flash', embeddingModel: 'gemini-embedding-001' },
    llm: { timeoutMs: 1000, maxRetries, retryBaseDelayMs: 0 },
  };
  const config = { get: (k: string) => values[k] } as unknown as ConfigService<never, true>;
  const usage = new TokenUsageService();
  return { svc: new GeminiService(config as never, usage), usage };
}

describe('GeminiService (SDK mocked)', () => {
  beforeEach(() => {
    generateContent.mockReset();
    embedContent.mockReset();
  });

  it('throws LlmNotConfiguredError without an API key', async () => {
    const { svc } = makeService('');
    expect(svc.isConfigured()).toBe(false);
    await expect(svc.generate({ agent: 'a', messages: [] })).rejects.toBeInstanceOf(LlmNotConfiguredError);
  });

  it('maps structured-output + tools config and parses function calls and usage', async () => {
    generateContent.mockResolvedValue({
      text: '',
      functionCalls: [{ name: 'lookupOrderStatus', args: { orderId: 'ORD-1' } }],
      candidates: [{ content: { parts: [{ functionCall: { name: 'lookupOrderStatus', args: { orderId: 'ORD-1' } }, thoughtSignature: 'sig' }] } }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 5, totalTokenCount: 125 },
    });
    const { svc, usage } = makeService();
    const res = await svc.generate({
      agent: 'billing',
      system: 'sys',
      jsonSchema: { type: 'object' },
      tools: [{ name: 'lookupOrderStatus', description: 'd', parameters: { type: 'object' } }],
      messages: [{ role: 'user', parts: [{ text: 'hi' }] }],
    });
    const call = generateContent.mock.calls[0][0];
    expect(call.model).toBe('gemini-2.5-flash');
    expect(call.config).toMatchObject({
      systemInstruction: 'sys',
      responseMimeType: 'application/json',
      responseJsonSchema: { type: 'object' },
      tools: [{ functionDeclarations: [{ name: 'lookupOrderStatus', parametersJsonSchema: { type: 'object' } }] }],
    });
    expect(call.config.abortSignal).toBeDefined();
    expect(res.functionCalls[0].name).toBe('lookupOrderStatus');
    expect(res.modelMessage.parts[0]).toMatchObject({ functionCall: { thoughtSignature: 'sig' } });
    expect(res.usage).toEqual({ promptTokens: 100, outputTokens: 25, totalTokens: 125 });
    expect(usage.snapshot().byAgent.billing.calls).toBe(1);
  });

  it('retries 429 from the SDK and then succeeds', async () => {
    generateContent
      .mockRejectedValueOnce(new (ApiError as never as new (o: object) => Error)({ message: 'quota', status: 429 }))
      .mockResolvedValue({ text: 'ok', candidates: [], usageMetadata: {} });
    const { svc } = makeService();
    await expect(svc.generate({ agent: 'a', messages: [] })).resolves.toMatchObject({ text: 'ok' });
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('normalises SDK errors to LlmApiError with status', async () => {
    generateContent.mockRejectedValue(new (ApiError as never as new (o: object) => Error)({ message: 'bad', status: 400 }));
    const { svc } = makeService();
    await expect(svc.generate({ agent: 'a', messages: [] })).rejects.toMatchObject({ status: 400 });
    await expect(svc.generate({ agent: 'a', messages: [] })).rejects.toBeInstanceOf(LlmApiError);
  });

  it('embeds with retrieval task types', async () => {
    embedContent.mockResolvedValue({ embeddings: [{ values: [1, 2] }, { values: [3, 4] }] });
    const { svc } = makeService();
    await expect(svc.embed(['a', 'b'], 'document')).resolves.toEqual([[1, 2], [3, 4]]);
    expect(embedContent.mock.calls[0][0].config.taskType).toBe('RETRIEVAL_DOCUMENT');
  });
});
