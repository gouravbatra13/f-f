import {
  redactSensitiveText,
  sanitizeEndpoint,
  sanitizeMetadata,
} from './sensitive-data-redactor.js';

describe('sensitive data redaction', () => {
  it('redacts common credentials and personal information in text', () => {
    const safe = redactSensitiveText(
      'password=hunter2 Authorization: Bearer abc123 x-api-key: ffk_live_abc email=a@example.test',
    );

    expect(safe).not.toContain('hunter2');
    expect(safe).not.toContain('abc123');
    expect(safe).not.toContain('ffk_live_abc');
    expect(safe).not.toContain('a@example.test');
    expect(redactSensitiveText('session_token=token-value')).not.toContain(
      'token-value',
    );
  });

  it('drops sensitive metadata fields and removes endpoint query strings', () => {
    expect(
      sanitizeMetadata({
        password: 'secret',
        email: 'person@example.test',
        feature: 'checkout',
        nested: { authorization: 'Bearer secret', count: 2 },
      }),
    ).toEqual({ feature: 'checkout', nested: { count: 2 } });
    expect(sanitizeEndpoint('/orders/12?access_token=secret')).toBe('/orders/12');
  });
});
