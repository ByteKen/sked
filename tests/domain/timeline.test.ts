import { describe, expect, it } from 'vitest';
import {
  buildTimelineColumns,
  calculateTaskBarGeometry,
  calculateTimelineRange,
  clampTimelineZoom,
  computeAnchoredScrollLeft,
  computeWheelZoom,
  daysBetween,
  getPixelsPerDay,
  getWeekNumber,
  isLeapYear,
  MAX_TIMELINE_ZOOM,
  MIN_TIMELINE_ZOOM,
  parseISODate,
} from '@/domain/timeline';
import type { TimelineGranularity } from '@/types';

describe('timeline domain math', () => {
  it('parses ISO dates at local midnight without UTC drift', () => {
    const d = parseISODate('2026-03-15');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(0);
  });

  it('handles leap years and ISO week numbers accurately', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(getWeekNumber(parseISODate('2026-01-01'))).toBe(1);
  });

  it('keeps column widths mathematically locked to days * pixelsPerDay across all granularities', () => {
    const tasks = [{ start: '2026-01-05', end: '2026-02-20' }];
    const granularities: TimelineGranularity[] = ['days', 'weeks', 'months', 'quarters', 'years'];

    for (const gran of granularities) {
      const range = calculateTimelineRange(tasks, gran);
      const ppd = getPixelsPerDay(gran, 1);
      const columns = buildTimelineColumns(range.startDate, range.days, gran, ppd);

      expect(columns.length).toBeGreaterThan(0);
      let expectedLeft = 0;
      for (const col of columns) {
        expect(col.widthPx).toBeCloseTo(col.days * ppd, 5);
        expect(col.leftPx).toBeCloseTo(expectedLeft, 5);
        expectedLeft += col.widthPx;
      }
    }
  });

  it('computes accurate task bar geometry from timeline start', () => {
    const timelineStart = parseISODate('2026-01-01');
    const ppd = 40;
    const geom = calculateTaskBarGeometry(
      { start: '2026-01-06', end: '2026-01-10' },
      timelineStart,
      ppd,
    );

    expect(daysBetween(timelineStart, parseISODate('2026-01-06'))).toBe(5);
    expect(geom.durationDays).toBe(5);
    expect(geom.left).toBe(200);
    expect(geom.width).toBe(200);
  });

  it('computes smooth clamped wheel zoom and preserves anchor scroll position', () => {
    const zoomedIn = computeWheelZoom(1, -100);
    expect(zoomedIn).toBeGreaterThan(1);
    expect(zoomedIn).toBeLessThanOrEqual(MAX_TIMELINE_ZOOM);

    const zoomedOut = computeWheelZoom(1, 100);
    expect(zoomedOut).toBeLessThan(1);
    expect(zoomedOut).toBeGreaterThanOrEqual(MIN_TIMELINE_ZOOM);

    expect(clampTimelineZoom(99)).toBe(MAX_TIMELINE_ZOOM);
    expect(clampTimelineZoom(0.01)).toBe(MIN_TIMELINE_ZOOM);

    // Date at contentX = 400 + 200 = 600 at 1x moves to 1200 at 2x -> scrollLeft = 1000 keeps it at 200px
    expect(
      computeAnchoredScrollLeft({
        prevScrollLeft: 400,
        prevZoom: 1,
        nextZoom: 2,
        anchorOffsetPx: 200,
      }),
    ).toBe(1000);
  });
});
