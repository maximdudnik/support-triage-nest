/**
 * RagService - Retrieval-Augmented Generation, the "R" part.
 *
 * CONCEPT: RAG = retrieve relevant private knowledge at request time and put
 * it in the prompt, so the model answers from YOUR docs instead of its
 * (possibly outdated or invented) training memory. Pipeline:
 *   INDEX (once, at boot): load kb/*.md -> chunk -> embed -> store in memory
 *   QUERY (per ticket):    embed question -> cosine top-k -> give to the agent
 *
 * CONCEPT: Nest lifecycle hooks. OnApplicationBootstrap runs after all
 * modules are initialised, a good place for warm-up work like indexing.
 */
import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as path from 'path';
import { AppConfig } from '../config/configuration';
import { LLM_PROVIDER, type LlmProvider } from '../llm/llm.types';
import { KbChunk, RetrievalMode, RetrievedChunk } from './rag.types';
import { chunkMarkdown, cosineSimilarity, keywordScore } from './text-utils';

@Injectable()
export class RagService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RagService.name);
  private chunks: KbChunk[] = [];
  private mode: RetrievalMode = 'keyword';
  private readonly cfg: AppConfig['rag'];

  constructor(
    config: ConfigService<AppConfig, true>,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {
    this.cfg = config.get('rag', { infer: true });
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.buildIndex();
  }

  /** Public so tests (and a future "re-index" endpoint) can call it. */
  async buildIndex(): Promise<void> {
    const dir = path.resolve(process.cwd(), this.cfg.kbDir);
    let files: string[] = [];
    try {
      files = (await fs.readdir(dir)).filter((f) => f.endsWith('.md')).sort();
    } catch {
      this.logger.warn(`Knowledge base dir not found: ${dir}. RAG will return nothing.`);
    }
    const chunks: KbChunk[] = [];
    for (const f of files) {
      chunks.push(...chunkMarkdown(f, await fs.readFile(path.join(dir, f), 'utf8')));
    }
    this.chunks = chunks;
    this.mode = 'keyword';

    if (this.cfg.useEmbeddings && this.llm.isConfigured() && chunks.length > 0) {
      try {
        // Embed title + text: the heading carries a lot of meaning.
        const vectors = await this.llm.embed(
          chunks.map((c) => `${c.title}\n${c.text}`),
          'document',
        );
        chunks.forEach((c, i) => (c.embedding = vectors[i]));
        this.mode = 'embedding';
      } catch (err) {
        // Graceful degradation: keep serving with keyword search.
        this.logger.warn(`Embedding failed, using keyword search: ${(err as Error).message}`);
      }
    }
    this.logger.log(`Indexed ${chunks.length} chunks from ${files.length} files (mode=${this.mode})`);
  }

  /**
   * Return the top-k chunks for a query. `preferSources` boosts the category's
   * own document (e.g. billing.md for billing tickets) - a simple form of
   * metadata filtering.
   */
  async retrieve(query: string, opts: { topK?: number; preferSources?: string[] } = {}): Promise<RetrievedChunk[]> {
    const topK = opts.topK ?? this.cfg.topK;
    if (this.chunks.length === 0) return [];

    let scored: RetrievedChunk[] | undefined;
    if (this.mode === 'embedding') {
      try {
        const [q] = await this.llm.embed([query], 'query');
        scored = this.chunks.map((c) => ({ ...c, score: cosineSimilarity(q, c.embedding ?? []) }));
      } catch (err) {
        this.logger.warn(`Query embedding failed, falling back to keywords: ${(err as Error).message}`);
      }
    }
    scored ??= this.chunks.map((c) => ({ ...c, score: keywordScore(query, c) }));

    const boost = new Set(opts.preferSources ?? []);
    return scored
      .map((c) => (boost.has(c.source) ? { ...c, score: c.score * 1.15 } : c))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ embedding: _drop, ...rest }) => rest); // don't leak 3k-float vectors
  }

  stats(): { chunks: number; mode: RetrievalMode } {
    return { chunks: this.chunks.length, mode: this.mode };
  }
}
