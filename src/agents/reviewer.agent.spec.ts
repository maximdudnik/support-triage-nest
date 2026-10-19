import { emptyUsage } from '../llm/token-usage.service';
import { MockLlmProvider, reviewReply } from '../testing/mock-llm.provider';
import { AgentContext, Draft } from './agent.types';
import { ReviewerAgent } from './reviewer.agent';

const ctx = (): AgentContext => ({ ticketId: 't', usage: emptyUsage(), trace: [] });
const ticket = { subject: 's', body: 'b' };
const draft: Draft = { agent: 'x', reply: 'Hi!', context: [], toolCalls: [] };

describe('ReviewerAgent', () => {
  it('approves a good, grounded draft', async () => {
    const mock = new MockLlmProvider().enqueue('reviewer', reviewReply());
    const review = await new ReviewerAgent(mock).review(ctx(), ticket, draft);
    expect(review.approved).toBe(true);
  });

  it('code guardrail overrides the model: ungrounded or low tone is never approved', async () => {
    const mock = new MockLlmProvider().enqueue(
      'reviewer',
      reviewReply({ approved: true, grounded: false }),
      reviewReply({ approved: true, toneScore: 3 }),
    );
    const reviewer = new ReviewerAgent(mock);
    expect((await reviewer.review(ctx(), ticket, draft)).approved).toBe(false);
    expect((await reviewer.review(ctx(), ticket, draft)).approved).toBe(false);
  });

  it('fails closed when its own output is invalid', async () => {
    const mock = new MockLlmProvider().enqueue('reviewer', 'garbage', 'still garbage');
    const review = await new ReviewerAgent(mock).review(ctx(), ticket, draft);
    expect(review.approved).toBe(false);
    expect(review.issues[0]).toMatch(/human review/);
  });
});
