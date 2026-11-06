import { getDatabaseConfig } from './database.config.js';

function parsePort(value: string | undefined): number {
  if (value === undefined || value === '') {
    return 3001;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  return port;
}

function parseApiPrefix(value: string | undefined): string {
  const prefix = value ?? 'api/v1';
  if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(prefix)) {
    throw new Error(
      'API_PREFIX must contain non-empty URL path segments without leading or trailing slashes',
    );
  }

  return prefix;
}

function parseWebOrigin(value: string | undefined): string {
  const origin = value ?? 'http://localhost:3000';

  try {
    const parsedOrigin = new URL(origin);
    if (
      !['http:', 'https:'].includes(parsedOrigin.protocol) ||
      parsedOrigin.origin !== origin
    ) {
      throw new Error();
    }
  } catch {
    throw new Error('WEB_ORIGIN must be a valid HTTP or HTTPS origin');
  }

  return origin;
}

export default () => ({
  port: parsePort(process.env.PORT),
  apiPrefix: parseApiPrefix(process.env.API_PREFIX),
  webOrigin: parseWebOrigin(process.env.WEB_ORIGIN),
  database: getDatabaseConfig(),
});
