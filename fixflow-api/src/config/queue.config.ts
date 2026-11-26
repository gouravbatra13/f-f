import { getSecret } from './secret.js';

export interface QueueConfig {
  enabled: boolean;
  host: string;
  port: number;
  password: string | undefined;
  database: number;
  concurrency: number;
}

function boundedInteger(
  value: string | undefined,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return parsed;
}

export function getQueueConfig(
  env: NodeJS.ProcessEnv = process.env,
): QueueConfig {
  const enabledValue = env.QUEUE_ENABLED ?? 'false';
  if (!['true', 'false'].includes(enabledValue)) {
    throw new Error('QUEUE_ENABLED must be true or false');
  }

  const enabled = enabledValue === 'true';
  const password = getSecret(env, 'REDIS_PASSWORD');
  if (enabled && env.NODE_ENV === 'production' && !password) {
    throw new Error('REDIS_PASSWORD is required when queues are enabled in production');
  }

  return {
    enabled,
    host: env.REDIS_HOST?.trim() || '127.0.0.1',
    port: boundedInteger(env.REDIS_PORT, 'REDIS_PORT', 6379, 1, 65535),
    password,
    database: boundedInteger(env.REDIS_DB, 'REDIS_DB', 0, 0, 15),
    concurrency: boundedInteger(
      env.AI_WORKER_CONCURRENCY,
      'AI_WORKER_CONCURRENCY',
      2,
      1,
      16,
    ),
  };
}
