import { createErrorFingerprint } from './error-fingerprint.js';

describe('createErrorFingerprint', () => {
  it('is deterministic and normalizes variable identifiers and stack line numbers', () => {
    const first = createErrorFingerprint(
      'Order 123456 failed',
      'at processOrder (C:\\app\\src\\orders.ts:48:12)',
    );
    const second = createErrorFingerprint(
      'Order 987654 failed',
      'at processOrder (/srv/app/src/orders.ts:103:4)',
    );

    expect(second).toBe(first);
    expect(createErrorFingerprint('Order 123456 failed', 'at processOrder (C:\\app\\src\\orders.ts:48:12)')).toBe(first);
    expect(
      createErrorFingerprint(
        'Order 123456 failed while saving',
        'at save (src/orders.ts:20:4)',
      ),
    ).toBe(
      createErrorFingerprint(
        'Order 987654 failed while saving',
        'at save (/srv/app/src/orders.ts:91:12)',
      ),
    );
  });

  it('distinguishes different messages, stack frames, and handles absent stacks', () => {
    const base = createErrorFingerprint('Request failed', 'at save (src/a.ts:10:2)');
    expect(createErrorFingerprint('Request timed out', 'at save (src/a.ts:10:2)')).not.toBe(base);
    expect(createErrorFingerprint('Request failed', 'at load (src/a.ts:10:2)')).not.toBe(base);
    expect(createErrorFingerprint('Request failed')).toBe(
      createErrorFingerprint('Request failed', undefined),
    );
    expect(createErrorFingerprint('Request failed')).not.toBe(base);
  });

  it('does not include credentials in its fingerprint input', () => {
    expect(
      createErrorFingerprint('Authorization: Bearer secret-a'),
    ).toBe(createErrorFingerprint('Authorization: Bearer secret-b'));
  });
});
