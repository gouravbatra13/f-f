import { getSecret } from './secret.js';

export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  connectionLimit: number;
}

function requiredValue(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? 33316);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('MYSQL_PORT must be an integer between 1 and 65535');
  }

  return port;
}

function parsePoolSize(value: string | undefined): number {
  const size = Number(value ?? 10);
  if (!Number.isInteger(size) || size < 1 || size > 50) {
    throw new Error('MYSQL_POOL_SIZE must be an integer between 1 and 50');
  }
  return size;
}

export function getDatabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseConfig {
  return {
    host: requiredValue(env.MYSQL_HOST, 'MYSQL_HOST'),
    port: parsePort(env.MYSQL_PORT),
    username: requiredValue(env.MYSQL_USER, 'MYSQL_USER'),
    password: requiredValue(getSecret(env, 'MYSQL_PASSWORD'), 'MYSQL_PASSWORD'),
    database: requiredValue(env.MYSQL_DATABASE, 'MYSQL_DATABASE'),
    connectionLimit: parsePoolSize(env.MYSQL_POOL_SIZE),
  };
}
