const SENSITIVE_FIELD =
  /(?:password|passwd|secret|token|api[_-]?key|authorization|proxy-authorization|set-cookie|cookie|e-?mail|phone|ssn|ip(?:address)?|user[_-]?(?:id|name)|customer[_-]?(?:id|name))/i;

const SENSITIVE_ASSIGNMENT =
  /\b(authorization|proxy-authorization|x-api-key|set-cookie|cookie|password|passwd|access[_ -]?token|refresh[_ -]?token|session[_ -]?token|token|api[_ -]?key|client[_ -]?secret)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi;

export function redactSensitiveText(value: string): string {
  return value
    .replace(
      /\b(authorization|proxy-authorization|x-api-key)\b\s*[:=]\s*(?:bearer\s+)?[^\s,;]+/gi,
      '$1: [REDACTED]',
    )
    .replace(SENSITIVE_ASSIGNMENT, '$1=[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\bffk_live_[A-Za-z0-9_-]+\b/g, '[REDACTED_API_KEY]')
    .replace(
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]+)?\b/g,
      '[REDACTED_TOKEN]',
    )
    .replace(
      /([?&](?:password|passwd|secret|(?:access|refresh|session)?[_-]?token|api[_-]?key|authorization|email|phone|user[_-]?id)=)[^&#\s]*/gi,
      '$1[REDACTED]',
    )
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[REDACTED_IP]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]');
}

export function sanitizeEndpoint(value: string | undefined): string | null {
  if (!value) return null;
  const withoutQuery = value.split(/[?#]/, 1)[0].trim();
  return redactSensitiveText(withoutQuery).slice(0, 2048) || null;
}

export function sanitizeMetadata(
  value: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (!value) return null;

  const sanitizeValue = (item: unknown, depth: number): unknown => {
    if (typeof item === 'string') return redactSensitiveText(item).slice(0, 2000);
    if (typeof item === 'number' || typeof item === 'boolean' || item === null) {
      return item;
    }
    if (depth >= 4) return undefined;
    if (Array.isArray(item)) {
      return item
        .slice(0, 50)
        .map((child) => sanitizeValue(child, depth + 1))
        .filter((child) => child !== undefined);
    }
    if (typeof item !== 'object') return undefined;

    return sanitizeObject(item as Record<string, unknown>, depth + 1);
  };

  const sanitizeObject = (
    record: Record<string, unknown>,
    depth: number,
  ): Record<string, unknown> => {
    const safe: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(record).slice(0, 50)) {
      if (SENSITIVE_FIELD.test(key)) continue;
      const safeValue = sanitizeValue(item, depth);
      if (safeValue !== undefined) safe[key.slice(0, 100)] = safeValue;
    }
    return safe;
  };

  return sanitizeObject(value, 0);
}
