import { getAiConfig } from './ai.config.js';

describe('getAiConfig', () => {
  it('keeps AI optional when no service credentials are configured', () => {
    expect(getAiConfig({})).toMatchObject({
      serviceUrl: null,
      serviceToken: null,
      modelName: 'deepseek-coder:latest',
      similarityThreshold: 0.45,
      resultLimit: 5,
    });
  });

  it('requires a valid URL and a strong shared service token', () => {
    expect(() =>
      getAiConfig({
        AI_SERVICE_URL: 'http://127.0.0.1:8000',
      }),
    ).toThrow('AI_SERVICE_URL and AI_SERVICE_TOKEN must either both be set');

    expect(() =>
      getAiConfig({
        AI_SERVICE_URL: 'ftp://127.0.0.1:8000',
        AI_SERVICE_TOKEN: 'a'.repeat(40),
      }),
    ).toThrow('AI_SERVICE_URL must be a valid HTTP or HTTPS URL');

    expect(() =>
      getAiConfig({
        AI_SERVICE_URL: 'http://127.0.0.1:8000',
        AI_SERVICE_TOKEN: 'too-short',
      }),
    ).toThrow('AI_SERVICE_TOKEN must contain at least 32 bytes');
  });

  it('rejects invalid timeouts and similarity settings', () => {
    expect(() =>
      getAiConfig({ AI_REQUEST_TIMEOUT_MS: '500' }),
    ).toThrow('AI_REQUEST_TIMEOUT_MS must be a number between 1000 and 300000');

    expect(() =>
      getAiConfig({ AI_SIMILARITY_THRESHOLD: '2' }),
    ).toThrow('AI_SIMILARITY_THRESHOLD must be a number between 0 and 1');
  });
});
