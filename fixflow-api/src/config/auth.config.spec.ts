import { getAuthConfig } from './auth.config.js';

const developmentEnvironment = {
  ACCESS_TOKEN_SECRET: 'unit-test-secret-that-is-at-least-32-bytes',
};

describe('getAuthConfig', () => {
  it('uses short access-token and long refresh-token defaults', () => {
    expect(getAuthConfig(developmentEnvironment)).toMatchObject({
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 2_592_000,
      cookieSecure: false,
    });
  });

  it('requires a strong secret and valid lifetimes', () => {
    expect(() => getAuthConfig({ ACCESS_TOKEN_SECRET: 'too-short' })).toThrow(
      'ACCESS_TOKEN_SECRET must contain at least 32 bytes',
    );

    expect(() =>
      getAuthConfig({
        ...developmentEnvironment,
        ACCESS_TOKEN_TTL_SECONDS: '0',
      }),
    ).toThrow('ACCESS_TOKEN_TTL_SECONDS must be a positive integer');
  });

  it('requires secure cookies in production', () => {
    expect(
      getAuthConfig({
        ...developmentEnvironment,
        NODE_ENV: 'production',
      }).cookieSecure,
    ).toBe(true);

    expect(() =>
      getAuthConfig({
        ...developmentEnvironment,
        NODE_ENV: 'production',
        COOKIE_SECURE: 'false',
      }),
    ).toThrow('COOKIE_SECURE must be true in production');
  });
});
