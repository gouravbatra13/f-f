import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getSecret } from './secret.js';

describe('getSecret', () => {
  it('prefers a mounted secret file and removes its trailing newline', () => {
    const directory = mkdtempSync(join(tmpdir(), 'fixflow-secret-'));
    const path = join(directory, 'secret');
    writeFileSync(path, 'test-secret\n');
    try {
      expect(getSecret({ TOKEN: 'ignored', TOKEN_FILE: path }, 'TOKEN')).toBe(
        'test-secret',
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('returns an environment secret when no file is configured', () => {
    expect(getSecret({ TOKEN: 'environment-secret' }, 'TOKEN')).toBe(
      'environment-secret',
    );
  });
});
