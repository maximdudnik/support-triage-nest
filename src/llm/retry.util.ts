/**
 * Retry with exponential backoff + jitter, and a timeout wrapper.
 *
 * CONCEPT: Resilience against rate limits and transient failures.
 * The free Gemini tier has low requests-per-minute limits, so HTTP 429
 * ("Too Many Requests") is EXPECTED, not exceptional. Strategy:
 *   - Retry only errors that can succeed later: 429, 5xx, timeouts, network.
 *     NEVER retry 400/401/403 - the same request will fail the same way and
 *     you burn quota.
 *   - Exponential backoff: wait base * 2^attempt (1s, 2s, 4s...) so a
 *     struggling server gets breathing room.
 *   - Jitter: randomise the delay so many clients that failed at the same
 *     moment do not all retry at the same moment ("thundering herd").
 *   - Cap the delay and the number of attempts so a request cannot hang forever.
 *
 * Pure functions (no Nest) -> trivially unit-testable (see retry.util.spec.ts).
 */
import { LlmApiError, LlmTimeoutError } from './llm.errors';

export interface RetryOptions {
  maxRetries: number; // retries AFTER the first attempt
  baseDelayMs: number;
  maxDelayMs?: number;
  /** Injected for tests so they don't actually wait. */
  sleep?: (ms: number) => Promise<void>;
  /** Injected for tests so jitter is deterministic. */
  random?: () => number;
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Decide if an error is worth retrying. */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof LlmTimeoutError) return true;
  const status =
    error instanceof LlmApiError
      ? error.status
      : (error as { status?: number } | undefined)?.status;
  if (status === 429 || status === 408) return true;
  if (typeof status === 'number' && status >= 500) return true;
  // Low-level network errors (connection reset, DNS hiccup) have codes, not statuses.
  const code = (error as { code?: string } | undefined)?.code;
  return code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'EAI_AGAIN';
}

/** delay = min(maxDelay, base * 2^attempt) * random(0.5..1.0)  ("equal jitter") */
export function computeBackoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs = 20_000,
  random: () => number = Math.random,
): number {
  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  return Math.round(exp / 2 + (random() * exp) / 2);
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const sleep = opts.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const canRetry = attempt < opts.maxRetries && isRetryableError(error);
      if (!canRetry) throw error;
      const delayMs = computeBackoffDelay(attempt, opts.baseDelayMs, opts.maxDelayMs, opts.random);
      opts.onRetry?.({ attempt: attempt + 1, delayMs, error });
      await sleep(delayMs);
    }
  }
}

/**
 * Run `fn` with a deadline. `fn` receives an AbortSignal; passing it to the
 * SDK actually cancels the HTTP request (not just ignores the result), which
 * frees sockets and stops paying for tokens nobody will read.
 */
export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new LlmTimeoutError(timeoutMs));
    }, timeoutMs);
  });
  try {
    return await Promise.race([fn(controller.signal), timeout]);
  } finally {
    clearTimeout(timer); // always clean up, or the timer keeps the process alive
  }
}
