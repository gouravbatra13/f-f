import { getSecret } from './secret.js';

export interface AuthConfig {
  accessTokenSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  cookieSecure: boolean;
}

function parsePositiveInteger(
  value: string | undefined,
  name: string,
  fallback: number,
): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

export function getAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
): AuthConfig {
  const accessTokenSecret = getSecret(env, 'ACCESS_TOKEN_SECRET');
  if (!accessTokenSecret || Buffer.byteLength(accessTokenSecret, 'utf8') < 32) {
    throw new Error('ACCESS_TOKEN_SECRET must contain at least 32 bytes');
  }

  const cookieSecure = env.COOKIE_SECURE
    ? env.COOKIE_SECURE === 'true'
    : env.NODE_ENV === 'production';
  if (env.COOKIE_SECURE && !['true', 'false'].includes(env.COOKIE_SECURE)) {
    throw new Error('COOKIE_SECURE must be true or false');
  }
  if (env.NODE_ENV === 'production' && !cookieSecure) {
    throw new Error('COOKIE_SECURE must be true in production');
  }

  return {
    accessTokenSecret,
    accessTokenTtlSeconds: parsePositiveInteger(
      env.ACCESS_TOKEN_TTL_SECONDS,
      'ACCESS_TOKEN_TTL_SECONDS',
      900,
    ),
    refreshTokenTtlSeconds: parsePositiveInteger(
      env.REFRESH_TOKEN_TTL_SECONDS,
      'REFRESH_TOKEN_TTL_SECONDS',
      2_592_000,
    ),
    cookieSecure,
  };
}
