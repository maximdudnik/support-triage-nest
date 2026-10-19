/**
 * Typed, grouped configuration.
 *
 * CONCEPT: Configuration as a typed object instead of raw `process.env` lookups.
 * WHY: `config.get('llm.timeoutMs')` with a typed shape gives autocomplete and
 * compile-time safety, and keeps all env-var names in ONE place. Services
 * depend on `ConfigService<AppConfig, true>` (the `true` means "values are
 * validated, so get() never returns undefined").
 */
import { Env, validateEnv } from './env.validation';

export interface AppConfig {
  port: number;
  nodeEnv: Env['NODE_ENV'];
  gemini: {
    apiKey: string;
    model: string;
    embeddingModel: string;
  };
  llm: {
    timeoutMs: number;
    maxRetries: number;
    retryBaseDelayMs: number;
  };
  rag: {
    kbDir: string;
    topK: number;
    useEmbeddings: boolean;
  };
  agents: {
    maxToolSteps: number;
  };
}

/**
 * Factory passed to ConfigModule.forRoot({ load: [configuration] }).
 * It re-validates process.env so the typed object and the raw env agree.
 */
export default function configuration(): AppConfig {
  const env = validateEnv(process.env);
  return {
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
    gemini: {
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL,
      embeddingModel: env.GEMINI_EMBEDDING_MODEL,
    },
    llm: {
      timeoutMs: env.LLM_TIMEOUT_MS,
      maxRetries: env.LLM_MAX_RETRIES,
      retryBaseDelayMs: env.LLM_RETRY_BASE_DELAY_MS,
    },
    rag: {
      kbDir: env.KB_DIR,
      topK: env.RAG_TOP_K,
      useEmbeddings: env.RAG_USE_EMBEDDINGS,
    },
    agents: {
      maxToolSteps: env.AGENT_MAX_TOOL_STEPS,
    },
  };
}
