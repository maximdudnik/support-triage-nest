/**
 * Entry point: create the Nest application, apply global cross-cutting
 * concerns (validation, error mapping) and enable graceful shutdown.
 */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { AppConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  // On SIGTERM (docker stop, k8s rollout) run shutdown hooks and finish
  // in-flight requests instead of dying mid-response.
  app.enableShutdownHooks();

  const config = app.get<ConfigService<AppConfig, true>>(ConfigService);
  const port = config.get('port', { infer: true });
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`Support triage API listening on http://localhost:${port}`);
  if (!config.get('gemini', { infer: true }).apiKey) {
    logger.warn('GEMINI_API_KEY not set: /health works, POST /tickets will return 503.');
  }
}

void bootstrap();
