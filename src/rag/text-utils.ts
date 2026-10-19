/**
 * Pure helpers for RAG: chunking, cosine similarity, keyword scoring.
 *
 * Kept framework-free so they are easy to test and to explain in interviews.
 */
import { KbChunk } from './rag.types';

/**
 * CONCEPT: Chunking.
 * WHY: We retrieve small, focused pieces, not whole files: (1) embeddings of
 * long text get "blurry" (average of many topics), (2) the prompt has a token
 * budget, (3) smaller chunks = more precise citations.
 * Strategy here: split markdown by "## " headings (semantic boundaries).
 * Real systems also use fixed-size windows with overlap (e.g. 500 tokens, 50 overlap).
 */
export function chunkMarkdown(source: string, markdown: string): KbChunk[] {
  const chunks: KbChunk[] = [];
  const sections = markdown.split(/^##\s+/m);
  // sections[0] is the text before the first "## " (usually the "# Title")
  const docTitle = /^#\s+(.+)$/m.exec(sections[0])?.[1]?.trim() ?? source;
  for (const section of sections.slice(1)) {
    const [heading, ...rest] = section.split('\n');
    const text = rest.join('\n').trim();
    if (!text) continue;
    const title = heading.trim();
    chunks.push({
      id: `${source}#${slugify(title)}`,
      source,
      title: `${docTitle} / ${title}`,
      text,
    });
  }
  return chunks;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/**
 * CONCEPT: Cosine similarity = cos(angle between vectors) = (a.b) / (|a||b|).
 * 1 = same direction (same meaning), 0 = unrelated. We compare direction, not
 * length, so long and short texts are comparable.
 * Brute force over all chunks is O(N*d) - fine for hundreds/thousands of
 * chunks. Vector DBs (pgvector, Pinecone, Chroma) use ANN indexes (HNSW, IVF)
 * to make this sub-linear for millions.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const STOP_WORDS = new Set(
  'a an the and or but is are was were be to of in on for with my me i you your it this that how do does can what why when not have has'.split(
    ' ',
  ),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

/**
 * Keyword fallback: fraction of query terms found in the chunk (title matches
 * count double). A tiny cousin of BM25. Used when embeddings are disabled or
 * fail (no key, quota exhausted) - graceful degradation instead of an outage.
 * Production systems often run BOTH and merge results ("hybrid search").
 */
export function keywordScore(query: string, chunk: KbChunk): number {
  const q = new Set(tokenize(query));
  if (q.size === 0) return 0;
  const body = new Set(tokenize(chunk.text));
  const title = new Set(tokenize(chunk.title));
  let score = 0;
  for (const t of q) {
    if (title.has(t)) score += 2;
    else if (body.has(t)) score += 1;
  }
  return score / (q.size * 2);
}
