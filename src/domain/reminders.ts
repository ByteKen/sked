import type { Task } from '../types/task.js';

export interface WorkspaceTasksBundle {
  workspaceId: string;
  workspaceTitle: string;
  tasks: readonly Task[];
}

export interface DueReminderItem {
  key: string;
  workspaceId: string;
  workspaceTitle: string;
  taskId: number;
  taskName: string;
  parentName: string | null;
  description?: string;
  endDate: string;
  daysRemaining: number;
  progress: number;
}

export interface LocalDateParts {
  dateISO: string;
  hour: number;
  timeZone: string;
}

export const ALLOWED_REMINDER_OFFSETS = new Set([0, 1, 2, 3, 5, 7, 14]);
export const DEFAULT_REMINDER_OFFSETS_LIST = [5, 3, 1, 0];

/**
 * Validates an IANA timezone string using the standard Intl engine.
 */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone || typeof timeZone !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/**
 * Computes the exact local calendar date (`YYYY-MM-DD`) and 24-hour clock hour (`0..23`)
 * for an instant `now` inside a specific IANA timezone. Falls back safely to UTC.
 */
export function getLocalDatePartsInTimezone(now: Date, rawTimeZone: string): LocalDateParts {
  const timeZone = isValidTimeZone(rawTimeZone) ? rawTimeZone : 'UTC';
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(now);
  const lookup = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '00';

  const year = lookup('year');
  const month = lookup('month');
  const day = lookup('day');
  const rawHour = Number.parseInt(lookup('hour'), 10);
  const hour = Number.isNaN(rawHour) ? 0 : rawHour % 24;

  return {
    dateISO: `${year}-${month}-${day}`,
    hour,
    timeZone,
  };
}

function parseISOCalendarDayToUtcMs(isoDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return null;
  const ms = Date.UTC(y, m - 1, d, 12, 0, 0, 0);
  const check = new Date(ms);
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== m - 1 ||
    check.getUTCDate() !== d
  ) {
    return null;
  }
  return ms;
}

/**
 * Pure calendar-day difference (`toISO - fromISO`) in whole days.
 * Immune to server timezone and daylight saving transitions.
 */
export function diffCalendarDaysISO(fromISO: string, toISO: string): number | null {
  const fromMs = parseISOCalendarDayToUtcMs(fromISO);
  const toMs = parseISOCalendarDayToUtcMs(toISO);
  if (fromMs === null || toMs === null) return null;
  return Math.round((toMs - fromMs) / 86_400_000);
}

/**
 * Deterministic idempotency key per workspace, task, target end date, and offset.
 * Rescheduling `endDate` produces a new key so updated deadlines re-notify accurately.
 */
export function buildReminderKey(
  workspaceId: string,
  taskId: number,
  endDateISO: string,
  daysRemaining: number,
): string {
  return `${workspaceId}:${taskId}:${endDateISO}:${daysRemaining}`;
}

export function normalizeReminderOffsets(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [...DEFAULT_REMINDER_OFFSETS_LIST];
  const valid = raw
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && ALLOWED_REMINDER_OFFSETS.has(v));
  const unique = Array.from(new Set(valid)).sort((a, b) => b - a);
  return unique.length > 0 ? unique : [...DEFAULT_REMINDER_OFFSETS_LIST];
}

function isCompleted(task: Task): boolean {
  return task.progress === 100 || Boolean(task.isDone);
}

function walkTasksWithParent(
  tasks: readonly Task[],
  parentName: string | null,
  visitor: (task: Task, parentName: string | null) => void,
): void {
  for (const task of tasks) {
    visitor(task, parentName);
    if (Array.isArray(task.children) && task.children.length > 0) {
      walkTasksWithParent(task.children, task.name, visitor);
    }
  }
}

export interface CollectDueRemindersParams {
  workspaces: readonly WorkspaceTasksBundle[];
  todayISO: string;
  reminderOffsets: readonly number[];
  includeOverdue: boolean;
  sentReminders?: Readonly<Record<string, string>>;
}

/**
 * Finds all incomplete tasks/subtasks across a user's workspaces whose exact calendar-day
 * countdown matches one of the configured reminder offsets (or 1 day overdue) and has not
 * yet been sent.
 */
export function collectDueReminders(params: CollectDueRemindersParams): DueReminderItem[] {
  const { workspaces, todayISO, reminderOffsets, includeOverdue, sentReminders = {} } = params;
  const offsetSet = new Set(reminderOffsets);
  const dueItems: DueReminderItem[] = [];

  for (const ws of workspaces) {
    walkTasksWithParent(ws.tasks, null, (task, parentName) => {
      if (isCompleted(task) || !task.end) return;

      const daysRemaining = diffCalendarDaysISO(todayISO, task.end);
      if (daysRemaining === null) return;

      const matchesOffset = offsetSet.has(daysRemaining);
      const matchesOverdue = includeOverdue && daysRemaining === -1;
      if (!matchesOffset && !matchesOverdue) return;

      const key = buildReminderKey(ws.workspaceId, task.id, task.end, daysRemaining);
      if (Object.prototype.hasOwnProperty.call(sentReminders, key)) {
        return;
      }

      dueItems.push({
        key,
        workspaceId: ws.workspaceId,
        workspaceTitle: ws.workspaceTitle,
        taskId: task.id,
        taskName: task.name,
        parentName,
        description: task.description?.trim() || undefined,
        endDate: task.end,
        daysRemaining,
        progress: typeof task.progress === 'number' ? task.progress : 0,
      });
    });
  }

  return dueItems.sort((a, b) => {
    if (a.daysRemaining !== b.daysRemaining) return a.daysRemaining - b.daysRemaining;
    if (a.workspaceTitle !== b.workspaceTitle) {
      return a.workspaceTitle.localeCompare(b.workspaceTitle);
    }
    return a.taskName.localeCompare(b.taskName);
  });
}

/**
 * Collects all upcoming incomplete deadlines within `horizonDays` (used by `/upcoming`).
 */
export function collectUpcomingDeadlines(
  workspaces: readonly WorkspaceTasksBundle[],
  todayISO: string,
  horizonDays = 14,
): DueReminderItem[] {
  const items: DueReminderItem[] = [];

  for (const ws of workspaces) {
    walkTasksWithParent(ws.tasks, null, (task, parentName) => {
      if (isCompleted(task) || !task.end) return;
      const daysRemaining = diffCalendarDaysISO(todayISO, task.end);
      if (daysRemaining === null || daysRemaining < -7 || daysRemaining > horizonDays) return;

      items.push({
        key: buildReminderKey(ws.workspaceId, task.id, task.end, daysRemaining),
        workspaceId: ws.workspaceId,
        workspaceTitle: ws.workspaceTitle,
        taskId: task.id,
        taskName: task.name,
        parentName,
        description: task.description?.trim() || undefined,
        endDate: task.end,
        daysRemaining,
        progress: typeof task.progress === 'number' ? task.progress : 0,
      });
    });
  }

  return items.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

/**
 * Removes sent-reminder entries older than `maxAgeDays` so the dedupe map stays compact.
 */
export function pruneSentReminders(
  sentReminders: Readonly<Record<string, string>>,
  now: Date,
  maxAgeDays = 14,
): Record<string, string> {
  const cutoffMs = now.getTime() - maxAgeDays * 86_400_000;
  const pruned: Record<string, string> = {};

  for (const [key, sentAtISO] of Object.entries(sentReminders)) {
    const sentMs = Date.parse(sentAtISO);
    if (!Number.isNaN(sentMs) && sentMs >= cutoffMs) {
      pruned[key] = sentAtISO;
    }
  }
  return pruned;
}

export function escapeTelegramHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatCountdownLabel(daysRemaining: number): string {
  if (daysRemaining < -1) return `🔴 ${Math.abs(daysRemaining)} days overdue`;
  if (daysRemaining === -1) return '🔴 Overdue (yesterday)';
  if (daysRemaining === 0) return '🔥 Due today';
  if (daysRemaining === 1) return '⏰ Tomorrow (1 day left)';
  return `📅 In ${daysRemaining} days`;
}

function formatReadableDateISO(isoDate: string): string {
  const ms = parseISOCalendarDayToUtcMs(isoDate);
  if (ms === null) return isoDate;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(ms));
}

function truncateNote(text: string, maxLen = 110): string {
  const singleLine = text.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxLen) return singleLine;
  return `${singleLine.slice(0, maxLen - 1)}…`;
}

export function formatTelegramReminderMessage(
  items: readonly DueReminderItem[],
  appBaseUrl?: string,
): string {
  if (items.length === 0) return '';

  const grouped = new Map<string, { title: string; items: DueReminderItem[] }>();
  for (const item of items) {
    const existing = grouped.get(item.workspaceId);
    if (existing) {
      existing.items.push(item);
    } else {
      grouped.set(item.workspaceId, { title: item.workspaceTitle, items: [item] });
    }
  }

  const lines: string[] = [
    `<b>Gantt Deadline Reminder</b> (${items.length} ${items.length === 1 ? 'task' : 'tasks'})`,
    '',
  ];

  const cleanBase = appBaseUrl?.replace(/\/+$/, '');

  for (const [workspaceId, group] of grouped.entries()) {
    const safeTitle = escapeTelegramHtml(group.title);
    if (cleanBase) {
      lines.push(`<b>📁 <a href="${cleanBase}/workspace/${workspaceId}">${safeTitle}</a></b>`);
    } else {
      lines.push(`<b>📁 ${safeTitle}</b>`);
    }

    for (const item of group.items) {
      const countdown = formatCountdownLabel(item.daysRemaining);
      const safeName = escapeTelegramHtml(item.taskName);
      const parentPrefix = item.parentName
        ? `<i>${escapeTelegramHtml(item.parentName)} → </i>`
        : '';
      const dateText = formatReadableDateISO(item.endDate);
      const progressText = item.progress > 0 ? ` · ${item.progress}%` : '';

      lines.push(`• ${countdown} — ${parentPrefix}<b>${safeName}</b>`);
      lines.push(`  Due ${dateText}${progressText}`);

      if (item.description) {
        lines.push(`  <i>${escapeTelegramHtml(truncateNote(item.description))}</i>`);
      }
    }

    lines.push('');
  }

  return lines.join('\n').trim();
}

export function formatTelegramUpcomingMessage(
  items: readonly DueReminderItem[],
  todayISO: string,
  appBaseUrl?: string,
): string {
  if (items.length === 0) {
    return `<b>No upcoming deadlines</b> in the next 14 days (as of ${formatReadableDateISO(todayISO)}).`;
  }
  const capped = items.slice(0, 20);
  const body = formatTelegramReminderMessage(capped, appBaseUrl);
  const extra =
    items.length > capped.length
      ? `\n\n<i>…and ${items.length - capped.length} more upcoming tasks in your workspaces.</i>`
      : '';
  return `${body}${extra}`;
}
