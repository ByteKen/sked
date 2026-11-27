import { afterEach, describe, expect, it, vi } from 'vitest';

const mockGetIdToken = vi.fn(async () => 'mock-id-token');

vi.mock('@/config/firebase', () => ({
  auth: {
    currentUser: {
      getIdToken: () => mockGetIdToken(),
    },
  },
}));

import { fetchSystemStatus } from '@/services/statusService';

describe('fetchSystemStatus response guards', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('rejects cleanly when the server returns 200 OK HTML (Vite SPA fallback) instead of JSON', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response('<!doctype html><html><body>Sked</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
    ) as typeof fetch;

    await expect(fetchSystemStatus()).rejects.toThrow(/not responding with JSON/i);
  });

  it('rejects cleanly when JSON lacks expected quota fields', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    ) as typeof fetch;

    await expect(fetchSystemStatus()).rejects.toThrow(/unexpected response format/i);
  });
});
