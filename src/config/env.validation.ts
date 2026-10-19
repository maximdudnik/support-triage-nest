/**
 * Environment validation.
 *
 * CONCEPT: "Fail fast" configuration.
 * WHY: A typo in an env var (e.g. PORT=abc) should crash the app at boot with
 * a clear message, not cause a confusing error at 3am on the first request.
 * @nestjs/config lets us plug in a `validate` function that runs once, before
 * any provider is created. We use zod because the same library also validates
 * LLM output (see agents/schemas.ts) - one validation tool to learn.
 *
 * `z.coerce.number()` is needed because process.env values are ALWAYS strings.
 */
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  // Optional on purpose: the app can boot (health checks, tests, keyword RAG)
  // without a key. GeminiService throws a clear 503-style error when it is
  // actually needed. In a real production service you might make it required.
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_EMBEDDING_MODEL: z.string().default('gemini-embedding-001'),

  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
  LLM_RETRY_BASE_DELAY_MS: z.coerce.number().int().min(0).default(1_000),

  KB_DIR: z.string().default('kb'),
  RAG_TOP_K: z.coerce.number().int().positive().default(3),
  // "false" -> false. z.coerce.boolean() would turn the string "false" into
  // true (any non-empty string is truthy), a classic bug - so parse explicitly.
  RAG_USE_EMBEDDINGS: z
    .string()
    .default('true')
    .transform((v) => v.toLowerCase() !== 'false'),

  AGENT_MAX_TOOL_STEPS: z.coerce.number().int().min(1).max(10).default(4),
});

export type Env = z.infer<typeof envSchema>;

/** Called by ConfigModule.forRoot({ validate }). Must return the parsed config or throw. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    // z.prettifyError gives a human-readable multi-line message.
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
