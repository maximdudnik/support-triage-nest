/** Unit tests for the pure resilience helpers - no Nest, no timers waiting. */
import { LlmApiError, LlmTimeoutError } from './llm.errors';
import { computeBackoffDelay, isRetryableError, withRetry, withTimeout } from './retry.util';

describe('retry.util', () => {
  const noSleep = jest.fn(async () => undefined);
  beforeEach(() => noSleep.mockClear());

  it('classifies retryable errors (429, 5xx, timeout) vs permanent ones (400, 401)', () => {
    expect(isRetryableError(new LlmApiError('rate', 429))).toBe(true);
    expect(isRetryableError(new LlmApiError('boom', 503))).toBe(true);
    expect(isRetryableError(new LlmTimeoutError(10))).toBe(true);
    expect(isRetryableError(new LlmApiError('bad', 400))).toBe(false);
    expect(isRetryableError(new LlmApiError('auth', 401))).toBe(false);
    expect(isRetryableError(new Error('random'))).toBe(false);
  });

  it('computes exponential backoff with jitter and a cap', () => {
    const max = () => 1; // jitter at its maximum
    expect(computeBackoffDelay(0, 1000, 20_000, max)).toBe(1000);
    expect(computeBackoffDelay(1, 1000, 20_000, max)).toBe(2000);
    expect(computeBackoffDelay(2, 1000, 20_000, max)).toBe(4000);
    expect(computeBackoffDelay(10, 1000, 20_000, max)).toBe(20_000); // capped
    expect(computeBackoffDelay(1, 1000, 20_000, () => 0)).toBe(1000); // min jitter = half
  });

  it('retries a 429 until success', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new LlmApiError('rate', 429))
      .mockRejectedValueOnce(new LlmApiError('rate', 429))
      .mockResolvedValue('ok');
    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 1, sleep: noSleep })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(noSleep).toHaveBeenCalledTimes(2);
  });

  it('gives up after maxRetries and rethrows the last error', async () => {
    const fn = jest.fn().mockRejectedValue(new LlmApiError('rate', 429));
    await expect(withRetry(fn, { maxRetries: 2, baseDelayMs: 1, sleep: noSleep })).rejects.toThrow('rate');
    expect(fn).toHaveBeenCalledTimes(3); // 1 attempt + 2 retries
  });

  it('does NOT retry non-retryable errors', async () => {
    const fn = jest.fn().mockRejectedValue(new LlmApiError('bad request', 400));
    await expect(withRetry(fn, { maxRetries: 5, baseDelayMs: 1, sleep: noSleep })).rejects.toThrow('bad request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('withTimeout rejects with LlmTimeoutError and aborts the signal', async () => {
    let captured: AbortSignal | undefined;
    const never = (signal: AbortSignal) => {
      captured = signal;
      return new Promise<string>(() => undefined);
    };
    await expect(withTimeout(never, 20)).rejects.toBeInstanceOf(LlmTimeoutError);
    expect(captured?.aborted).toBe(true);
  });

  it('withTimeout resolves fast calls normally', async () => {
    await expect(withTimeout(async () => 42, 1000)).resolves.toBe(42);
  });
});
