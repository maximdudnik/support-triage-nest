/**
 * HTTP-level test (supertest) through the real AppModule with the LLM mocked:
 * validation pipe, exception filter, controllers, DI wiring - no network.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { configureApp } from '../app.setup';
import { LlmApiError, LlmNotConfiguredError } from '../llm/llm.errors';
import { LLM_PROVIDER } from '../llm/llm.types';
import { classificationReply, MockLlmProvider, reviewReply } from '../testing/mock-llm.provider';
import { setTestEnv } from '../testing/test-app';

describe('Tickets API (e2e)', () => {
  let app: INestApplication;
  let mock: MockLlmProvider;

  beforeEach(async () => {
    setTestEnv();
    mock = new MockLlmProvider();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LLM_PROVIDER)
      .useValue(mock)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init(); // runs onApplicationBootstrap -> RAG index (keyword mode)
  });

  afterEach(() => app.close());

  it('GET /health', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', llm: { model: 'mock-model' }, rag: { mode: 'keyword' } });
    expect(res.body.rag.chunks).toBeGreaterThan(0);
  });

  it('POST /tickets rejects invalid bodies with 400', async () => {
    await request(app.getHttpServer()).post('/tickets').send({ subject: '' }).expect(400);
    await request(app.getHttpServer())
      .post('/tickets')
      .send({ subject: 'a', body: 'b', hacker: true })
      .expect(400); // forbidNonWhitelisted
  });

  it('POST /tickets runs the pipeline', async () => {
    mock
      .enqueue('router', classificationReply())
      .enqueue(
        'billing-specialist',
        { functionCalls: [{ name: 'lookupOrderStatus', args: { orderId: 'ORD-1002' } }] },
        'Hi! The duplicate charge is refunded automatically [billing.md#double-charges].',
      )
      .enqueue('reviewer', reviewReply());

    const res = await request(app.getHttpServer())
      .post('/tickets')
      .send({ subject: 'Charged twice', body: 'Double charge on ORD-1002', orderId: 'ORD-1002' })
      .expect(200);
    expect(res.body.classification.category).toBe('billing');
    expect(res.body.toolCalls[0].name).toBe('lookupOrderStatus');
    expect(res.body.citations).toEqual(['billing.md#double-charges']);
  });

  it('maps a 429 from the provider to HTTP 429 with Retry-After', async () => {
    mock.enqueue('router', new LlmApiError('quota', 429));
    const res = await request(app.getHttpServer()).post('/tickets').send({ subject: 's', body: 'b' }).expect(429);
    expect(res.headers['retry-after']).toBe('30');
  });

  it('returns 503 when no API key is configured', async () => {
    mock.handler = () => new LlmNotConfiguredError();
    await request(app.getHttpServer()).post('/tickets').send({ subject: 's', body: 'b' }).expect(503);
  });
});
