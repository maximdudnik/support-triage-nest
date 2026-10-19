/**
 * Root module: the top of the dependency graph.
 *
 * ConfigModule.forRoot is a "dynamic module" (configured at import time).
 * isGlobal: true makes ConfigService injectable everywhere without importing
 * ConfigModule in each feature module - acceptable for config, which really
 * is used everywhere.
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { TicketsModule } from './tickets/tickets.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validate: validateEnv, // fail fast on bad env
    }),
    TicketsModule,
  ],
})
export class AppModule {}
