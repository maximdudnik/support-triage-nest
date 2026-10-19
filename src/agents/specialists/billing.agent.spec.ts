/** Tests the AGENT LOOP: model requests a tool -> we run it -> model answers. */
import { AgentsModule } from '../agents.module';
import { BillingAgent } from './billing.agent';
import { createTestingModule, setTestEnv } from '../../testing/test-app';
import { emptyUsage } from '../../llm/token-usage.service';
import { RagService } from '../../rag/rag.service';
import { AgentContext } from '../agent.types';
import { Classification } from '../schemas';

const cls: Classification = { category: 'billing', priority: 'high', sentiment: 'angry', confidence: 0.9, summary: 'Double charge' };
const ticket = { subject: 'Charged twice', body: 'I was charged twice for ORD-1002', orderId: 'ORD-1002' };
const newCtx = (): AgentContext => ({ ticketId: 't', usage: emptyUsage(), trace: [] });

describe('BillingAgent (function calling)', () => {
  beforeEach(() => setTestEnv());

  async function setup() {
    const { moduleRef, mock } = await createTestingModule([AgentsModule]);
    await moduleRef.get(RagService).buildIndex();
    return { agent: moduleRef.get(BillingAgent), mock };
  }

  it('executes lookupOrderStatus and feeds the result back to the model', async () => {
    const { agent, mock } = await setup();
    mock.enqueue(
      'billing-specialist',
      { functionCalls: [{ name: 'lookupOrderStatus', args: { orderId: 'ORD-1002' } }] },
      'Hello! Your duplicate charge is being refunded (3-5 business days) [billing.md#double-charges].',
    );
    const ctx = newCtx();
    const draft = await agent.draft(ctx, ticket, cls);

    expect(draft.toolCalls).toHaveLength(1);
    expect(draft.toolCalls[0].result).toMatchObject({ status: 'refund_pending', chargedTwice: true });
    expect(draft.reply).toContain('refunded');
    expect(draft.context.some((c) => c.id === 'billing.md#double-charges')).toBe(true);

    const [first, second] = mock.callsFor('billing-specialist');
    expect(first.tools?.[0].name).toBe('lookupOrderStatus'); // tools offered
    const lastTurn = second.messages.at(-1)!; // tool result sent back
    expect(lastTurn.role).toBe('user');
    expect(lastTurn.parts[0]).toHaveProperty('functionResponse.name', 'lookupOrderStatus');
    expect(ctx.trace.map((e) => e.step)).toEqual(['retrieved', 'tool_call', 'drafted']);
  });

  it('returns tool validation errors to the model instead of crashing', async () => {
    const { agent, mock } = await setup();
    mock.enqueue(
      'billing-specialist',
      { functionCalls: [{ name: 'lookupOrderStatus', args: { orderId: '1002' } }] },
      'Could you confirm your order number?',
    );
    const draft = await agent.draft(newCtx(), ticket, cls);
    expect(draft.toolCalls[0].result).toHaveProperty('error');
  });

  it('stops looping at maxSteps and forces a final answer (no tools on last step)', async () => {
    process.env.AGENT_MAX_TOOL_STEPS = '2';
    const { agent, mock } = await setup();
    mock.handler = (req) =>
      req.tools ? { functionCalls: [{ name: 'lookupOrderStatus', args: { orderId: 'ORD-1001' } }] } : 'Final answer';
    const draft = await agent.draft(newCtx(), ticket, cls);
    expect(draft.reply).toBe('Final answer');
    expect(mock.callsFor('billing-specialist')).toHaveLength(2);
  });
});
