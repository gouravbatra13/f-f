import { readFileSync } from 'node:fs';

export function getSecret(
  env: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  const file = env[`${name}_FILE`];
  if (!file) return env[name];

  const value = readFileSync(file, 'utf8').replace(/\r?\n$/, '');
  if (!value) {
    throw new Error(`${name}_FILE must point to a non-empty secret file`);
  }
  return value;
}
