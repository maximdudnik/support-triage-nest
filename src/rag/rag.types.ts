/** A retrievable piece of knowledge. Chunk = one "## section" of a kb/*.md file. */
export interface KbChunk {
  id: string; // e.g. "billing.md#refund-policy" - used as a citation
  source: string; // file name
  title: string; // section heading
  text: string;
  embedding?: number[];
}

export interface RetrievedChunk extends KbChunk {
  score: number;
}

export type RetrievalMode = 'embedding' | 'keyword';
