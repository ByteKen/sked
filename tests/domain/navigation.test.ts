import { describe, expect, it } from 'vitest';
import { sanitizeInternalRedirectPath } from '@/domain/navigation';

describe('sanitizeInternalRedirectPath', () => {
  it('allows valid internal paths including query strings and hashes', () => {
    expect(sanitizeInternalRedirectPath('/workspace/ws_123')).toBe('/workspace/ws_123');
    expect(sanitizeInternalRedirectPath('/share/AbCd1234?action=duplicate')).toBe(
      '/share/AbCd1234?action=duplicate',
    );
    expect(sanitizeInternalRedirectPath('/status')).toBe('/status');
    expect(sanitizeInternalRedirectPath('  /workspace/ws_1#details  ')).toBe('/workspace/ws_1#details');
  });

  it('rejects empty, root, protocol-relative, backslash, external, and control-char targets', () => {
    expect(sanitizeInternalRedirectPath(null)).toBeNull();
    expect(sanitizeInternalRedirectPath(undefined)).toBeNull();
    expect(sanitizeInternalRedirectPath('')).toBeNull();
    expect(sanitizeInternalRedirectPath('/')).toBeNull();
    expect(sanitizeInternalRedirectPath('//evil.com')).toBeNull();
    expect(sanitizeInternalRedirectPath('///evil.com')).toBeNull();
    expect(sanitizeInternalRedirectPath('/\\evil.com')).toBeNull();
    expect(sanitizeInternalRedirectPath('/workspace\\evil')).toBeNull();
    expect(sanitizeInternalRedirectPath('https://evil.com/phish')).toBeNull();
    expect(sanitizeInternalRedirectPath('javascript:alert(1)')).toBeNull();
    expect(sanitizeInternalRedirectPath('workspace/ws_1')).toBeNull();
    expect(sanitizeInternalRedirectPath('/workspace/ws_1\r\nHeader: bad')).toBeNull();
  });
});
