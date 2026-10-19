/**
 * Global app configuration, shared by main.ts and the e2e test so tests run
 * with exactly the same pipes/filters as production.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { LlmExceptionFilter } from './common/llm-exception.filter';

export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties without decorators
      forbidNonWhitelisted: true, // ...or reject them with 400
      transform: true, // turn plain JSON into DTO class instances
    }),
  );
  app.useGlobalFilters(new LlmExceptionFilter());
}
