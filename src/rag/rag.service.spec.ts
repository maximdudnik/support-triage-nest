/**
 * RagService against the real kb/ folder, with a mocked LLM for embeddings.
 */
import { RagModule } from './rag.module';
import { RagService } from './rag.service';
import { createTestingModule, setTestEnv } from '../testing/test-app';
import { MockLlmProvider } from '../testing/mock-llm.provider';
import { tokenize } from './text-utils';

describe('RagService', () => {
  beforeEach(() => setTestEnv());

  it('indexes kb/*.md and retrieves by keywords when embeddings are off', async () => {
    const { moduleRef } = await createTestingModule([RagModule]);
    const rag = moduleRef.get(RagService);
    await rag.buildIndex();
    expect(rag.stats()).toEqual({ chunks: expect.any(Number), mode: 'keyword' });
    const hits = await rag.retrieve('I was charged twice, duplicate charge');
    expect(hits[0].id).toBe('billing.md#double-charges');
    expect(hits[0]).not.toHaveProperty('embedding');
  });

  it('uses embeddings + cosine search when enabled and the provider works', async () => {
    process.env.RAG_USE_EMBEDDINGS = 'true';
    // Fake "embedding": bag-of-words over a tiny vocabulary. Similar words -> similar vectors.
    const vocab = ['password', 'reset', 'refund', 'crash', 'upload', 'invoice'];
    const mock = new MockLlmProvider();
    mock.embedImpl = (texts) =>
      texts.map((t) => {
        const toks = tokenize(t);
        return vocab.map((v) => toks.filter((x) => x.startsWith(v)).length + 0.01);
      });
    const { moduleRef } = await createTestingModule([RagModule], mock);
    const rag = moduleRef.get(RagService);
    await rag.buildIndex();
    expect(rag.stats().mode).toBe('embedding');
    const hits = await rag.retrieve('forgot my password, need a reset');
    expect(hits[0].id).toBe('account.md#password-reset');
  });

  it('falls back to keyword mode when embedding fails at index time', async () => {
    process.env.RAG_USE_EMBEDDINGS = 'true';
    const mock = new MockLlmProvider();
    mock.embedImpl = () => {
      throw new Error('429 quota');
    };
    const { moduleRef } = await createTestingModule([RagModule], mock);
    const rag = moduleRef.get(RagService);
    await rag.buildIndex();
    expect(rag.stats().mode).toBe('keyword');
    expect((await rag.retrieve('app crashes on upload'))[0].source).toBe('technical.md');
  });
});
