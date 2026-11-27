import { createSign } from 'node:crypto';
import type { RawMonitoringTimeSeries } from '../../src/domain/systemStatus.js';
import { getServiceAccountCredentials } from './firebaseAdmin.js';

const GOOGLE_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const MONITORING_READ_SCOPE = 'https://www.googleapis.com/auth/monitoring.read';

let cachedToken: { accessToken: string; expiresAtMs: number } | null = null;

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

function createServiceAccountJwt(clientEmail: string, privateKey: string): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claimSet = base64UrlEncode(
    JSON.stringify({
      iss: clientEmail,
      scope: MONITORING_READ_SCOPE,
      aud: GOOGLE_TOKEN_URI,
      iat: nowSec,
      exp: nowSec + 3600,
    }),
  );

  const unsigned = `${header}.${claimSet}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(privateKey, 'base64url');
  return `${unsigned}.${signature}`;
}

async function getMonitoringAccessToken(): Promise<{ accessToken: string; projectId: string }> {
  const creds = getServiceAccountCredentials();
  const nowMs = Date.now();
  if (cachedToken && cachedToken.expiresAtMs - 60_000 > nowMs) {
    return { accessToken: cachedToken.accessToken, projectId: creds.projectId };
  }

  const assertion = createServiceAccountJwt(creds.clientEmail, creds.privateKey);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const resp = await fetch(GOOGLE_TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const json = (await resp.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!resp.ok || !json.access_token) {
    throw new Error(
      json.error_description ||
        json.error ||
        `Failed to obtain Google Cloud Monitoring token (HTTP ${resp.status}).`,
    );
  }

  const ttlSec = typeof json.expires_in === 'number' ? json.expires_in : 3600;
  cachedToken = {
    accessToken: json.access_token,
    expiresAtMs: nowMs + ttlSec * 1000,
  };

  return { accessToken: json.access_token, projectId: creds.projectId };
}

interface MonitoringListResponse {
  timeSeries?: RawMonitoringTimeSeries[];
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

async function queryTimeSeries(params: {
  projectId: string;
  accessToken: string;
  metricType: string;
  startTimeISO: string;
  endTimeISO: string;
  perSeriesAligner?: 'ALIGN_SUM' | 'ALIGN_MAX' | 'ALIGN_MEAN';
}): Promise<RawMonitoringTimeSeries[]> {
  const {
    projectId,
    accessToken,
    metricType,
    startTimeISO,
    endTimeISO,
    perSeriesAligner = 'ALIGN_SUM',
  } = params;
  const query = new URLSearchParams({
    filter: `metric.type="${metricType}"`,
    'interval.startTime': startTimeISO,
    'interval.endTime': endTimeISO,
    'aggregation.alignmentPeriod': '3600s',
    'aggregation.perSeriesAligner': perSeriesAligner,
    'aggregation.crossSeriesReducer': 'REDUCE_SUM',
    view: 'FULL',
  });

  const url = `https://monitoring.googleapis.com/v3/projects/${encodeURIComponent(projectId)}/timeSeries?${query.toString()}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  const data = (await resp.json().catch(() => ({}))) as MonitoringListResponse;

  if (!resp.ok) {
    const errMsg = data.error?.message || `Cloud Monitoring API error (HTTP ${resp.status})`;
    if (resp.status === 403) {
      throw new Error(
        `Cloud Monitoring permission denied: ensure the Firebase Admin service account has the "Monitoring Viewer" IAM role (${errMsg}).`,
      );
    }
    throw new Error(errMsg);
  }

  return Array.isArray(data.timeSeries) ? data.timeSeries : [];
}

async function queryMetricWithFallback(params: {
  projectId: string;
  accessToken: string;
  primaryMetric: string;
  fallbackMetric: string;
  startTimeISO: string;
  endTimeISO: string;
}): Promise<RawMonitoringTimeSeries[]> {
  try {
    const primary = await queryTimeSeries({
      projectId: params.projectId,
      accessToken: params.accessToken,
      metricType: params.primaryMetric,
      startTimeISO: params.startTimeISO,
      endTimeISO: params.endTimeISO,
    });
    if (primary.length > 0) return primary;
  } catch (err) {
    // Re-throw permission/auth errors immediately instead of masking them behind fallback
    const message = err instanceof Error ? err.message : '';
    if (message.includes('permission denied') || message.includes('token')) {
      throw err;
    }
  }

  return queryTimeSeries({
    projectId: params.projectId,
    accessToken: params.accessToken,
    metricType: params.fallbackMetric,
    startTimeISO: params.startTimeISO,
    endTimeISO: params.endTimeISO,
  });
}

export interface FirestoreUsageTimeSeriesBundle {
  reads: RawMonitoringTimeSeries[];
  writes: RawMonitoringTimeSeries[];
  deletes: RawMonitoringTimeSeries[];
  storage: RawMonitoringTimeSeries[];
}

/**
 * Fetches hourly Cloud Firestore Reads, Writes, Deletes, and Storage gauge time series
 * from Google Cloud Monitoring. Queries modern `*_ops_count` metrics with fallback to `*_count`.
 */
export async function fetchFirestoreUsageTimeSeries(
  startTimeISO: string,
  endTimeISO: string,
): Promise<FirestoreUsageTimeSeriesBundle> {
  const { accessToken, projectId } = await getMonitoringAccessToken();

  const [reads, writes, deletes, storage] = await Promise.all([
    queryMetricWithFallback({
      projectId,
      accessToken,
      primaryMetric: 'firestore.googleapis.com/document/read_ops_count',
      fallbackMetric: 'firestore.googleapis.com/document/read_count',
      startTimeISO,
      endTimeISO,
    }),
    queryMetricWithFallback({
      projectId,
      accessToken,
      primaryMetric: 'firestore.googleapis.com/document/write_ops_count',
      fallbackMetric: 'firestore.googleapis.com/document/write_count',
      startTimeISO,
      endTimeISO,
    }),
    queryMetricWithFallback({
      projectId,
      accessToken,
      primaryMetric: 'firestore.googleapis.com/document/delete_ops_count',
      fallbackMetric: 'firestore.googleapis.com/document/delete_count',
      startTimeISO,
      endTimeISO,
    }),
    queryTimeSeries({
      projectId,
      accessToken,
      metricType: 'firestore.googleapis.com/storage/data_and_index_storage_bytes',
      startTimeISO,
      endTimeISO,
      perSeriesAligner: 'ALIGN_MAX',
    }).catch(() => [] as RawMonitoringTimeSeries[]),
  ]);

  return { reads, writes, deletes, storage };
}
