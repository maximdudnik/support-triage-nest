import { emptyUsage } from '../llm/token-usage.service';
import { MockLlmProvider, classificationReply } from '../testing/mock-llm.provider';
import { AgentContext } from './agent.types';
import { FALLBACK_CLASSIFICATION, RouterAgent } from './router.agent';
import { LlmApiError } from '../llm/llm.errors';

const newCtx = (): AgentContext => ({ ticketId: 't1', usage: emptyUsage(), trace: [] });
const ticket = { subject: 'Charged twice', body: 'I paid twice for ORD-1002!' };

describe('RouterAgent', () => {
  let mock: MockLlmProvider;
  let router: RouterAgent;
  beforeEach(() => {
    mock = new MockLlmProvider();
    router = new RouterAgent(mock); // plain constructor injection: no Nest needed for unit tests
  });

  it('returns validated structured output and sends a JSON schema', async () => {
    mock.enqueue('router', classificationReply());
    const ctx = newCtx();
    const result = await router.classify(ctx, ticket);
    expect(result.category).toBe('billing');
    const req = mock.callsFor('router')[0];
    expect(req.jsonSchema).toMatchObject({ type: 'object', required: expect.arrayContaining(['category']) });
    expect(req.temperature).toBe(0);
    expect(ctx.usage.totalTokens).toBe(15);
    expect(ctx.trace.map((e) => e.step)).toEqual(['classified']);
  });

  it('self-repairs once when the model returns invalid JSON', async () => {
    mock.enqueue('router', classificationReply({ category: 'shipping' }), classificationReply({ category: 'technical' }));
    const result = await router.classify(newCtx(), ticket);
    expect(result.category).toBe('technical');
    const repairPrompt = mock.callsFor('router')[1].messages.at(-1);
    expect(JSON.stringify(repairPrompt)).toContain('previous answer was invalid');
  });

  it('falls back to a safe default after two invalid outputs', async () => {
    mock.enqueue('router', 'not json', '{"category":"nope"}');
    await expect(router.classify(newCtx(), ticket)).resolves.toEqual(FALLBACK_CLASSIFICATION);
  });

  it('propagates infrastructure errors instead of hiding them', async () => {
    mock.enqueue('router', new LlmApiError('rate limited', 429));
    await expect(router.classify(newCtx(), ticket)).rejects.toBeInstanceOf(LlmApiError);
  });
});
