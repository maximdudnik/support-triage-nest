/**
 * TicketsController - the HTTP layer. Thin by design: validate input,
 * delegate to the orchestrator, shape output. No business logic here.
 */
import { Body, Controller, HttpCode, Logger, MessageEvent, Post, Query, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { OrchestratorService } from '../agents/orchestrator.service';
import { CreateTicketDto } from '../dto/create-ticket.dto';
import { TriageResponseDto } from '../dto/triage-response.dto';

@Controller('tickets')
export class TicketsController {
  private readonly logger = new Logger(TicketsController.name);

  constructor(private readonly orchestrator: OrchestratorService) {}

  /** POST /tickets - run the full pipeline and return the final result. */
  @Post()
  @HttpCode(200) // 200 not 201: we return a processed result, not a stored resource
  create(@Body() dto: CreateTicketDto): Promise<TriageResponseDto> {
    return this.orchestrator.process(dto);
  }

  /**
   * GET /tickets/stream?subject=...&body=... - Server-Sent Events.
   *
   * CONCEPT: Streaming progress. Multi-agent pipelines take several seconds;
   * SSE pushes each step (classified, tool_call, drafted, reviewed...) as it
   * happens, so a UI can show progress. SSE is one-way server->client over
   * plain HTTP (simpler than WebSockets). Browsers' EventSource only does GET,
   * hence query params. Nest's @Sse expects an Observable<MessageEvent>.
   */
  @Sse('stream')
  stream(@Query() dto: CreateTicketDto): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      this.orchestrator
        .process(dto, (event) => subscriber.next({ type: event.step, data: event }))
        .then((result) => {
          subscriber.next({ type: 'result', data: result });
          subscriber.complete();
        })
        .catch((err: Error) => {
          this.logger.warn(`SSE pipeline failed: ${err.message}`);
          subscriber.next({ type: 'error', data: { message: err.message } });
          subscriber.complete();
        });
    });
  }
}
