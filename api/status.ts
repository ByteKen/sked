import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  buildQuotaMetricReport,
  buildStorageQuotaReport,
  computeOverallHealthLevel,
  getPacificQuotaWindow,
  SPARK_DAILY_QUOTA_LIMITS,
  SPARK_STORAGE_LIMIT_BYTES,
  type SystemStatusResponse,
} from '../src/domain/systemStatus.js';
import { verifyFirebaseBearerToken } from './_lib/firebaseAdmin.js';
import { fetchFirestoreUsageTimeSeries } from './_lib/googleMonitoring.js';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5-minute server-side cache (0 Firestore reads)
const REFRESH_COOLDOWN_MS = 15 * 1000; // Minimum 15s between forced refreshes

let cachedStatus: { payload: SystemStatusResponse; fetchedAtMs: number } | null = null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const verifiedUser = await verifyFirebaseBearerToken(req);
    if (!verifiedUser) {
      return res.status(401).json({ error: 'Unauthorized. Please sign in to view system status.' });
    }

    const forceRefresh = req.query?.refresh === '1' || req.query?.refresh === 'true';
    const nowMs = Date.now();

    if (cachedStatus) {
      const ageMs = nowMs - cachedStatus.fetchedAtMs;
      const withinTtl = ageMs < CACHE_TTL_MS;
      const withinRefreshCooldown = forceRefresh && ageMs < REFRESH_COOLDOWN_MS;
      if ((!forceRefresh && withinTtl) || withinRefreshCooldown) {
        res.setHeader('Cache-Control', 'private, max-age=60');
        return res.status(200).json({ ...cachedStatus.payload, cached: true });
      }
    }

    const window = getPacificQuotaWindow(new Date(nowMs));
    const telegramConfigured = Boolean(
      process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_BOT_USERNAME?.trim(),
    );

    let warning: string | undefined;
    let monitoringStatus: 'operational' | 'unavailable' = 'operational';
    let readsSeries = [] as Awaited<ReturnType<typeof fetchFirestoreUsageTimeSeries>>['reads'];
    let writesSeries = [] as Awaited<ReturnType<typeof fetchFirestoreUsageTimeSeries>>['writes'];
    let deletesSeries = [] as Awaited<ReturnType<typeof fetchFirestoreUsageTimeSeries>>['deletes'];
    let storageSeries = [] as Awaited<ReturnType<typeof fetchFirestoreUsageTimeSeries>>['storage'];

    try {
      const bundle = await fetchFirestoreUsageTimeSeries(window.sevenDayStartISO, window.nowISO);
      readsSeries = bundle.reads;
      writesSeries = bundle.writes;
      deletesSeries = bundle.deletes;
      storageSeries = bundle.storage;
    } catch (monitoringErr) {
      monitoringStatus = 'unavailable';
      warning =
        monitoringErr instanceof Error
          ? monitoringErr.message
          : 'Unable to reach Google Cloud Monitoring API.';
      console.error('Status endpoint Cloud Monitoring error:', monitoringErr);
    }

    const writes = buildQuotaMetricReport({
      key: 'writes',
      label: 'Writes',
      limit: SPARK_DAILY_QUOTA_LIMITS.writes,
      timeSeries: writesSeries,
      sevenDayKeys: window.sevenDayKeys,
    });
    const reads = buildQuotaMetricReport({
      key: 'reads',
      label: 'Reads',
      limit: SPARK_DAILY_QUOTA_LIMITS.reads,
      timeSeries: readsSeries,
      sevenDayKeys: window.sevenDayKeys,
    });
    const deletes = buildQuotaMetricReport({
      key: 'deletes',
      label: 'Deletes',
      limit: SPARK_DAILY_QUOTA_LIMITS.deletes,
      timeSeries: deletesSeries,
      sevenDayKeys: window.sevenDayKeys,
    });
    const storage =
      storageSeries.length > 0
        ? buildStorageQuotaReport(storageSeries, SPARK_STORAGE_LIMIT_BYTES)
        : null;

    const overallLevel = computeOverallHealthLevel([
      writes,
      reads,
      deletes,
      ...(storage ? [storage] : []),
    ]);

    const payload: SystemStatusResponse = {
      ok: true,
      plan: 'spark',
      databaseId: '(default)',
      checkedAtISO: window.nowISO,
      resetAtISO: window.nextResetISO,
      cached: false,
      overallLevel,
      metrics: { writes, reads, deletes },
      storage,
      services: {
        firestore: overallLevel === 'critical' ? 'degraded' : 'operational',
        monitoring: monitoringStatus,
        telegramBot: telegramConfigured ? 'configured' : 'unconfigured',
      },
      ...(warning ? { warning } : {}),
    };

    if (monitoringStatus === 'operational') {
      cachedStatus = { payload, fetchedAtMs: nowMs };
    }

    res.setHeader('Cache-Control', 'private, max-age=60');
    return res.status(200).json(payload);
  } catch (err) {
    console.error('System status handler error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to load system status.',
    });
  }
}
