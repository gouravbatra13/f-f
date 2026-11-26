import { createHash } from 'node:crypto';
import { redactSensitiveText } from '../common/sensitive-data-redactor.js';

function normalizeMessage(message: string): string {
  return redactSensitiveText(message)
    .normalize('NFKC')
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, '<uuid>')
    .replace(/\b0x[0-9a-f]+\b/gi, '<hex>')
    .replace(/\b\d{5,}\b/g, '<number>')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeStack(stackTrace: string | undefined): string {
  if (!stackTrace) return '';

  return redactSensitiveText(stackTrace)
    .normalize('NFKC')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((line) => {
      let normalized = line
        .replace(/\\/g, '/')
        .replace(/^[A-Za-z]:/, '')
        .replace(/:\d+(?::\d+)?(?=\)?$)/g, '');
      const sourcePath = /(?:[A-Za-z]:)?\/(?:[^/]+\/)*(?:src|dist|build)\//i.exec(
        normalized,
      );
      if (sourcePath?.index !== undefined) {
        const marker = /(?:src|dist|build)\//i.exec(sourcePath[0])?.[0];
        if (marker) {
          normalized =
            normalized.slice(0, sourcePath.index) +
            marker +
            normalized.slice(sourcePath.index + sourcePath[0].length);
        }
      }
      return normalized.replace(/\s+/g, ' ');
    })
    .join('\n')
    .toLowerCase();
}

export function createErrorFingerprint(
  message: string,
  stackTrace?: string,
): string {
  const signature = `${normalizeMessage(message)}\n---stack---\n${normalizeStack(stackTrace)}`;
  return createHash('sha256').update(signature).digest('hex');
}
