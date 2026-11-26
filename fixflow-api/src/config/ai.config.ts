export interface AiConfig {
  serviceUrl: string | null;
  serviceToken: string | null;
  timeoutMs: number;
  modelName: string;
  similarityThreshold: number;
  resultLimit: number;
}

function parseBoundedNumber(
  value: string | undefined,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be a number between ${min} and ${max}`);
  }
  return parsed;
}

export function getAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const serviceUrl = env.AI_SERVICE_URL?.trim() || null;
  const serviceToken = getSecret(env, 'AI_SERVICE_TOKEN')?.trim() || null;
  if (Boolean(serviceUrl) !== Boolean(serviceToken)) {
    throw new Error(
      'AI_SERVICE_URL and AI_SERVICE_TOKEN must either both be set or both be empty',
    );
  }
  if (serviceUrl) {
    let parsed: URL;
    try {
      parsed = new URL(serviceUrl);
    } catch {
      throw new Error('AI_SERVICE_URL must be a valid HTTP or HTTPS URL');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('AI_SERVICE_URL must be a valid HTTP or HTTPS URL');
    }
    if (Buffer.byteLength(serviceToken ?? '', 'utf8') < 32) {
      throw new Error('AI_SERVICE_TOKEN must contain at least 32 bytes');
    }
  }

  const threshold = parseBoundedNumber(
    env.AI_SIMILARITY_THRESHOLD,
    'AI_SIMILARITY_THRESHOLD',
    0.45,
    0,
    1,
  );
  const resultLimit = parseBoundedNumber(
    env.AI_SIMILARITY_LIMIT,
    'AI_SIMILARITY_LIMIT',
    5,
    1,
    10,
  );
  if (!Number.isInteger(resultLimit)) {
    throw new Error('AI_SIMILARITY_LIMIT must be an integer');
  }

  const modelName = env.OLLAMA_MODEL?.trim() || 'deepseek-coder:latest';
  if (modelName.length > 100) {
    throw new Error('OLLAMA_MODEL cannot exceed 100 characters');
  }

  return {
    serviceUrl: serviceUrl?.replace(/\/+$/, '') ?? null,
    serviceToken,
    timeoutMs: parseBoundedNumber(
      env.AI_REQUEST_TIMEOUT_MS,
      'AI_REQUEST_TIMEOUT_MS',
      120_000,
      1_000,
      300_000,
    ),
    modelName,
    similarityThreshold: threshold,
    resultLimit,
  };
}
import { getSecret } from './secret.js';

