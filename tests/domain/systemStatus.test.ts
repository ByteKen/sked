import { describe, expect, it } from 'vitest';
import {
  buildQuotaMetricReport,
  buildStorageQuotaReport,
  classifyQuotaLevel,
  computeOverallHealthLevel,
  formatQuotaLimitShort,
  formatResetCountdown,
  formatStorageBytes,
  formatStoragePercent,
  getPacificQuotaWindow,
  pacificMidnightToUtcDate,
  SPARK_DAILY_QUOTA_LIMITS,
  SPARK_STORAGE_LIMIT_BYTES,
} from '@/domain/systemStatus';

describe('systemStatus domain helpers', () => {
  it('computes exact Pacific-Time midnight boundaries across both PST (-08:00) and PDT (-07:00)', () => {
    // November 27, 2026 is PST (UTC-8), so 00:00:00 PT = 08:00:00Z
    expect(pacificMidnightToUtcDate(2026, 11, 27).toISOString()).toBe('2026-11-27T08:00:00.000Z');
    // July 15, 2026 is PDT (UTC-7), so 00:00:00 PT = 07:00:00Z
    expect(pacificMidnightToUtcDate(2026, 7, 15).toISOString()).toBe('2026-07-15T07:00:00.000Z');

    const window = getPacificQuotaWindow(new Date('2026-11-27T10:30:00.000Z'));
    expect(window.todayDateKey).toBe('2026-11-27');
    expect(window.sevenDayKeys).toHaveLength(7);
    expect(window.sevenDayKeys[0]).toBe('2026-11-21');
    expect(window.sevenDayKeys[6]).toBe('2026-11-27');
    expect(window.todayStartISO).toBe('2026-11-27T08:00:00.000Z');
    expect(window.nextResetISO).toBe('2026-11-28T08:00:00.000Z');
  });

  it('buckets hourly Cloud Monitoring points into exact Pacific calendar days and computes 7-day peak', () => {
    const window = getPacificQuotaWindow(new Date('2026-11-27T18:00:00.000Z'));
    const report = buildQuotaMetricReport({
      key: 'writes',
      label: 'Writes',
      limit: SPARK_DAILY_QUOTA_LIMITS.writes,
      sevenDayKeys: window.sevenDayKeys,
      timeSeries: [
        {
          points: [
            // 23:00-00:00 PT on Nov 26 (UTC 07:00-08:00 on Nov 27) MUST stay on Nov 26!
            {
              interval: {
                startTime: '2026-11-27T07:00:00Z',
                endTime: '2026-11-27T08:00:00Z',
              },
              value: { int64Value: '200' },
            },
            // Nov 27 morning PT
            {
              interval: {
                startTime: '2026-11-27T09:00:00Z',
                endTime: '2026-11-27T10:00:00Z',
              },
              value: { int64Value: '300' },
            },
            {
              interval: {
                startTime: '2026-11-27T12:00:00Z',
                endTime: '2026-11-27T13:00:00Z',
              },
              value: { int64Value: '165' },
            },
          ],
        },
      ],
    });

    expect(report.usedToday).toBe(465);
    expect(report.percentUsed).toBe(2.3);
    expect(report.peak7d).toBe(465);
    expect(report.peak7dDateISO).toBe('2026-11-27');
    expect(report.isTodayPeak).toBe(true);
    expect(report.level).toBe('operational');
    // Nov 26 bucket received the 23:00-00:00 PT hour cleanly
    expect(report.daily7d[5]!.dateISO).toBe('2026-11-26');
    expect(report.daily7d[5]!.count).toBe(200);
    expect(report.daily7d[6]!.dateISO).toBe('2026-11-27');
    expect(report.daily7d[6]!.count).toBe(465);
  });

  it('classifies quota health levels, overall severity, compact caps, and reset countdowns', () => {
    expect(classifyQuotaLevel(2.3)).toBe('operational');
    expect(classifyQuotaLevel(75)).toBe('elevated');
    expect(classifyQuotaLevel(92.5)).toBe('critical');

    const base = {
      key: 'reads' as const,
      label: 'Reads',
      usedToday: 0,
      limit: 50_000,
      percentUsed: 0,
      peak7d: 0,
      peak7dDateISO: null,
      isTodayPeak: false,
      daily7d: [],
    };
    expect(computeOverallHealthLevel([{ ...base, level: 'operational' }])).toBe('operational');
    expect(
      computeOverallHealthLevel([
        { ...base, level: 'operational' },
        { ...base, level: 'elevated' },
      ]),
    ).toBe('elevated');
    expect(
      computeOverallHealthLevel([
        { ...base, level: 'elevated' },
        { ...base, level: 'critical' },
      ]),
    ).toBe('critical');

    expect(formatQuotaLimitShort(50_000)).toBe('50K');
    expect(formatQuotaLimitShort(20_000)).toBe('20K');
    expect(
      formatResetCountdown('2026-11-28T08:00:00.000Z', Date.parse('2026-11-28T02:45:00.000Z')),
    ).toBe('5h 15m');
  });

  it('extracts the latest storage gauge sample in bytes without summing snapshots and formats human-readable units', () => {
    const report = buildStorageQuotaReport(
      [
        {
          points: [
            {
              interval: { endTime: '2026-11-27T08:00:00Z' },
              value: { int64Value: '104635' }, // 102.18 KiB (newest)
            },
            {
              interval: { endTime: '2026-11-26T08:00:00Z' },
              value: { int64Value: '98000' }, // older snapshot — must NOT be summed
            },
          ],
        },
      ],
      SPARK_STORAGE_LIMIT_BYTES,
    );

    expect(report.usedBytes).toBe(104_635);
    expect(report.percentUsed).toBe(0.01);
    expect(report.level).toBe('operational');
    expect(formatStorageBytes(report.usedBytes)).toBe('102.2 KiB');
    expect(formatStorageBytes(5 * 1024 * 1024)).toBe('5.00 MiB');
    expect(formatStorageBytes(SPARK_STORAGE_LIMIT_BYTES)).toBe('1.00 GiB');
    expect(formatStoragePercent(report.percentUsed, report.usedBytes)).toBe('< 0.1%');
    expect(formatStoragePercent(12.4, 130_000_000)).toBe('12.4%');
  });
});
