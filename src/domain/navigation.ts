const INTERNAL_ORIGIN = 'https://sked.internal';

function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/**
 * Validates and normalizes an internal post-login redirect target.
 * Rejects external origins, protocol-relative URLs (`//evil.com`), backslash tricks (`/\evil.com`),
 * control characters, and bare root redirects (`/`).
 */
export function sanitizeInternalRedirectPath(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (!trimmed || trimmed === '/') return null;

  // Must start with a single forward slash and never contain backslashes or ASCII control chars
  if (!trimmed.startsWith('/') || /^\/[/\\]/.test(trimmed)) return null;
  if (trimmed.includes('\\') || hasControlCharacter(trimmed)) return null;

  try {
    const parsed = new URL(trimmed, INTERNAL_ORIGIN);
    if (parsed.origin !== INTERNAL_ORIGIN) return null;
    const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (normalized === '/' || !normalized.startsWith('/')) return null;
    return normalized;
  } catch {
    return null;
  }
}
