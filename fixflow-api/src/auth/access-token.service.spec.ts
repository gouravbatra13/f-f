import { UnauthorizedException } from '@nestjs/common';
import { AccessTokenService } from './access-token.service.js';

describe('AccessTokenService', () => {
  const service = new AccessTokenService({
    getOrThrow: () => ({
      accessTokenSecret: 'unit-test-secret-that-is-at-least-32-bytes',
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 60,
      cookieSecure: false,
    }),
  } as never);

  it('signs and verifies short-lived access-token claims', () => {
    const token = service.sign('user-id', 3, 'session-family-id');

    expect(service.verify(token)).toMatchObject({
      sub: 'user-id',
      av: 3,
      sid: 'session-family-id',
      iss: 'fixflow-api',
    });
    expect(service.expiresIn).toBe(900);
  });

  it('rejects malformed or tampered tokens', () => {
    expect(() => service.verify('not.a.jwt')).toThrow(UnauthorizedException);

    const token = service.sign('user-id', 0, 'session-family-id');
    const [header, payload, signature] = token.split('.');
    const tampered = `${header}.${payload}.${signature.slice(0, -1)}x`;

    expect(() => service.verify(tampered)).toThrow(UnauthorizedException);
  });

  it('rejects expired access tokens', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      const token = service.sign('user-id', 0, 'session-family-id');
      vi.setSystemTime(new Date('2026-01-01T00:16:00.000Z'));

      expect(() => service.verify(token)).toThrow(UnauthorizedException);
    } finally {
      vi.useRealTimers();
    }
  });
});
