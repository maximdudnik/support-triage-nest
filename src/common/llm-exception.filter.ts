/**
 * Exception filter: translate domain errors into proper HTTP responses.
 *
 * CONCEPT: Keep HTTP concerns out of business logic. Agents throw domain
 * errors (LlmTimeoutError...); this filter decides the status code. Clients
 * then get actionable codes: 503 = not configured, 429 = slow down, 504 = timeout.
 */
import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { LlmApiError, LlmNotConfiguredError, LlmTimeoutError } from '../llm/llm.errors';

@Catch(LlmNotConfiguredError, LlmTimeoutError, LlmApiError)
export class LlmExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(LlmExceptionFilter.name);

  catch(err: Error, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    let status = HttpStatus.BAD_GATEWAY;
    if (err instanceof LlmNotConfiguredError) status = HttpStatus.SERVICE_UNAVAILABLE;
    else if (err instanceof LlmTimeoutError) status = HttpStatus.GATEWAY_TIMEOUT;
    else if (err instanceof LlmApiError && err.status === 429) status = HttpStatus.TOO_MANY_REQUESTS;
    this.logger.warn(`${err.name} -> HTTP ${status}: ${err.message}`);
    if (status === HttpStatus.TOO_MANY_REQUESTS) res.setHeader('Retry-After', '30');
    // Do not leak upstream error details/stack traces to clients.
    res.status(status).json({ statusCode: status, error: err.name, message: publicMessage(err) });
  }
}

function publicMessage(err: Error): string {
  if (err instanceof LlmNotConfiguredError) return err.message;
  if (err instanceof LlmTimeoutError) return 'The AI provider timed out. Please retry.';
  if (err instanceof LlmApiError && err.status === 429) return 'AI provider rate limit reached. Please retry later.';
  return 'The AI provider returned an error.';
}
