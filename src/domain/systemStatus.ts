export type QuotaMetricKey = 'reads' | 'writes' | 'deletes';
export type QuotaHealthLevel = 'operational' | 'elevated' | 'critical';

export interface DailyMetricPoint {
  dateISO: string;
  label: string;
  count: number;
}

export interface QuotaMetricReport {
  key: QuotaMetricKey;
  label: string;
  usedToday: number;
  limit: number;
  percentUsed: number;
  peak7d: number;
  peak7dDateISO: string | null;
  isTodayPeak: boolean;
  level: QuotaHealthLevel;
  daily7d: DailyMetricPoint[];
}

export interface StorageQuotaReport {
  usedBytes: number;
  limitBytes: number;
  percentUsed: number;
  level: QuotaHealthLevel;
  sampledAtISO: string | null;
}

export interface SystemStatusResponse {
  ok: true;
  plan: 'spark';
  databaseId: string;
  checkedAtISO: string;
  resetAtISO: string;
  cached: boolean;
  overallLevel: QuotaHealthLevel;
  metrics: {
    writes: QuotaMetricReport;
    reads: QuotaMetricReport;
    deletes: QuotaMetricReport;
  };
  storage?: StorageQuotaReport | null;
  services: {
    firestore: 'operational' | 'degraded';
    monitoring: 'operational' | 'unavailable';
    telegramBot: 'configured' | 'unconfigured';
  };
  warning?: string;
}

export interface RawMonitoringPoint {
  interval?: {
    startTime?: string;
    endTime?: string;
  };
  value?: {
    int64Value?: string | number;
    doubleValue?: number;
  };
}

export interface RawMonitoringTimeSeries {
  points?: RawMonitoringPoint[];
}

export const SPARK_DAILY_QUOTA_LIMITS: Record<QuotaMetricKey, number> = {
  reads: 50_000,
  writes: 20_000,
  deletes: 20_000,
};

export const SPARK_STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024; // 1 GiB

const PACIFIC_TZ = 'America/Los_Angeles';
const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const pacificPartsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: PACIFIC_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

interface WallClockParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function getPacificParts(date: Date): WallClockParts {
  const parts = pacificPartsFormatter.formatToParts(date);
  const lookup = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: lookup('year'),
    month: lookup('month'),
    day: lookup('day'),
    hour: lookup('hour'),
    minute: lookup('minute'),
    second: lookup('second'),
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatPacificDateKey(date: Date): string {
  const p = getPacificParts(date);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/**
 * Resolves exact UTC instant for `00:00:00 America/Los_Angeles` on a given calendar date,
 * handling both PST (-08:00) and PDT (-07:00) DST transitions cleanly without external libs.
 */
export function pacificMidnightToUtcDate(year: number, month: number, day: number): Date {
  const targetAsUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0);
  // Start with a PST (-08:00) estimate and refine twice against Intl wall-clock parts
  let candidateMs = targetAsUtcMs + 8 * 3_600_000;
  for (let i = 0; i < 2; i++) {
    const actual = getPacificParts(new Date(candidateMs));
    const actualAsUtcMs = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const diffMs = actualAsUtcMs - targetAsUtcMs;
    if (diffMs === 0) break;
    candidateMs -= diffMs;
  }
  return new Date(candidateMs);
}

function shiftCalendarDate(
  year: number,
  month: number,
  day: number,
  deltaDays: number,
): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1, day + deltaDays, 12, 0, 0));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

export interface PacificQuotaWindow {
  todayDateKey: string;
  sevenDayKeys: string[];
  sevenDayStartISO: string;
  todayStartISO: string;
  nextResetISO: string;
  nowISO: string;
}

/**
 * Computes Firebase Spark's exact daily Pacific-Time reset boundary and 7-day rolling date keys.
 */
export function getPacificQuotaWindow(now: Date = new Date()): PacificQuotaWindow {
  const p = getPacificParts(now);
  const todayDateKey = `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
  const todayStart = pacificMidnightToUtcDate(p.year, p.month, p.day);

  const tomorrow = shiftCalendarDate(p.year, p.month, p.day, 1);
  const nextReset = pacificMidnightToUtcDate(tomorrow.year, tomorrow.month, tomorrow.day);

  const sixDaysAgo = shiftCalendarDate(p.year, p.month, p.day, -6);
  const sevenDayStart = pacificMidnightToUtcDate(
    sixDaysAgo.year,
    sixDaysAgo.month,
    sixDaysAgo.day,
  );

  const sevenDayKeys: string[] = [];
  for (let offset = -6; offset <= 0; offset++) {
    const d = shiftCalendarDate(p.year, p.month, p.day, offset);
    sevenDayKeys.push(`${d.year}-${pad2(d.month)}-${pad2(d.day)}`);
  }

  return {
    todayDateKey,
    sevenDayKeys,
    sevenDayStartISO: sevenDayStart.toISOString(),
    todayStartISO: todayStart.toISOString(),
    nextResetISO: nextReset.toISOString(),
    nowISO: now.toISOString(),
  };
}

export function classifyQuotaLevel(percentUsed: number): QuotaHealthLevel {
  if (percentUsed >= 90) return 'critical';
  if (percentUsed >= 70) return 'elevated';
  return 'operational';
}

export function computeOverallHealthLevel(
  reports: readonly { level: QuotaHealthLevel }[],
): QuotaHealthLevel {
  if (reports.some((r) => r.level === 'critical')) return 'critical';
  if (reports.some((r) => r.level === 'elevated')) return 'elevated';
  return 'operational';
}

function formatShortDateLabel(dateKey: string): string {
  const parts = dateKey.split('-');
  const monthIdx = Math.max(0, Math.min(11, Number(parts[1] ?? 1) - 1));
  const day = Number(parts[2] ?? 1);
  return `${MONTH_SHORT[monthIdx]} ${day}`;
}

function readPointNumericValue(point: RawMonitoringPoint): number {
  const raw = point.value?.int64Value ?? point.value?.doubleValue ?? 0;
  const num = typeof raw === 'string' ? Number(raw) : raw;
  return Number.isFinite(num) && num > 0 ? Math.round(num) : 0;
}

/**
 * Aggregates Cloud Monitoring hourly time series points into Pacific-Time calendar days
 * matching Firebase Console's daily quota counters and 7-day peak detection.
 */
export function buildQuotaMetricReport(params: {
  key: QuotaMetricKey;
  label: string;
  limit: number;
  timeSeries: readonly RawMonitoringTimeSeries[];
  sevenDayKeys: readonly string[];
}): QuotaMetricReport {
  const { key, label, limit, timeSeries, sevenDayKeys } = params;
  const totalsByDay = new Map<string, number>();
  for (const dayKey of sevenDayKeys) {
    totalsByDay.set(dayKey, 0);
  }

  for (const series of timeSeries) {
    for (const point of series.points ?? []) {
      const count = readPointNumericValue(point);
      if (count <= 0) continue;

      // Attribute each hourly interval using startTime (or endTime - 1s) so 23:00-00:00 stays on the day that ended
      let sampleDate: Date | null = null;
      if (point.interval?.startTime) {
        const ms = Date.parse(point.interval.startTime);
        if (Number.isFinite(ms)) sampleDate = new Date(ms);
      } else if (point.interval?.endTime) {
        const ms = Date.parse(point.interval.endTime);
        if (Number.isFinite(ms)) sampleDate = new Date(ms - 1_000);
      }
      if (!sampleDate) continue;

      const dayKey = formatPacificDateKey(sampleDate);
      if (totalsByDay.has(dayKey)) {
        totalsByDay.set(dayKey, (totalsByDay.get(dayKey) ?? 0) + count);
      }
    }
  }

  const daily7d: DailyMetricPoint[] = sevenDayKeys.map((dateISO) => ({
    dateISO,
    label: formatShortDateLabel(dateISO),
    count: totalsByDay.get(dateISO) ?? 0,
  }));

  const todayKey = sevenDayKeys[sevenDayKeys.length - 1] ?? '';
  const usedToday = totalsByDay.get(todayKey) ?? 0;
  const percentUsed = limit > 0 ? Number(((usedToday / limit) * 100).toFixed(1)) : 0;

  let peak7d = 0;
  let peak7dDateISO: string | null = null;
  for (const day of daily7d) {
    if (day.count > peak7d || (day.count === peak7d && day.count > 0)) {
      peak7d = day.count;
      peak7dDateISO = day.dateISO;
    }
  }

  const isTodayPeak = usedToday > 0 && usedToday >= peak7d;

  return {
    key,
    label,
    usedToday,
    limit,
    percentUsed,
    peak7d,
    peak7dDateISO,
    isTodayPeak,
    level: classifyQuotaLevel(percentUsed),
    daily7d,
  };
}

/**
 * Extracts the latest database + index storage gauge reading (in bytes) from Cloud Monitoring.
 * Uses the newest sample timestamp rather than summing points, since storage is a GAUGE metric.
 */
export function buildStorageQuotaReport(
  timeSeries: readonly RawMonitoringTimeSeries[],
  limitBytes: number = SPARK_STORAGE_LIMIT_BYTES,
): StorageQuotaReport {
  let latestMs = -1;
  let usedBytes = 0;
  let sampledAtISO: string | null = null;

  for (const series of timeSeries) {
    for (const point of series.points ?? []) {
      const value = readPointNumericValue(point);
      const rawTime = point.interval?.endTime ?? point.interval?.startTime;
      const ms = rawTime ? Date.parse(rawTime) : 0;
      if (Number.isFinite(ms) && ms >= latestMs) {
        latestMs = ms;
        usedBytes = value;
        sampledAtISO = rawTime ?? null;
      }
    }
  }

  const percentUsed =
    limitBytes > 0 ? Number(((usedBytes / limitBytes) * 100).toFixed(2)) : 0;

  return {
    usedBytes,
    limitBytes,
    percentUsed,
    level: classifyQuotaLevel(percentUsed),
    sampledAtISO,
  };
}

export function formatStorageBytes(bytes: number): string {
  const safe = Math.max(0, bytes);
  const KiB = 1024;
  const MiB = KiB * 1024;
  const GiB = MiB * 1024;
  if (safe >= GiB) return `${(safe / GiB).toFixed(2)} GiB`;
  if (safe >= MiB) return `${(safe / MiB).toFixed(2)} MiB`;
  if (safe >= KiB) return `${(safe / KiB).toFixed(1)} KiB`;
  return `${Math.round(safe)} B`;
}

export function formatStoragePercent(percentUsed: number, usedBytes: number): string {
  if (usedBytes > 0 && percentUsed < 0.1) return '< 0.1%';
  return `${Number(percentUsed.toFixed(1))}%`;
}

export function formatQuotaLimitShort(limit: number): string {
  if (limit >= 1_000_000) return `${(limit / 1_000_000).toFixed(limit % 1_000_000 === 0 ? 0 : 1)}M`;
  if (limit >= 1_000) return `${(limit / 1_000).toFixed(limit % 1_000 === 0 ? 0 : 1)}K`;
  return String(limit);
}

export function formatResetCountdown(resetAtISO: string, nowMs: number = Date.now()): string {
  const resetMs = Date.parse(resetAtISO);
  if (!Number.isFinite(resetMs)) return '—';
  const remainingMs = Math.max(0, resetMs - nowMs);
  const totalMinutes = Math.ceil(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}
