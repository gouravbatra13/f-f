import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AuthConfig } from '../config/auth.config.js';
import type { AccessTokenClaims } from './auth.types.js';

const TOKEN_ISSUER = 'fixflow-api';

@Injectable()
export class AccessTokenService {
  private readonly config: AuthConfig;

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<AuthConfig>('auth');
  }

  sign(userId: string, authVersion: number, sessionFamilyId: string): string {
    const issuedAt = Math.floor(Date.now() / 1000);
    const header = this.encode({ alg: 'HS256', typ: 'JWT' });
    const claims: AccessTokenClaims = {
      sub: userId,
      av: authVersion,
      sid: sessionFamilyId,
      iat: issuedAt,
      exp: issuedAt + this.config.accessTokenTtlSeconds,
      iss: TOKEN_ISSUER,
    };
    const payload = this.encode(claims);
    const input = `${header}.${payload}`;
    return `${input}.${this.signature(input)}`;
  }

  verify(token: string): AccessTokenClaims {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Malformed token');
      }

      const [encodedHeader, encodedPayload, signature] = parts;
      const header: unknown = this.decode(encodedHeader);
      if (
        typeof header !== 'object' ||
        header === null ||
        !('alg' in header) ||
        header.alg !== 'HS256' ||
        !('typ' in header) ||
        header.typ !== 'JWT'
      ) {
        throw new Error('Invalid token header');
      }

      const expected = Buffer.from(
        this.signature(`${encodedHeader}.${encodedPayload}`),
      );
      const actual = Buffer.from(signature);
      if (
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      ) {
        throw new Error('Invalid signature');
      }

      const payload: unknown = this.decode(encodedPayload);
      if (
        typeof payload !== 'object' ||
        payload === null ||
        !('sub' in payload) ||
        typeof payload.sub !== 'string' ||
        payload.sub.length === 0 ||
        !('av' in payload) ||
        typeof payload.av !== 'number' ||
        !Number.isSafeInteger(payload.av) ||
        payload.av < 0 ||
        !('sid' in payload) ||
        typeof payload.sid !== 'string' ||
        payload.sid.length === 0 ||
        !('exp' in payload) ||
        typeof payload.exp !== 'number' ||
        !Number.isSafeInteger(payload.exp) ||
        !('iat' in payload) ||
        typeof payload.iat !== 'number' ||
        !Number.isSafeInteger(payload.iat) ||
        !('iss' in payload) ||
        payload.iss !== TOKEN_ISSUER
      ) {
        throw new Error('Invalid token claims');
      }

      const claims = payload as AccessTokenClaims;
      const now = Math.floor(Date.now() / 1000);
      if (
        claims.exp <= now ||
        claims.exp <= claims.iat ||
        claims.iat > now + 60
      ) {
        throw new Error('Expired token');
      }

      return claims;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  get expiresIn(): number {
    return this.config.accessTokenTtlSeconds;
  }

  private signature(input: string): string {
    return createHmac('sha256', this.config.accessTokenSecret)
      .update(input)
      .digest('base64url');
  }

  private encode(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }

  private decode(value: string): unknown {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  }
}
