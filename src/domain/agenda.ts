import type {
  AgendaDeliveryStatus,
  AgendaItem,
  AgendaItemDraft,
  AgendaRecurrenceFrequency,
  AgendaReminderOffset,
} from '../types/agenda.js';
import type { Task } from '../types/task.js';
import {
  escapeTelegramHtml,
  getLocalDatePartsInTimezone,
  isValidTimeZone,
  sanitizeSafeAppUrl,
} from './reminders.js';

export interface CalendarWorkspaceSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export const ALLOWED_AGENDA_REMINDER_OFFSETS: readonly AgendaReminderOffset[] = [0, 15, 30, 60];
export const ALLOWED_AGENDA_RECURRENCES: readonly AgendaRecurrenceFrequency[] = [
  'none',
  'daily',
  'weekdays',
  'weekly',
  'monthly',
  'yearly',
];
export const MAX_AGENDA_ITEMS = 250;
export const MAX_STORED_COMPLETED_DATES = 120;
export const CLOUD_TASK_MAX_LEAD_MS = 29 * 86_400_000; // 29-day safe buffer under GCP's 30-day limit
export const IN_APP_REMINDER_CATCHUP_MS = 2 * 60_000; // 2-minute grace window for tab wakeups
const MAX_SAFE_TIMEOUT_MS = 24 * 60 * 60 * 1000; // Cap setTimeout safely well below 32-bit max

export const AGENDA_REMINDER_LABELS: Record<string, string> = {
  none: 'No alert',
  '0': 'At scheduled time',
  '15': '15 min before',
  '30': '30 min before',
  '60': '1 hour before',
};

export const AGENDA_RECURRENCE_LABELS: Record<AgendaRecurrenceFrequency, string> = {
  none: 'Does not repeat',
  daily: 'Every day',
  weekdays: 'Weekdays (Mon–Fri)',
  weekly: 'Every week',
  monthly: 'Every month',
  yearly: 'Every year',
};

export const AGENDA_RECURRENCE_SHORT_LABELS: Record<AgendaRecurrenceFrequency, string> = {
  none: 'Once',
  daily: 'Daily',
  weekdays: 'Weekdays',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

export interface AgendaValidationResult {
  valid: boolean;
  error?: string;
}

export interface CalendarDayCell {
  dateISO: string;
  dayNumber: number;
  inCurrentMonth: boolean;
  isToday: boolean;
}

export interface CalendarAgendaOccurrence {
  item: AgendaItem;
  occurrenceDate: string;
  isDone: boolean;
  isRepeating: boolean;
}

export interface CalendarDeadlineItem {
  key: string;
  workspaceId: string;
  workspaceTitle: string;
  workspaceAccentIndex: number;
  taskId: number;
  taskName: string;
  parentName: string | null;
  start: string;
  end: string;
  progress: number;
  isDone: boolean;
  isOverdue: boolean;
}

export function isValidISODateString(raw: unknown): raw is string {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const [y, m, d] = raw.split('-').map(Number);
  if (!y || !m || !d) return false;
  const check = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return (
    check.getUTCFullYear() === y &&
    check.getUTCMonth() === m - 1 &&
    check.getUTCDate() === d
  );
}

export function isValidClockTime24(raw: unknown): raw is string {
  if (typeof raw !== 'string' || !/^\d{2}:\d{2}$/.test(raw)) return false;
  const [h, m] = raw.split(':').map(Number);
  return (
    typeof h === 'number' &&
    typeof m === 'number' &&
    Number.isInteger(h) &&
    Number.isInteger(m) &&
    h >= 0 &&
    h <= 23 &&
    m >= 0 &&
    m <= 59
  );
}

export function normalizeAgendaReminderOffset(raw: unknown): AgendaReminderOffset | null {
  if (raw === null || raw === undefined || raw === '' || raw === 'none') return null;
  const num = Number(raw);
  if (num === 0 || num === 15 || num === 30 || num === 60) {
    return num;
  }
  return null;
}

export function normalizeAgendaRecurrence(raw: unknown): AgendaRecurrenceFrequency {
  if (
    raw === 'daily' ||
    raw === 'weekdays' ||
    raw === 'weekly' ||
    raw === 'monthly' ||
    raw === 'yearly'
  ) {
    return raw;
  }
  return 'none';
}

export function isRepeatingAgendaItem(item: Pick<AgendaItem, 'recurrence'>): boolean {
  return normalizeAgendaRecurrence(item.recurrence) !== 'none';
}

export function sanitizeCompletedDates(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const validSet = new Set<string>();
  for (const entry of raw) {
    if (isValidISODateString(entry)) {
      validSet.add(entry);
    }
  }
  return Array.from(validSet)
    .sort((a, b) => a.localeCompare(b))
    .slice(-MAX_STORED_COMPLETED_DATES);
}

export function isAgendaOccurrenceDone(
  item: Pick<AgendaItem, 'isDone' | 'recurrence' | 'completedDates'>,
  occurrenceDate: string,
): boolean {
  if (!isRepeatingAgendaItem(item)) return Boolean(item.isDone);
  return Boolean(item.completedDates?.includes(occurrenceDate));
}

function parseISODateParts(iso: string): { year: number; month: number; day: number; dow: number } {
  const [year = 2026, month = 1, day = 1] = iso.split('-').map(Number);
  const dow = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay();
  return { year, month, day, dow };
}

function daysInUtcMonth(year: number, month1Based: number): number {
  return new Date(Date.UTC(year, month1Based, 0, 12, 0, 0)).getUTCDate();
}

function formatUtcDateParts(year: number, month1Based: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month1Based).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function addCalendarDaysISO(dateISO: string, deltaDays: number): string {
  const [y = 2026, m = 1, d = 1] = dateISO.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0));
  return formatUtcDateParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/**
 * Pure O(1) occurrence test for whether a one-off or repeating agenda item lands on `targetDateISO`.
 * Handles month-end clamping (e.g., Jan 31 -> Feb 28/29 -> Mar 31) and leap days cleanly.
 */
export function doesAgendaItemOccurOnDate(
  item: Pick<AgendaItem, 'date' | 'recurrence' | 'recurrenceEndDate'>,
  targetDateISO: string,
): boolean {
  if (!isValidISODateString(item.date) || !isValidISODateString(targetDateISO)) return false;
  if (targetDateISO < item.date) return false;
  if (item.recurrenceEndDate && isValidISODateString(item.recurrenceEndDate)) {
    if (targetDateISO > item.recurrenceEndDate) return false;
  }

  const freq = normalizeAgendaRecurrence(item.recurrence);
  if (freq === 'none') return targetDateISO === item.date;
  if (freq === 'daily') return true;

  const start = parseISODateParts(item.date);
  const target = parseISODateParts(targetDateISO);

  if (freq === 'weekdays') {
    return target.dow >= 1 && target.dow <= 5;
  }
  if (freq === 'weekly') {
    return target.dow === start.dow;
  }
  if (freq === 'monthly') {
    const expectedDay = Math.min(start.day, daysInUtcMonth(target.year, target.month));
    return target.day === expectedDay;
  }
  // yearly
  if (target.month !== start.month) return false;
  const expectedDay = Math.min(start.day, daysInUtcMonth(target.year, target.month));
  return target.day === expectedDay;
}

/**
 * Pure O(1) next occurrence date finder (`>= fromDateISO` when `inclusive`, else `> fromDateISO`).
 * Returns `null` once past `recurrenceEndDate` or past a non-repeating item's single date.
 */
export function getNextAgendaOccurrenceDate(
  item: Pick<AgendaItem, 'date' | 'recurrence' | 'recurrenceEndDate'>,
  fromDateISO: string,
  inclusive = true,
): string | null {
  if (!isValidISODateString(item.date) || !isValidISODateString(fromDateISO)) return null;

  const base = inclusive ? fromDateISO : addCalendarDaysISO(fromDateISO, 1);
  const searchFrom = base < item.date ? item.date : base;
  const endDate =
    item.recurrenceEndDate && isValidISODateString(item.recurrenceEndDate)
      ? item.recurrenceEndDate
      : null;

  if (endDate && searchFrom > endDate) return null;

  const freq = normalizeAgendaRecurrence(item.recurrence);
  let candidate: string | null = null;

  if (freq === 'none') {
    candidate = searchFrom === item.date ? item.date : null;
  } else if (freq === 'daily') {
    candidate = searchFrom;
  } else if (freq === 'weekdays') {
    const { dow } = parseISODateParts(searchFrom);
    if (dow === 6) candidate = addCalendarDaysISO(searchFrom, 2);
    else if (dow === 0) candidate = addCalendarDaysISO(searchFrom, 1);
    else candidate = searchFrom;
  } else if (freq === 'weekly') {
    const startDow = parseISODateParts(item.date).dow;
    const searchDow = parseISODateParts(searchFrom).dow;
    const delta = (startDow - searchDow + 7) % 7;
    candidate = addCalendarDaysISO(searchFrom, delta);
  } else if (freq === 'monthly') {
    const startDay = parseISODateParts(item.date).day;
    const s = parseISODateParts(searchFrom);
    const thisMonthDay = Math.min(startDay, daysInUtcMonth(s.year, s.month));
    const thisMonthIso = formatUtcDateParts(s.year, s.month, thisMonthDay);
    if (thisMonthIso >= searchFrom) {
      candidate = thisMonthIso;
    } else {
      const nextMonth = s.month === 12 ? 1 : s.month + 1;
      const nextYear = s.month === 12 ? s.year + 1 : s.year;
      const nextDay = Math.min(startDay, daysInUtcMonth(nextYear, nextMonth));
      candidate = formatUtcDateParts(nextYear, nextMonth, nextDay);
    }
  } else {
    // yearly
    const start = parseISODateParts(item.date);
    const s = parseISODateParts(searchFrom);
    const thisYearDay = Math.min(start.day, daysInUtcMonth(s.year, start.month));
    const thisYearIso = formatUtcDateParts(s.year, start.month, thisYearDay);
    if (thisYearIso >= searchFrom) {
      candidate = thisYearIso;
    } else {
      const nextYear = s.year + 1;
      const nextDay = Math.min(start.day, daysInUtcMonth(nextYear, start.month));
      candidate = formatUtcDateParts(nextYear, start.month, nextDay);
    }
  }

  if (!candidate) return null;
  if (endDate && candidate > endDate) return null;
  return candidate;
}

export function formatClockTime12h(time24: string | null | undefined): string {
  if (!time24 || !isValidClockTime24(time24)) return '';
  const [h = 0, m = 0] = time24.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatUtcIsoInTimezone(iso: string, rawTimeZone: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const timeZone = isValidTimeZone(rawTimeZone) ? rawTimeZone : 'UTC';
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(ms));
}

function getTimezoneOffsetMsAtInstant(utcMs: number, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(new Date(utcMs));
  const lookup = (type: Intl.DateTimeFormatPartTypes): number =>
    Number.parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10) || 0;

  const year = lookup('year');
  const month = lookup('month');
  const day = lookup('day');
  const hour = lookup('hour') % 24;
  const minute = lookup('minute');
  const second = lookup('second');

  const localAsUtcMs = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  return localAsUtcMs - utcMs;
}

/**
 * Converts a local calendar date (`YYYY-MM-DD`) and 24-hour clock time (`HH:mm`) in an IANA
 * timezone to an exact UTC epoch timestamp (ms), accounting cleanly for DST transitions.
 */
export function localDateTimeToUtcMs(
  dateISO: string,
  time24: string,
  rawTimeZone: string,
): number | null {
  if (!isValidISODateString(dateISO) || !isValidClockTime24(time24)) return null;
  const timeZone = isValidTimeZone(rawTimeZone) ? rawTimeZone : 'UTC';
  const [y = 0, m = 1, d = 1] = dateISO.split('-').map(Number);
  const [hour = 0, minute = 0] = time24.split(':').map(Number);

  const guessUtcMs = Date.UTC(y, m - 1, d, hour, minute, 0, 0);
  const offset1 = getTimezoneOffsetMsAtInstant(guessUtcMs, timeZone);
  const refinedUtcMs = guessUtcMs - offset1;
  const offset2 = getTimezoneOffsetMsAtInstant(refinedUtcMs, timeZone);
  return guessUtcMs - offset2;
}

/**
 * Computes the exact UTC ISO instant when an agenda Telegram reminder should fire.
 * For all-day items (no `time`), falls back to `defaultReminderHour` (e.g. 9:00 AM local).
 */
export function computeReminderTargetISO(params: {
  date: string;
  time?: string | null;
  reminderOffsetMinutes: AgendaReminderOffset | null;
  timezone: string;
  defaultReminderHour?: number;
}): string | null {
  if (params.reminderOffsetMinutes === null) return null;

  const effectiveTime = isValidClockTime24(params.time)
    ? params.time
    : `${String(Math.max(0, Math.min(23, Math.round(params.defaultReminderHour ?? 9)))).padStart(2, '0')}:00`;

  const eventUtcMs = localDateTimeToUtcMs(params.date, effectiveTime, params.timezone);
  if (eventUtcMs === null) return null;

  const alertUtcMs = eventUtcMs - params.reminderOffsetMinutes * 60_000;
  return new Date(alertUtcMs).toISOString();
}

/**
 * Computes the next uncompleted occurrence & exact UTC alert instant for either a one-off or
 * repeating agenda item. For repeating items, skips completed dates and past alerts cleanly.
 */
export function computeNextAgendaReminder(params: {
  date: string;
  time?: string | null;
  isDone?: boolean;
  recurrence?: AgendaRecurrenceFrequency;
  recurrenceEndDate?: string | null;
  completedDates?: readonly string[];
  reminderOffsetMinutes: AgendaReminderOffset | null;
  timezone: string;
  defaultReminderHour?: number;
  nowMs?: number;
  minAlertUtcMs?: number;
}): { occurrenceDate: string; reminderTargetISO: string } | null {
  if (params.reminderOffsetMinutes === null) return null;

  const freq = normalizeAgendaRecurrence(params.recurrence);
  if (freq === 'none') {
    if (params.isDone) return null;
    const reminderTargetISO = computeReminderTargetISO({
      date: params.date,
      time: params.time,
      reminderOffsetMinutes: params.reminderOffsetMinutes,
      timezone: params.timezone,
      defaultReminderHour: params.defaultReminderHour,
    });
    return reminderTargetISO ? { occurrenceDate: params.date, reminderTargetISO } : null;
  }

  const nowMs = params.nowMs ?? Date.now();
  const minAlertUtcMs = params.minAlertUtcMs ?? nowMs - 60_000;
  const completedSet = new Set(params.completedDates ?? []);
  const localTodayISO = getLocalDatePartsInTimezone(new Date(nowMs), params.timezone).dateISO;
  // Look back 1 day so lead-time offsets crossing midnight (e.g. 00:15 event alerting at 23:45) are never missed
  const searchFloor = addCalendarDaysISO(localTodayISO, -1);
  let cursorDate = searchFloor > params.date ? searchFloor : params.date;

  for (let step = 0; step < 32; step += 1) {
    const occDate = getNextAgendaOccurrenceDate(
      {
        date: params.date,
        recurrence: freq,
        recurrenceEndDate: params.recurrenceEndDate ?? null,
      },
      cursorDate,
      step === 0,
    );
    if (!occDate) return null;

    if (!completedSet.has(occDate)) {
      const targetISO = computeReminderTargetISO({
        date: occDate,
        time: params.time,
        reminderOffsetMinutes: params.reminderOffsetMinutes,
        timezone: params.timezone,
        defaultReminderHour: params.defaultReminderHour,
      });
      if (targetISO) {
        const targetMs = Date.parse(targetISO);
        if (!Number.isNaN(targetMs) && targetMs > minAlertUtcMs) {
          return { occurrenceDate: occDate, reminderTargetISO: targetISO };
        }
      }
    }

    cursorDate = occDate;
  }

  return null;
}

/**
 * Given an agenda alert timestamp (`reminderTargetISO`), derives the local calendar occurrence date
 * (`YYYY-MM-DD`) of the underlying event (accounting for lead-time offsets crossing midnight).
 */
export function resolveOccurrenceDateForAlert(
  item: Pick<AgendaItem, 'date' | 'reminderOffsetMinutes' | 'reminderTargetISO' | 'timezone' | 'recurrence'>,
  targetISOOverride?: string | null,
): string {
  if (!isRepeatingAgendaItem(item)) return item.date;
  const targetISO = targetISOOverride ?? item.reminderTargetISO;
  if (!targetISO) return item.date;
  const targetMs = Date.parse(targetISO);
  if (Number.isNaN(targetMs)) return item.date;
  const offsetMs = (item.reminderOffsetMinutes ?? 0) * 60_000;
  return getLocalDatePartsInTimezone(new Date(targetMs + offsetMs), item.timezone).dateISO;
}

export function toggleAgendaItemCompletion(
  item: AgendaItem,
  occurrenceDate: string | undefined,
  nowISO: string,
): AgendaItem {
  if (!isRepeatingAgendaItem(item)) {
    return {
      ...item,
      isDone: !item.isDone,
      updatedAt: nowISO,
    };
  }

  const targetDate =
    occurrenceDate && isValidISODateString(occurrenceDate)
      ? occurrenceDate
      : getLocalDatePartsInTimezone(new Date(nowISO), item.timezone).dateISO;

  const existing = sanitizeCompletedDates(item.completedDates);
  const nextCompleted = existing.includes(targetDate)
    ? existing.filter((d) => d !== targetDate)
    : sanitizeCompletedDates([...existing, targetDate]);

  return {
    ...item,
    isDone: false,
    completedDates: nextCompleted,
    updatedAt: nowISO,
  };
}

export function isWithinCloudTaskWindow(targetISO: string, nowMs = Date.now()): boolean {
  const targetMs = Date.parse(targetISO);
  if (Number.isNaN(targetMs)) return false;
  return targetMs > nowMs - 60_000 && targetMs <= nowMs + CLOUD_TASK_MAX_LEAD_MS;
}

export function isDeferredBeyondCloudTaskWindow(targetISO: string, nowMs = Date.now()): boolean {
  const targetMs = Date.parse(targetISO);
  if (Number.isNaN(targetMs)) return false;
  return targetMs > nowMs + CLOUD_TASK_MAX_LEAD_MS;
}

export function validateAgendaDraft(draft: AgendaItemDraft): AgendaValidationResult {
  const title = draft.title.trim();
  if (!title) return { valid: false, error: 'Enter a title for this agenda item.' };
  if (title.length < 2) return { valid: false, error: 'Title must be at least 2 characters.' };
  if (title.length > 100) return { valid: false, error: 'Title must be 100 characters or fewer.' };

  if (!isValidISODateString(draft.date)) {
    return { valid: false, error: 'Choose a valid calendar date.' };
  }

  if (draft.time && !isValidClockTime24(draft.time)) {
    return { valid: false, error: 'Enter a valid time (HH:MM).' };
  }

  if (draft.note && draft.note.trim().length > 500) {
    return { valid: false, error: 'Note must be 500 characters or fewer.' };
  }

  const recurrence = normalizeAgendaRecurrence(draft.recurrence);
  if (recurrence !== 'none' && draft.recurrenceEndDate) {
    if (!isValidISODateString(draft.recurrenceEndDate)) {
      return { valid: false, error: 'Choose a valid repeat end date.' };
    }
    if (draft.recurrenceEndDate < draft.date) {
      return { valid: false, error: 'Repeat end date must be on or after the start date.' };
    }
  }

  return { valid: true };
}

export function sanitizeAgendaItem(raw: Partial<AgendaItem>): AgendaItem | null {
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
  const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, 100) : '';
  const date = isValidISODateString(raw.date) ? raw.date : '';
  if (!id || !title || !date) return null;

  const time = isValidClockTime24(raw.time) ? raw.time : null;
  const note = typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim().slice(0, 500) : '';
  const timezone =
    typeof raw.timezone === 'string' && isValidTimeZone(raw.timezone) ? raw.timezone : 'UTC';
  const reminderOffsetMinutes = normalizeAgendaReminderOffset(raw.reminderOffsetMinutes);
  const recurrence = normalizeAgendaRecurrence(raw.recurrence);
  const recurrenceEndDate =
    recurrence !== 'none' && isValidISODateString(raw.recurrenceEndDate) && raw.recurrenceEndDate >= date
      ? raw.recurrenceEndDate
      : null;
  const completedDates = recurrence !== 'none' ? sanitizeCompletedDates(raw.completedDates) : [];
  const isDone = recurrence !== 'none' ? false : Boolean(raw.isDone);
  const nowISO = new Date().toISOString();

  const reminderTargetISO =
    typeof raw.reminderTargetISO === 'string' && !Number.isNaN(Date.parse(raw.reminderTargetISO))
      ? raw.reminderTargetISO
      : computeNextAgendaReminder({
          date,
          time,
          isDone,
          recurrence,
          recurrenceEndDate,
          completedDates,
          reminderOffsetMinutes,
          timezone,
        })?.reminderTargetISO ?? null;

  return {
    id,
    title,
    date,
    time,
    ...(note ? { note } : {}),
    isDone,
    ...(recurrence !== 'none' ? { recurrence } : {}),
    ...(recurrenceEndDate ? { recurrenceEndDate } : {}),
    ...(completedDates.length > 0 ? { completedDates } : {}),
    reminderOffsetMinutes,
    timezone,
    reminderTargetISO: reminderOffsetMinutes !== null ? reminderTargetISO : null,
    cloudTaskName: typeof raw.cloudTaskName === 'string' && raw.cloudTaskName ? raw.cloudTaskName : null,
    reminderSentAt:
      typeof raw.reminderSentAt === 'string' && raw.reminderSentAt ? raw.reminderSentAt : null,
    createdAt: typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : nowISO,
    updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : nowISO,
  };
}

export function sanitizeAgendaItems(raw: unknown): AgendaItem[] {
  if (!Array.isArray(raw)) return [];
  const items: AgendaItem[] = [];
  const seenIds = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const clean = sanitizeAgendaItem(entry as Partial<AgendaItem>);
    if (!clean || seenIds.has(clean.id)) continue;
    seenIds.add(clean.id);
    items.push(clean);
    if (items.length >= MAX_AGENDA_ITEMS) break;
  }
  return sortAgendaItems(items);
}

export function sortAgendaItems(items: readonly AgendaItem[]): AgendaItem[] {
  return [...items].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const aTime = a.time ?? '99:99';
    const bTime = b.time ?? '99:99';
    if (aTime !== bTime) return aTime.localeCompare(bTime);
    return a.title.localeCompare(b.title);
  });
}

/**
 * Expands one-off and repeating agenda items across a list of visible calendar dates (`YYYY-MM-DD`).
 */
export function expandAgendaItemsForDates(
  items: readonly AgendaItem[],
  dateISOs: readonly string[],
): Map<string, CalendarAgendaOccurrence[]> {
  const map = new Map<string, CalendarAgendaOccurrence[]>();

  for (const dateISO of dateISOs) {
    const matches: CalendarAgendaOccurrence[] = [];
    for (const item of items) {
      if (!doesAgendaItemOccurOnDate(item, dateISO)) continue;
      matches.push({
        item,
        occurrenceDate: dateISO,
        isDone: isAgendaOccurrenceDone(item, dateISO),
        isRepeating: isRepeatingAgendaItem(item),
      });
    }

    if (matches.length > 0) {
      matches.sort((a, b) => {
        const aTime = a.item.time ?? '99:99';
        const bTime = b.item.time ?? '99:99';
        if (aTime !== bTime) return aTime.localeCompare(bTime);
        return a.item.title.localeCompare(b.item.title);
      });
      map.set(dateISO, matches);
    }
  }

  return map;
}

export function getAgendaDeliveryStatus(
  item: AgendaItem,
  telegramConnected: boolean,
  nowMs = Date.now(),
  occurrenceDate?: string,
): AgendaDeliveryStatus {
  const effectiveDate = occurrenceDate ?? item.date;
  if (item.reminderOffsetMinutes === null || isAgendaOccurrenceDone(item, effectiveDate)) {
    return 'none';
  }

  if (!isRepeatingAgendaItem(item)) {
    if (item.reminderSentAt) return 'sent';
    if (!telegramConnected) return 'unlinked';
    if (item.cloudTaskName) return 'scheduled';
    if (item.reminderTargetISO) {
      const targetMs = Date.parse(item.reminderTargetISO);
      if (!Number.isNaN(targetMs)) {
        if (targetMs <= nowMs - 60_000) return 'past';
        if (isDeferredBeyondCloudTaskWindow(item.reminderTargetISO, nowMs)) return 'deferred';
      }
    }
    return 'unconfigured';
  }

  if (!telegramConnected) return 'unlinked';

  const occTargetISO = computeReminderTargetISO({
    date: effectiveDate,
    time: item.time,
    reminderOffsetMinutes: item.reminderOffsetMinutes,
    timezone: item.timezone,
  });
  const occTargetMs = occTargetISO ? Date.parse(occTargetISO) : NaN;

  if (!Number.isNaN(occTargetMs) && occTargetMs <= nowMs - 60_000) {
    if (item.reminderSentAt) {
      const sentMs = Date.parse(item.reminderSentAt);
      if (!Number.isNaN(sentMs) && sentMs >= occTargetMs - 60_000) {
        return 'sent';
      }
    }
    return 'past';
  }

  if (item.cloudTaskName) return 'scheduled';
  if (occTargetISO && isDeferredBeyondCloudTaskWindow(occTargetISO, nowMs)) return 'deferred';
  if (item.reminderTargetISO && isDeferredBeyondCloudTaskWindow(item.reminderTargetISO, nowMs)) {
    return 'deferred';
  }
  return 'unconfigured';
}

/**
 * Generates a 35- or 42-day Sun–Sat calendar grid for a given year and 0-based month index.
 */
export function buildCalendarMonthGrid(
  year: number,
  monthIndex: number,
  todayISO: string,
): CalendarDayCell[] {
  const firstOfMonth = new Date(Date.UTC(year, monthIndex, 1, 12, 0, 0));
  const startWeekday = firstOfMonth.getUTCDay(); // 0 = Sun ... 6 = Sat
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0, 12, 0, 0)).getUTCDate();
  const totalCells = startWeekday + daysInMonth > 35 ? 42 : 35;

  const cells: CalendarDayCell[] = [];
  for (let i = 0; i < totalCells; i += 1) {
    const dayDate = new Date(Date.UTC(year, monthIndex, 1 - startWeekday + i, 12, 0, 0));
    const y = dayDate.getUTCFullYear();
    const m = String(dayDate.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dayDate.getUTCDate()).padStart(2, '0');
    const dateISO = `${y}-${m}-${d}`;
    cells.push({
      dateISO,
      dayNumber: dayDate.getUTCDate(),
      inCurrentMonth: dayDate.getUTCMonth() === monthIndex,
      isToday: dateISO === todayISO,
    });
  }
  return cells;
}

/**
 * Flattens all tasks & subtasks across every workspace into deadline entries for the Calendar view.
 */
export function collectWorkspaceDeadlinesForCalendar(
  workspaces: Record<string, CalendarWorkspaceSummary>,
  workspaceTasks: Record<string, Task[]>,
  todayISO: string,
): CalendarDeadlineItem[] {
  const sortedWorkspaces: CalendarWorkspaceSummary[] = Object.values(workspaces).sort(
    (a, b) =>
      new Date(b.updatedAt || b.createdAt).getTime() -
      new Date(a.updatedAt || a.createdAt).getTime(),
  );

  const deadlines: CalendarDeadlineItem[] = [];

  sortedWorkspaces.forEach((ws, accentIndex) => {
    const walk = (tasks: readonly Task[], parentName: string | null) => {
      for (const task of tasks) {
        if (isValidISODateString(task.end)) {
          const isDone = Boolean(task.isDone || task.progress === 100);
          deadlines.push({
            key: `${ws.id}:${task.id}`,
            workspaceId: ws.id,
            workspaceTitle: ws.title,
            workspaceAccentIndex: accentIndex,
            taskId: task.id,
            taskName: task.name,
            parentName,
            start: task.start,
            end: task.end,
            progress: typeof task.progress === 'number' ? task.progress : 0,
            isDone,
            isOverdue: !isDone && task.end < todayISO,
          });
        }
        if (Array.isArray(task.children) && task.children.length > 0) {
          walk(task.children, task.name);
        }
      }
    };
    walk(workspaceTasks[ws.id] ?? [], null);
  });

  return deadlines.sort((a, b) => {
    if (a.end !== b.end) return a.end.localeCompare(b.end);
    if (a.isDone !== b.isDone) return a.isDone ? 1 : -1;
    return a.taskName.localeCompare(b.taskName);
  });
}

function formatReadableAgendaDate(isoDate: string): string {
  if (!isValidISODateString(isoDate)) return isoDate;
  const [y = 2026, m = 1, d = 1] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)));
}

export function buildAgendaFiredKey(item: Pick<AgendaItem, 'id' | 'reminderTargetISO'>): string {
  return `${item.id}:${item.reminderTargetISO ?? ''}`;
}

export function getAgendaReminderHeading(
  item: Pick<AgendaItem, 'reminderOffsetMinutes'>,
): { emoji: string; text: string } {
  if (item.reminderOffsetMinutes === 15) {
    return { emoji: '⏰', text: 'Reminder — Starting in 15 minutes' };
  }
  if (item.reminderOffsetMinutes === 30) {
    return { emoji: '⏰', text: 'Reminder — Starting in 30 minutes' };
  }
  if (item.reminderOffsetMinutes === 60) {
    return { emoji: '⏰', text: 'Reminder — Starting in 1 hour' };
  }
  if (item.reminderOffsetMinutes === 0) {
    return { emoji: '🔔', text: 'Reminder — Happening now' };
  }
  return { emoji: '⏰', text: 'Reminder' };
}

/**
 * Pure local scheduler selector for in-app alerts while Sked is open.
 * Handles both one-off and repeating agenda items dynamically so long-lived tabs fire
 * every recurring occurrence on time without polling or page refreshes.
 */
export function findDueAndNextInAppReminders(
  items: readonly AgendaItem[],
  firedKeys: ReadonlySet<string>,
  nowMs: number,
  catchupWindowMs = IN_APP_REMINDER_CATCHUP_MS,
): { due: AgendaItem[]; nextDelayMs: number | null } {
  const due: AgendaItem[] = [];
  let soonestFutureMs: number | null = null;

  for (const item of items) {
    if (item.reminderOffsetMinutes === null) continue;

    if (!isRepeatingAgendaItem(item)) {
      if (item.isDone || !item.reminderTargetISO) continue;
      const firedKey = buildAgendaFiredKey(item);
      if (firedKeys.has(firedKey)) continue;

      const targetMs = Date.parse(item.reminderTargetISO);
      if (Number.isNaN(targetMs)) continue;

      if (targetMs <= nowMs && targetMs >= nowMs - catchupWindowMs) {
        due.push(item);
      } else if (targetMs > nowMs) {
        if (soonestFutureMs === null || targetMs < soonestFutureMs) {
          soonestFutureMs = targetMs;
        }
      }
      continue;
    }

    // Repeating item: resolve the active catchup/next occurrence dynamically
    let match = computeNextAgendaReminder({
      date: item.date,
      time: item.time,
      recurrence: item.recurrence,
      recurrenceEndDate: item.recurrenceEndDate,
      completedDates: item.completedDates,
      reminderOffsetMinutes: item.reminderOffsetMinutes,
      timezone: item.timezone,
      nowMs,
      minAlertUtcMs: nowMs - catchupWindowMs - 1,
    });

    if (!match) continue;
    let firedKey = buildAgendaFiredKey({ id: item.id, reminderTargetISO: match.reminderTargetISO });
    if (firedKeys.has(firedKey)) {
      const prevMs = Date.parse(match.reminderTargetISO);
      match = computeNextAgendaReminder({
        date: item.date,
        time: item.time,
        recurrence: item.recurrence,
        recurrenceEndDate: item.recurrenceEndDate,
        completedDates: item.completedDates,
        reminderOffsetMinutes: item.reminderOffsetMinutes,
        timezone: item.timezone,
        nowMs,
        minAlertUtcMs: Math.max(nowMs, Number.isNaN(prevMs) ? nowMs : prevMs),
      });
      if (!match) continue;
      firedKey = buildAgendaFiredKey({ id: item.id, reminderTargetISO: match.reminderTargetISO });
      if (firedKeys.has(firedKey)) continue;
    }

    const targetMs = Date.parse(match.reminderTargetISO);
    if (Number.isNaN(targetMs)) continue;

    if (targetMs <= nowMs && targetMs >= nowMs - catchupWindowMs) {
      due.push({
        ...item,
        date: match.occurrenceDate,
        reminderTargetISO: match.reminderTargetISO,
      });
    } else if (targetMs > nowMs) {
      if (soonestFutureMs === null || targetMs < soonestFutureMs) {
        soonestFutureMs = targetMs;
      }
    }
  }

  const nextDelayMs =
    soonestFutureMs !== null
      ? Math.max(250, Math.min(soonestFutureMs - nowMs, MAX_SAFE_TIMEOUT_MS))
      : null;

  return { due, nextDelayMs };
}

export function formatAgendaTelegramMessage(
  item: AgendaItem,
  appBaseUrl?: string,
  occurrenceDateOverride?: string,
): string {
  const safeTitle = escapeTelegramHtml(item.title);
  const effectiveDate = occurrenceDateOverride ?? item.date;
  const dateLabel = formatReadableAgendaDate(effectiveDate);
  const timeLabel = item.time ? formatClockTime12h(item.time) : 'All day';
  const heading = getAgendaReminderHeading(item);
  const recurrence = normalizeAgendaRecurrence(item.recurrence);

  const lines: string[] = [
    `<b>${heading.emoji} ${escapeTelegramHtml(heading.text)}</b>`,
    '',
    `📌 <b>${safeTitle}</b>`,
    `🗓 ${escapeTelegramHtml(dateLabel)} · <b>${escapeTelegramHtml(timeLabel)}</b>`,
  ];

  if (recurrence !== 'none') {
    lines.push(`🔁 Repeats ${escapeTelegramHtml(AGENDA_RECURRENCE_LABELS[recurrence].toLowerCase())}`);
  }

  if (item.note?.trim()) {
    lines.push('', `<i>${escapeTelegramHtml(item.note.trim())}</i>`);
  }

  const cleanBase = sanitizeSafeAppUrl(appBaseUrl);
  if (cleanBase) {
    lines.push('', `<a href="${escapeTelegramHtml(cleanBase)}">Open Sked Calendar</a>`);
  }

  return lines.join('\n');
}
