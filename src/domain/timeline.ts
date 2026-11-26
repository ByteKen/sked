import type { FlatTask, Task, TimelineGranularity } from '@/types';

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface TimelineRange {
  startDate: Date;
  endDate: Date;
  startTimestamp: number;
  endTimestamp: number;
  days: number;
}

export interface TimelineColumn {
  key: string;
  date: Date;
  days: number;
  leftPx: number;
  widthPx: number;
  label: string;
  subLabel: string;
  isWeekend: boolean;
  isCurrent: boolean;
}

export interface TaskBarGeometry {
  left: number;
  width: number;
  durationDays: number;
}

/**
 * Parse an ISO YYYY-MM-DD date string into local midnight cleanly,
 * avoiding UTC off-by-one shifts across timezones.
 */
export function parseISODate(dateStr: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr.trim());
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    return new Date(year, month, day, 0, 0, 0, 0);
  }
  const parsed = new Date(dateStr);
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

export function getTodayLocal(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

export function formatShortDate(dateOrStr: Date | string): string {
  const date = typeof dateOrStr === 'string' ? parseISODate(dateStrSafe(dateOrStr)) : dateOrStr;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatFullDate(dateOrStr: Date | string): string {
  const date = typeof dateOrStr === 'string' ? parseISODate(dateStrSafe(dateOrStr)) : dateOrStr;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function dateStrSafe(value: string): string {
  return value || new Date().toISOString().slice(0, 10);
}

export function formatDateRange(startStr: string, endStr: string): string {
  const start = parseISODate(startStr);
  const end = parseISODate(endStr);
  if (start.getTime() === end.getTime()) {
    return formatShortDate(start);
  }
  return `${formatShortDate(start)} – ${formatShortDate(end)}`;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function getWeekNumber(date: Date): number {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil(((utc.getTime() - yearStart.getTime()) / MS_PER_DAY + 1) / 7);
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function daysBetween(start: Date, end: Date): number {
  const utcStart = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const utcEnd = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((utcEnd - utcStart) / MS_PER_DAY);
}

export function detectOptimalGranularity(totalDays: number): TimelineGranularity {
  if (totalDays <= 21) return 'days';
  if (totalDays <= 90) return 'weeks';
  if (totalDays <= 365) return 'months';
  if (totalDays <= 730) return 'quarters';
  return 'years';
}

/**
 * Calculate timeline boundaries aligned cleanly to granularity units.
 */
export function calculateTimelineRange(
  flatTasks: readonly Pick<Task, 'start' | 'end'>[],
  granularity: TimelineGranularity,
): TimelineRange {
  const today = getTodayLocal();
  let minDate: Date;
  let maxDate: Date;

  if (flatTasks.length === 0) {
    minDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
    maxDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30);
  } else {
    const timestamps: number[] = [];
    for (const task of flatTasks) {
      timestamps.push(parseISODate(task.start).getTime(), parseISODate(task.end).getTime());
    }
    minDate = new Date(Math.min(...timestamps));
    maxDate = new Date(Math.max(...timestamps));
  }

  let alignedStart: Date;
  let alignedEnd: Date;

  switch (granularity) {
    case 'days': {
      alignedStart = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate() - 5);
      alignedEnd = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate() + 14);
      break;
    }
    case 'weeks': {
      // Align start to Monday of the previous week
      const dayOfWeek = minDate.getDay() || 7;
      alignedStart = new Date(
        minDate.getFullYear(),
        minDate.getMonth(),
        minDate.getDate() - (dayOfWeek - 1) - 7,
      );
      const endDayOfWeek = maxDate.getDay() || 7;
      alignedEnd = new Date(
        maxDate.getFullYear(),
        maxDate.getMonth(),
        maxDate.getDate() + (7 - endDayOfWeek) + 14,
      );
      break;
    }
    case 'months': {
      alignedStart = new Date(minDate.getFullYear(), minDate.getMonth() - 1, 1);
      alignedEnd = new Date(maxDate.getFullYear(), maxDate.getMonth() + 2, 0);
      break;
    }
    case 'quarters': {
      const startQuarter = Math.floor(minDate.getMonth() / 3);
      alignedStart = new Date(minDate.getFullYear(), startQuarter * 3 - 3, 1);
      const endQuarter = Math.floor(maxDate.getMonth() / 3);
      alignedEnd = new Date(maxDate.getFullYear(), (endQuarter + 2) * 3, 0);
      break;
    }
    case 'years': {
      alignedStart = new Date(minDate.getFullYear() - 1, 0, 1);
      alignedEnd = new Date(maxDate.getFullYear() + 2, 11, 31);
      break;
    }
  }

  const days = Math.max(14, daysBetween(alignedStart, alignedEnd) + 1);

  return {
    startDate: alignedStart,
    endDate: alignedEnd,
    startTimestamp: alignedStart.getTime(),
    endTimestamp: alignedEnd.getTime(),
    days,
  };
}

/**
 * Single mathematical pixel-per-day scale shared by headers, gridlines, bars, and exporters.
 */
export function getPixelsPerDay(granularity: TimelineGranularity, zoom: number): number {
  switch (granularity) {
    case 'days':
      return 40 * zoom;
    case 'weeks':
      return 14 * zoom; // 7 days = 98px at 100% zoom
    case 'months':
      return 4.8 * zoom; // ~30 days = 144px at 100% zoom
    case 'quarters':
      return 2.4 * zoom; // ~90 days = 216px at 100% zoom
    case 'years':
      return 0.75 * zoom; // 365 days = 274px at 100% zoom
  }
}

export function getDisplayDays(
  rangeDays: number,
  granularity: TimelineGranularity,
  zoom: number,
): number {
  const minDaysByGranularity: Record<TimelineGranularity, number> = {
    days: 45,
    weeks: 112,
    months: 365,
    quarters: 730,
    years: 1460,
  };
  const zoomBufferFactor = zoom < 1 ? 1 / zoom : 1;
  return Math.ceil(Math.max(rangeDays, minDaysByGranularity[granularity]) * zoomBufferFactor);
}

/**
 * Build exact calendar-aligned columns whose widths equal `column.days * pixelsPerDay`,
 * guaranteeing zero drift between headers, gridlines, and task bars.
 */
export function buildTimelineColumns(
  startDate: Date,
  displayDays: number,
  granularity: TimelineGranularity,
  pixelsPerDay: number,
  today: Date = getTodayLocal(),
): TimelineColumn[] {
  const columns: TimelineColumn[] = [];
  let cursorDays = 0;
  let leftPx = 0;

  if (granularity === 'days') {
    for (let i = 0; i < displayDays; i++) {
      const date = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
      const dayOfWeek = date.getDay();
      const widthPx = pixelsPerDay;
      columns.push({
        key: `day-${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
        date,
        days: 1,
        leftPx,
        widthPx,
        label: date.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2),
        subLabel: String(date.getDate()),
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        isCurrent: isSameLocalDay(date, today),
      });
      leftPx += widthPx;
    }
    return columns;
  }

  if (granularity === 'weeks') {
    const numWeeks = Math.ceil(displayDays / 7);
    const todayWeek = getWeekNumber(today);
    for (let i = 0; i < numWeeks; i++) {
      const date = new Date(
        startDate.getFullYear(),
        startDate.getMonth(),
        startDate.getDate() + i * 7,
      );
      const weekNum = getWeekNumber(date);
      const widthPx = 7 * pixelsPerDay;
      const weekEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 6);
      const isCurrent =
        (today >= date && today <= weekEnd) ||
        (weekNum === todayWeek && date.getFullYear() === today.getFullYear());

      columns.push({
        key: `week-${date.getFullYear()}-${i}`,
        date,
        days: 7,
        leftPx,
        widthPx,
        label: `W${weekNum}`,
        subLabel: formatShortDate(date),
        isWeekend: false,
        isCurrent,
      });
      leftPx += widthPx;
    }
    return columns;
  }

  if (granularity === 'months') {
    let year = startDate.getFullYear();
    let month = startDate.getMonth();
    while (cursorDays < displayDays) {
      const date = new Date(year, month, 1);
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const widthPx = daysInMonth * pixelsPerDay;
      columns.push({
        key: `month-${year}-${month}`,
        date,
        days: daysInMonth,
        leftPx,
        widthPx,
        label: date.toLocaleDateString('en-US', { month: 'short' }),
        subLabel: String(year),
        isWeekend: false,
        isCurrent: month === today.getMonth() && year === today.getFullYear(),
      });
      cursorDays += daysInMonth;
      leftPx += widthPx;
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
    }
    return columns;
  }

  if (granularity === 'quarters') {
    let year = startDate.getFullYear();
    let quarter = Math.floor(startDate.getMonth() / 3);
    const todayQuarter = Math.floor(today.getMonth() / 3);
    while (cursorDays < displayDays) {
      const startMonth = quarter * 3;
      const date = new Date(year, startMonth, 1);
      const endOfQuarter = new Date(year, startMonth + 3, 0);
      const daysInQuarter = daysBetween(date, endOfQuarter) + 1;
      const widthPx = daysInQuarter * pixelsPerDay;
      columns.push({
        key: `quarter-${year}-Q${quarter + 1}`,
        date,
        days: daysInQuarter,
        leftPx,
        widthPx,
        label: `Q${quarter + 1}`,
        subLabel: String(year),
        isWeekend: false,
        isCurrent: quarter === todayQuarter && year === today.getFullYear(),
      });
      cursorDays += daysInQuarter;
      leftPx += widthPx;
      quarter += 1;
      if (quarter > 3) {
        quarter = 0;
        year += 1;
      }
    }
    return columns;
  }

  // Years
  let year = startDate.getFullYear();
  while (cursorDays < displayDays) {
    const date = new Date(year, 0, 1);
    const daysInYear = isLeapYear(year) ? 366 : 365;
    const widthPx = daysInYear * pixelsPerDay;
    columns.push({
      key: `year-${year}`,
      date,
      days: daysInYear,
      leftPx,
      widthPx,
      label: String(year),
      subLabel: '',
      isWeekend: false,
      isCurrent: year === today.getFullYear(),
    });
    cursorDays += daysInYear;
    leftPx += widthPx;
    year += 1;
  }
  return columns;
}

export function calculateTaskBarGeometry(
  task: Pick<Task, 'start' | 'end'>,
  timelineStart: Date,
  pixelsPerDay: number,
  minWidthPx = 24,
): TaskBarGeometry {
  const start = parseISODate(task.start);
  const end = parseISODate(task.end);
  const offsetDays = daysBetween(timelineStart, start);
  const durationDays = Math.max(1, daysBetween(start, end) + 1);

  return {
    left: offsetDays * pixelsPerDay,
    width: Math.max(minWidthPx, durationDays * pixelsPerDay),
    durationDays,
  };
}

export function calculateTodayOffsetPx(
  timelineStart: Date,
  pixelsPerDay: number,
  today: Date = getTodayLocal(),
): number {
  const offsetDays = daysBetween(timelineStart, today);
  return offsetDays * pixelsPerDay + pixelsPerDay / 2;
}

export function calculateAutoFitZoom(
  flatTasks: readonly FlatTask[],
  availableWidthPx: number,
  granularity: TimelineGranularity,
): number {
  if (flatTasks.length === 0 || availableWidthPx <= 0) return 1;
  const timestamps = flatTasks.flatMap((t) => [
    parseISODate(t.start).getTime(),
    parseISODate(t.end).getTime(),
  ]);
  const earliest = new Date(Math.min(...timestamps));
  const latest = new Date(Math.max(...timestamps));
  const spanDays = Math.max(7, daysBetween(earliest, latest) + 14);
  const basePixelsPerDay = getPixelsPerDay(granularity, 1);
  const neededWidthAtZoom1 = spanDays * basePixelsPerDay;
  const rawZoom = availableWidthPx / neededWidthAtZoom1;
  return Math.max(0.5, Math.min(3, Math.round(rawZoom * 20) / 20));
}
