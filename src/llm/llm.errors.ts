/**
 * Domain errors for the LLM layer.
 *
 * WHY custom error classes: callers (retry logic, exception filters) can make
 * decisions with `instanceof` instead of parsing error message strings.
 */

/** No API key -> the feature is unavailable, not a bug. Mapped to HTTP 503. */
export class LlmNotConfiguredError extends Error {
  constructor() {
    super('GEMINI_API_KEY is not set. Get a free key at https://aistudio.google.com/apikey');
    this.name = 'LlmNotConfiguredError';
  }
}

/** The call took longer than LLM_TIMEOUT_MS. Retryable. */
export class LlmTimeoutError extends Error {
  constructor(ms: number) {
    super(`LLM call timed out after ${ms}ms`);
    this.name = 'LlmTimeoutError';
  }
}

/**
 * Normalised upstream error carrying the HTTP status (e.g. 429, 500), so the
 * retry helper does not depend on SDK-specific error classes.
 */
export class LlmApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'LlmApiError';
  }
}
