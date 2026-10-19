import { chunkMarkdown, cosineSimilarity, keywordScore } from './text-utils';

describe('RAG text utils', () => {
  const md = '# Billing\n\n## Refund policy\nRefunds within 30 days.\n\n## Invoices\nDownload PDF invoices.\n';

  it('chunks markdown by "## " sections with stable citation ids', () => {
    const chunks = chunkMarkdown('billing.md', md);
    expect(chunks.map((c) => c.id)).toEqual(['billing.md#refund-policy', 'billing.md#invoices']);
    expect(chunks[0].title).toBe('Billing / Refund policy');
  });

  it('cosine similarity: identical = 1, orthogonal = 0, length-invariant', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 2], [2, 4])).toBeCloseTo(1);
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('keyword score prefers chunks whose title matches', () => {
    const [refund, invoices] = chunkMarkdown('billing.md', md);
    expect(keywordScore('refund please', refund)).toBeGreaterThan(keywordScore('refund please', invoices));
  });
});
