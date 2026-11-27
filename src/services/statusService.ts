import { auth } from '@/config/firebase';
import type { SystemStatusResponse } from '@/domain/systemStatus';

interface ApiErrorBody {
  error?: string;
}

function isValidSystemStatusResponse(value: unknown): value is SystemStatusResponse {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<SystemStatusResponse>;
  return (
    v.ok === true &&
    Boolean(v.metrics?.writes) &&
    Boolean(v.metrics?.reads) &&
    Boolean(v.metrics?.deletes) &&
    Boolean(v.services)
  );
}

export async function fetchSystemStatus(options?: {
  forceRefresh?: boolean;
}): Promise<SystemStatusResponse> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('You must be signed in to view system status.');
  }

  const idToken = await user.getIdToken();
  const query = options?.forceRefresh ? '?refresh=1' : '';
  const response = await fetch(`/api/status${query}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
      Accept: 'application/json',
    },
  });

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(
      'Status API is not responding with JSON on this server. Restart the dev server or deploy to Vercel to load live Cloud Firestore quotas.',
    );
  }

  const data = (await response.json().catch(() => null)) as
    | (SystemStatusResponse & ApiErrorBody)
    | null;

  if (!response.ok) {
    throw new Error(
      data?.error ||
        (response.status === 404
          ? 'Status API endpoint was not found. Deploy to Vercel (or run `vercel dev`) to inspect live Cloud Firestore quotas.'
          : `Failed to fetch system status (HTTP ${response.status})`),
    );
  }

  if (!isValidSystemStatusResponse(data)) {
    throw new Error('Received an unexpected response format from the Status API.');
  }

  return data;
}
