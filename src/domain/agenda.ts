import type {
  AgendaDeliveryStatus,
  AgendaItem,
  AgendaItemDraft,
  AgendaReminderOffset,
} from '../types/agenda.js';
import type { Task } from '../types/task.js';
import { escapeTelegramHtml, isValidTimeZone, sanitizeSafeAppUrl } from './reminders.js';

export interface CalendarWorkspaceSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export const ALLOWED_AGENDA_REMINDER_OFFSETS: readonly AgendaReminderOffset[] = [0, 15, 30, 60];
export const MAX_AGENDA_ITEMS = 250;
export const CLOUD_TASK_MAX_LEAD_MS = 29 * 86_400_000; // 29-day safe buffer under GCP's 30-day limit

export const AGENDA_REMINDER_LABELS: Record<string, string> = {
  none: 'No alert',
  '0': 'At scheduled time',
  '15': '15 min before',
  '30': '30 min before',
  '60': '1 hour before',
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
  const nowISO = new Date().toISOString();

  const reminderTargetISO =
    typeof raw.reminderTargetISO === 'string' && !Number.isNaN(Date.parse(raw.reminderTargetISO))
      ? raw.reminderTargetISO
      : computeReminderTargetISO({ date, time, reminderOffsetMinutes, timezone });

  return {
    id,
    title,
    date,
    time,
    ...(note ? { note } : {}),
    isDone: Boolean(raw.isDone),
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

export function getAgendaDeliveryStatus(
  item: AgendaItem,
  telegramConnected: boolean,
  nowMs = Date.now(),
): AgendaDeliveryStatus {
  if (item.reminderOffsetMinutes === null || item.isDone) return 'none';
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

export function formatAgendaTelegramMessage(item: AgendaItem, appBaseUrl?: string): string {
  const safeTitle = escapeTelegramHtml(item.title);
  const dateLabel = formatReadableAgendaDate(item.date);
  const timeLabel = item.time ? formatClockTime12h(item.time) : 'All day';

  let leadTag = '⏰ Scheduled Reminder';
  if (item.reminderOffsetMinutes === 15) leadTag = '⏰ Starting in 15 minutes';
  else if (item.reminderOffsetMinutes === 30) leadTag = '⏰ Starting in 30 minutes';
  else if (item.reminderOffsetMinutes === 60) leadTag = '⏰ Starting in 1 hour';
  else if (item.reminderOffsetMinutes === 0) leadTag = '🔔 Happening now';

  const lines: string[] = [
    `<b>${leadTag}</b>`,
    '',
    `📌 <b>${safeTitle}</b>`,
    `🗓 ${escapeTelegramHtml(dateLabel)} · <b>${escapeTelegramHtml(timeLabel)}</b>`,
  ];

  if (item.note?.trim()) {
    lines.push('', `<i>${escapeTelegramHtml(item.note.trim())}</i>`);
  }

  const cleanBase = sanitizeSafeAppUrl(appBaseUrl);
  if (cleanBase) {
    lines.push('', `<a href="${escapeTelegramHtml(cleanBase)}">Open Sked Calendar</a>`);
  }

  return lines.join('\n');
}
