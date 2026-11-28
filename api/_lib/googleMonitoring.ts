import type { RawMonitoringTimeSeries } from '../../src/domain/systemStatus.js';
import { getGoogleAccessToken } from './googleAuth.js';

const MONITORING_READ_SCOPE = 'https://www.googleapis.com/auth/monitoring.read';
const OUTBOUND_FETCH_TIMEOUT_MS = 8_000;

async function getMonitoringAccessToken(): Promise<{ accessToken: string; projectId: string }> {
  return getGoogleAccessToken(MONITORING_READ_SCOPE);
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
    signal: AbortSignal.timeout(OUTBOUND_FETCH_TIMEOUT_MS),
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
