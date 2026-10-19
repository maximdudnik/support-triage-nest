import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  it('applies defaults and coerces strings', () => {
    const env = validateEnv({ PORT: '8080', RAG_USE_EMBEDDINGS: 'false' });
    expect(env.PORT).toBe(8080);
    expect(env.RAG_USE_EMBEDDINGS).toBe(false); // not the z.coerce.boolean() trap
    expect(env.GEMINI_MODEL).toBe('gemini-2.5-flash');
  });

  it('fails fast on invalid values', () => {
    expect(() => validateEnv({ PORT: 'abc' })).toThrow(/Invalid environment configuration/);
  });
});
