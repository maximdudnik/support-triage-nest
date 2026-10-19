/** Integration test of the whole pipeline with real Nest wiring + mocked LLM. */
import { AgentsModule } from './agents.module';
import { OrchestratorService } from './orchestrator.service';
import { createTestingModule, setTestEnv } from '../testing/test-app';
import { classificationReply, reviewReply } from '../testing/mock-llm.provider';
import { RagService } from '../rag/rag.service';

describe('OrchestratorService', () => {
  beforeEach(() => setTestEnv());

  async function setup() {
    const { moduleRef, mock } = await createTestingModule([AgentsModule]);
    await moduleRef.get(RagService).buildIndex();
    return { orchestrator: moduleRef.get(OrchestratorService), mock };
  }

  it('routes to the right specialist and returns an approved reply', async () => {
    const { orchestrator, mock } = await setup();
    mock
      .enqueue('router', classificationReply({ category: 'account', priority: 'low', sentiment: 'neutral' }))
      .enqueue('account-specialist', 'Hi! Use "Forgot password" [account.md#password-reset].')
      .enqueue('reviewer', reviewReply());

    const events: string[] = [];
    const result = await orchestrator.process({ subject: 'Reset password', body: 'I forgot my password' }, (e) => events.push(e.step));

    expect(result.classification.category).toBe('account');
    expect(result.revised).toBe(false);
    expect(result.needsHumanReview).toBe(false);
    expect(result.citations).toContain('account.md#password-reset');
    expect(result.usage.totalTokens).toBe(45); // 3 calls x 15 tokens
    expect(mock.callsFor('billing-specialist')).toHaveLength(0);
    expect(events).toEqual(['received', 'classified', 'retrieved', 'drafted', 'reviewed', 'completed']);
  });

  it('requests exactly one revision when the reviewer rejects', async () => {
    const { orchestrator, mock } = await setup();
    mock
      .enqueue('router', classificationReply({ category: 'technical' }))
      .enqueue('technical-specialist', 'Just reinstall lol', 'Hello, sorry for the trouble! Please update the app...')
      .enqueue(
        'reviewer',
        reviewReply({ approved: false, toneScore: 2, issues: ['Rude'], revisionInstructions: 'Be empathetic' }),
        reviewReply(),
      );

    const result = await orchestrator.process({ subject: 'Crash', body: 'App crashes on upload' });
    expect(result.revised).toBe(true);
    expect(result.reply).toMatch(/^Hello, sorry/);
    expect(result.review.approved).toBe(true);
    const revisionPrompt = JSON.stringify(mock.callsFor('technical-specialist')[1].messages);
    expect(revisionPrompt).toContain('Be empathetic');
  });

  it('flags for human review if still rejected after the single revision', async () => {
    const { orchestrator, mock } = await setup();
    const reject = reviewReply({ approved: false, grounded: false, issues: ['Invented policy'] });
    mock
      .enqueue('router', classificationReply({ category: 'general', priority: 'low' }))
      .enqueue('general-specialist', 'draft 1', 'draft 2')
      .enqueue('reviewer', reject, reject);

    const result = await orchestrator.process({ subject: 'Q', body: 'Do you have dark mode?' });
    expect(result.needsHumanReview).toBe(true);
    expect(mock.callsFor('reviewer')).toHaveLength(2); // bounded: no third review
  });
});
