import type { Task } from '../types/task.js';
import {
  collectUpcomingDeadlines,
  diffCalendarDaysISO,
  escapeTelegramHtml,
  formatTelegramUpcomingMessage,
  type DueReminderItem,
  type WorkspaceTasksBundle,
} from './reminders.js';

export interface TelegramInlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface TelegramInlineKeyboard {
  inline_keyboard: TelegramInlineButton[][];
}

export interface TelegramWorkspaceBundle extends WorkspaceTasksBundle {
  isShared?: boolean;
  shareId?: string | null;
}

export type TaskFilterMode = 'active' | 'all' | 'done';

export interface BotViewPayload {
  text: string;
  replyMarkup?: TelegramInlineKeyboard;
}

export interface FlatBotTask {
  task: Task;
  parentName: string | null;
  level: number;
  hasChildren: boolean;
  completed: boolean;
  daysRemaining: number | null;
}

export type ParsedBotCallback =
  | { type: 'noop' }
  | { type: 'workspaces' }
  | { type: 'today' }
  | { type: 'upcoming' }
  | { type: 'summary' }
  | { type: 'task_list'; workspaceId: string; filter: TaskFilterMode; page: number }
  | {
    type: 'task_detail';
    workspaceId: string;
    taskId: number;
    filter: TaskFilterMode;
    page: number;
  }
  | {
    type: 'toggle_done';
    workspaceId: string;
    taskId: number;
    filter: TaskFilterMode;
    page: number;
  }
  | {
    type: 'set_progress';
    workspaceId: string;
    taskId: number;
    progress: number;
    filter: TaskFilterMode;
    page: number;
  }
  | { type: 'quick_done'; workspaceId: string; taskId: number; source: 'alert' | 'today' | 'upcoming' };

export const BOT_COMMANDS: Array<{ command: string; description: string }> = [
  { command: 'tasks', description: 'Browse tasks and mark items done' },
  { command: 'workspaces', description: 'Switch workspaces and view progress' },
  { command: 'today', description: 'Show tasks due today or overdue' },
  { command: 'upcoming', description: 'View open deadlines in the next 14 days' },
  { command: 'summary', description: 'Overall progress across all workspaces' },
  { command: 'pause', description: 'Pause automated deadline alerts' },
  { command: 'resume', description: 'Resume automated deadline alerts' },
  { command: 'stop', description: 'Disconnect this Telegram chat' },
  { command: 'help', description: 'Show all available commands' },
];

const PAGE_SIZE = 6;
const MAX_CALLBACK_BYTES = 64;

function filterToCode(filter: TaskFilterMode): 'a' | 'l' | 'd' {
  if (filter === 'all') return 'l';
  if (filter === 'done') return 'd';
  return 'a';
}

function codeToFilter(code: string | undefined): TaskFilterMode {
  if (code === 'l') return 'all';
  if (code === 'd') return 'done';
  return 'active';
}

function encodeCallback(raw: string): string {
  if (new TextEncoder().encode(raw).length <= MAX_CALLBACK_BYTES) {
    return raw;
  }
  return 'wl';
}

export function parseBotCallback(data: string | undefined): ParsedBotCallback {
  if (!data) return { type: 'noop' };
  const parts = data.split(':');
  const action = parts[0];

  switch (action) {
    case 'noop':
      return { type: 'noop' };
    case 'wl':
      return { type: 'workspaces' };
    case 'to':
      return { type: 'today' };
    case 'up':
      return { type: 'upcoming' };
    case 'sm':
      return { type: 'summary' };
    case 'ws': {
      const workspaceId = parts[1];
      if (!workspaceId) return { type: 'workspaces' };
      const filter = codeToFilter(parts[2]);
      const page = Math.max(0, Number.parseInt(parts[3] ?? '0', 10) || 0);
      return { type: 'task_list', workspaceId, filter, page };
    }
    case 'td': {
      const workspaceId = parts[1];
      const taskId = Number.parseInt(parts[2] ?? '', 10);
      if (!workspaceId || !Number.isFinite(taskId)) return { type: 'workspaces' };
      const filter = codeToFilter(parts[3]);
      const page = Math.max(0, Number.parseInt(parts[4] ?? '0', 10) || 0);
      return { type: 'task_detail', workspaceId, taskId, filter, page };
    }
    case 'dn': {
      const workspaceId = parts[1];
      const taskId = Number.parseInt(parts[2] ?? '', 10);
      if (!workspaceId || !Number.isFinite(taskId)) return { type: 'workspaces' };
      const filter = codeToFilter(parts[3]);
      const page = Math.max(0, Number.parseInt(parts[4] ?? '0', 10) || 0);
      return { type: 'toggle_done', workspaceId, taskId, filter, page };
    }
    case 'pr': {
      const workspaceId = parts[1];
      const taskId = Number.parseInt(parts[2] ?? '', 10);
      const progress = Number.parseInt(parts[3] ?? '', 10);
      if (!workspaceId || !Number.isFinite(taskId) || !Number.isFinite(progress)) {
        return { type: 'workspaces' };
      }
      const filter = codeToFilter(parts[4]);
      const page = Math.max(0, Number.parseInt(parts[5] ?? '0', 10) || 0);
      return {
        type: 'set_progress',
        workspaceId,
        taskId,
        progress: Math.max(0, Math.min(100, progress)),
        filter,
        page,
      };
    }
    case 'qd': {
      const sourceRaw = parts[1];
      const workspaceId = parts[2];
      const taskId = Number.parseInt(parts[3] ?? '', 10);
      if (!workspaceId || !Number.isFinite(taskId)) return { type: 'noop' };
      const source =
        sourceRaw === 't' ? 'today' : sourceRaw === 'u' ? 'upcoming' : 'alert';
      return { type: 'quick_done', workspaceId, taskId, source };
    }
    default:
      return { type: 'noop' };
  }
}

export function isBotTaskCompleted(task: Task): boolean {
  return task.progress === 100 || Boolean(task.isDone);
}

/**
 * Pure Firestore-safe sanitizer (zero undefined fields, mirrors src/domain/taskTree.ts).
 */
export function sanitizeTaskForBot(task: Task): Task {
  const trimmedDescription = typeof task.description === 'string' ? task.description.trim() : '';
  return {
    id: task.id,
    name: task.name,
    ...(trimmedDescription ? { description: trimmedDescription } : {}),
    start: task.start,
    end: task.end,
    progress:
      typeof task.progress === 'number' && !Number.isNaN(task.progress)
        ? Math.max(0, Math.min(100, Math.round(task.progress)))
        : 0,
    isMilestone: Boolean(task.isMilestone),
    isDeadline: Boolean(task.isDeadline || task.start === task.end),
    isDone: Boolean(task.isDone || task.progress === 100),
    isWorking: Boolean(task.isWorking),
    parentId: task.parentId ?? null,
    dependencies: Array.isArray(task.dependencies) ? [...task.dependencies] : [],
    children: Array.isArray(task.children) ? task.children.map(sanitizeTaskForBot) : [],
    collapsed: Boolean(task.collapsed),
  };
}

export function recalculateBotTreeProgress(tasks: readonly Task[]): Task[] {
  return tasks.map((task) => {
    if (!task.children || task.children.length === 0) {
      return sanitizeTaskForBot(task);
    }
    const updatedChildren = recalculateBotTreeProgress(task.children);
    const allCompleted = updatedChildren.every(isBotTaskCompleted);
    const totalProgress = updatedChildren.reduce(
      (sum, child) =>
        sum + (isBotTaskCompleted(child) ? 100 : Math.max(0, Math.min(100, child.progress ?? 0))),
      0,
    );
    const averageProgress = Math.round(totalProgress / updatedChildren.length);
    const progress = allCompleted ? 100 : Math.min(99, averageProgress);
    return sanitizeTaskForBot({
      ...task,
      children: updatedChildren,
      progress,
      isDone: allCompleted,
      isWorking: allCompleted ? false : task.isWorking,
    });
  });
}

function setSubtreeCompletion(tasks: readonly Task[], completed: boolean): Task[] {
  return tasks.map((child) => ({
    ...child,
    isDone: completed,
    progress: completed ? 100 : 0,
    isWorking: completed ? false : child.isWorking,
    children:
      child.children && child.children.length > 0
        ? setSubtreeCompletion(child.children, completed)
        : [],
  }));
}

export function findBotTaskWithParent(
  tasks: readonly Task[],
  taskId: number,
  parentName: string | null = null,
): { task: Task; parentName: string | null } | null {
  for (const task of tasks) {
    if (task.id === taskId) {
      return { task, parentName };
    }
    if (task.children && task.children.length > 0) {
      const found = findBotTaskWithParent(task.children, taskId, task.name);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Toggles completion on any task or subtask, cascading cleanly to children when toggling a parent
 * and recalculating ancestor progress bottom-up.
 */
export function toggleBotTaskDone(
  tasks: readonly Task[],
  taskId: number,
  forceDone?: boolean,
): { tasks: Task[]; updatedTask: Task | null; nextDone: boolean } {
  let updatedTask: Task | null = null;
  let nextDone = false;

  const visit = (list: readonly Task[]): Task[] =>
    list.map((task) => {
      if (task.id === taskId) {
        nextDone = forceDone !== undefined ? forceDone : !isBotTaskCompleted(task);
        const hasChildren = Array.isArray(task.children) && task.children.length > 0;
        const nextTask: Task = {
          ...task,
          isDone: nextDone,
          progress: nextDone ? 100 : 0,
          isWorking: nextDone ? false : task.isWorking,
          children: hasChildren ? setSubtreeCompletion(task.children!, nextDone) : [],
        };
        updatedTask = nextTask;
        return nextTask;
      }
      if (task.children && task.children.length > 0) {
        return { ...task, children: visit(task.children) };
      }
      return task;
    });

  const nextTasks = recalculateBotTreeProgress(visit(tasks));
  if (updatedTask) {
    const refreshed = findBotTaskWithParent(nextTasks, taskId);
    updatedTask = refreshed?.task ?? updatedTask;
  }

  return { tasks: nextTasks, updatedTask, nextDone };
}

/**
 * Updates numeric progress (0..100) on a leaf task/subtask and recalculates parent progress.
 */
export function setBotTaskProgress(
  tasks: readonly Task[],
  taskId: number,
  rawProgress: number,
): { tasks: Task[]; updatedTask: Task | null } {
  const progress = Math.max(0, Math.min(100, Math.round(rawProgress)));
  let updatedTask: Task | null = null;

  const visit = (list: readonly Task[]): Task[] =>
    list.map((task) => {
      if (task.id === taskId) {
        const hasChildren = Array.isArray(task.children) && task.children.length > 0;
        if (hasChildren) {
          // For parent groups, 100% completes children and 0% reopens children
          if (progress === 100 || progress === 0) {
            const done = progress === 100;
            const nextParent: Task = {
              ...task,
              isDone: done,
              progress,
              isWorking: done ? false : task.isWorking,
              children: setSubtreeCompletion(task.children!, done),
            };
            updatedTask = nextParent;
            return nextParent;
          }
          updatedTask = task;
          return task;
        }
        const nextTask: Task = {
          ...task,
          progress,
          isDone: progress === 100,
          isWorking: progress === 100 ? false : task.isWorking,
        };
        updatedTask = nextTask;
        return nextTask;
      }
      if (task.children && task.children.length > 0) {
        return { ...task, children: visit(task.children) };
      }
      return task;
    });

  const nextTasks = recalculateBotTreeProgress(visit(tasks));
  if (updatedTask) {
    const refreshed = findBotTaskWithParent(nextTasks, taskId);
    updatedTask = refreshed?.task ?? updatedTask;
  }

  return { tasks: nextTasks, updatedTask };
}

export function flattenBotTasks(
  tasks: readonly Task[],
  todayISO: string,
  parentName: string | null = null,
  level = 0,
): FlatBotTask[] {
  const result: FlatBotTask[] = [];
  for (const task of tasks) {
    const hasChildren = Array.isArray(task.children) && task.children.length > 0;
    result.push({
      task,
      parentName,
      level,
      hasChildren,
      completed: isBotTaskCompleted(task),
      daysRemaining: task.end ? diffCalendarDaysISO(todayISO, task.end) : null,
    });
    if (hasChildren) {
      result.push(...flattenBotTasks(task.children!, todayISO, task.name, level + 1));
    }
  }
  return result;
}

function renderProgressBar(percent: number, slots = 10): string {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const filled = Math.round((clamped / 100) * slots);
  return `${'▓'.repeat(filled)}${'░'.repeat(slots - filled)}`;
}

function truncateLabel(text: string, maxLen: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1)}…`;
}

function formatShortDate(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)));
}

function formatStatusIcon(item: FlatBotTask): string {
  if (item.completed) return '✅';
  if (item.daysRemaining !== null && item.daysRemaining < 0) return '🔴';
  if (item.daysRemaining === 0) return '🔥';
  if (item.task.isWorking || item.task.progress > 0) return '🔄';
  return '⏳';
}

function formatDeadlineTag(daysRemaining: number | null, completed: boolean): string {
  if (completed) return '✅ Completed';
  if (daysRemaining === null) return 'Scheduled';
  if (daysRemaining < -1) return `🔴 ${Math.abs(daysRemaining)}d overdue`;
  if (daysRemaining === -1) return '🔴 Overdue (yesterday)';
  if (daysRemaining === 0) return '🔥 Due today';
  if (daysRemaining === 1) return '⏰ Due tomorrow';
  return `📅 ${daysRemaining}d left`;
}

function computeWorkspaceStats(flat: readonly FlatBotTask[]) {
  const total = flat.length;
  const completed = flat.filter((f) => f.completed).length;
  const active = total - completed;
  const overdue = flat.filter(
    (f) => !f.completed && f.daysRemaining !== null && f.daysRemaining < 0,
  ).length;
  const dueToday = flat.filter((f) => !f.completed && f.daysRemaining === 0).length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, active, overdue, dueToday, percent };
}

export function buildWorkspacesView(
  workspaces: readonly TelegramWorkspaceBundle[],
  todayISO: string,
  appBaseUrl?: string,
): BotViewPayload {
  if (workspaces.length === 0) {
    const link = appBaseUrl ? `\n\n<a href="${appBaseUrl}">Open Sked</a> to create your first workspace.` : '';
    return {
      text: `<b>📁 Your Workspaces</b>\n\nYou don't have any workspaces yet.${link}`,
    };
  }

  const lines: string[] = [
    `<b>📁 Your Workspaces</b> (${workspaces.length})`,
    'Tap a workspace below to browse tasks or mark items done:',
    '',
  ];

  const rows: TelegramInlineButton[][] = [];

  for (const ws of workspaces) {
    const flat = flattenBotTasks(ws.tasks, todayISO);
    const stats = computeWorkspaceStats(flat);
    const urgentBits: string[] = [];
    if (stats.overdue > 0) urgentBits.push(`🔴 ${stats.overdue} overdue`);
    if (stats.dueToday > 0) urgentBits.push(`🔥 ${stats.dueToday} today`);
    const urgentSuffix = urgentBits.length > 0 ? ` · ${urgentBits.join(', ')}` : '';

    lines.push(`<b>${escapeTelegramHtml(ws.workspaceTitle)}</b>`);
    lines.push(
      `<code>${renderProgressBar(stats.percent, 8)}</code> ${stats.percent}% · ${stats.completed}/${stats.total} done${urgentSuffix}`,
    );
    lines.push('');

    rows.push([
      {
        text: `📁 ${truncateLabel(ws.workspaceTitle, 28)} (${stats.active} open)`,
        callback_data: encodeCallback(`ws:${ws.workspaceId}:a:0`),
      },
    ]);
  }

  rows.push([
    { text: '📅 Today', callback_data: 'to' },
    { text: '⏰ Upcoming', callback_data: 'up' },
    { text: '📊 Summary', callback_data: 'sm' },
  ]);

  return {
    text: lines.join('\n').trim(),
    replyMarkup: { inline_keyboard: rows },
  };
}

export function buildTaskListView(
  workspace: TelegramWorkspaceBundle,
  filter: TaskFilterMode,
  rawPage: number,
  todayISO: string,
  appBaseUrl?: string,
): BotViewPayload {
  const allFlat = flattenBotTasks(workspace.tasks, todayISO);
  const stats = computeWorkspaceStats(allFlat);

  const filtered = allFlat.filter((item) => {
    if (filter === 'active') return !item.completed;
    if (filter === 'done') return item.completed;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.max(0, Math.min(rawPage, totalPages - 1));
  const slice = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const cleanBase = appBaseUrl?.replace(/\/+$/, '');
  const titleHtml = cleanBase
    ? `<a href="${cleanBase}/workspace/${workspace.workspaceId}">${escapeTelegramHtml(workspace.workspaceTitle)}</a>`
    : escapeTelegramHtml(workspace.workspaceTitle);

  const filterLabel = filter === 'active' ? 'Active' : filter === 'done' ? 'Completed' : 'All';
  const lines: string[] = [
    `<b>📋 ${titleHtml}</b>`,
    `<code>${renderProgressBar(stats.percent)}</code> <b>${stats.percent}%</b> (${stats.completed}/${stats.total} done)`,
    `<i>Showing ${filterLabel} tasks · Page ${page + 1} of ${totalPages}</i>`,
    '',
  ];

  const rows: TelegramInlineButton[][] = [];
  const fCode = filterToCode(filter);

  // Filter tabs row
  rows.push([
    {
      text: `${filter === 'active' ? '• ' : ''}Active (${stats.active})`,
      callback_data: encodeCallback(`ws:${workspace.workspaceId}:a:0`),
    },
    {
      text: `${filter === 'all' ? '• ' : ''}All (${stats.total})`,
      callback_data: encodeCallback(`ws:${workspace.workspaceId}:l:0`),
    },
    {
      text: `${filter === 'done' ? '• ' : ''}Done (${stats.completed})`,
      callback_data: encodeCallback(`ws:${workspace.workspaceId}:d:0`),
    },
  ]);

  if (slice.length === 0) {
    const emptyMsg =
      filter === 'active'
        ? '🎉 All tasks in this workspace are completed!'
        : filter === 'done'
          ? 'No completed tasks yet.'
          : 'No tasks in this workspace yet.';
    lines.push(emptyMsg);
  } else {
    slice.forEach((item, idx) => {
      const displayNum = page * PAGE_SIZE + idx + 1;
      const icon = formatStatusIcon(item);
      const breadcrumb = item.parentName ? `<i>${escapeTelegramHtml(item.parentName)} → </i>` : '';
      const dueStr = item.task.end ? formatShortDate(item.task.end) : '';
      const pctStr = !item.completed && item.task.progress > 0 ? ` · ${item.task.progress}%` : '';

      lines.push(
        `${displayNum}. ${icon} ${breadcrumb}<b>${escapeTelegramHtml(item.task.name)}</b>`,
      );
      lines.push(
        `    ${dueStr ? `Due ${dueStr}` : 'No date'}${pctStr}${item.hasChildren ? ' · Group' : ''}`,
      );

      rows.push([
        {
          text: `${displayNum}. ${icon} ${truncateLabel(item.task.name, 34)}`,
          callback_data: encodeCallback(
            `td:${workspace.workspaceId}:${item.task.id}:${fCode}:${page}`,
          ),
        },
      ]);
    });
  }

  // Pagination controls
  if (totalPages > 1) {
    const navRow: TelegramInlineButton[] = [];
    if (page > 0) {
      navRow.push({
        text: '◀ Prev',
        callback_data: encodeCallback(`ws:${workspace.workspaceId}:${fCode}:${page - 1}`),
      });
    }
    navRow.push({ text: `${page + 1}/${totalPages}`, callback_data: 'noop' });
    if (page < totalPages - 1) {
      navRow.push({
        text: 'Next ▶',
        callback_data: encodeCallback(`ws:${workspace.workspaceId}:${fCode}:${page + 1}`),
      });
    }
    rows.push(navRow);
  }

  // Footer navigation
  rows.push([
    { text: '📁 Workspaces', callback_data: 'wl' },
    { text: '📅 Today', callback_data: 'to' },
    { text: '🔄 Refresh', callback_data: encodeCallback(`ws:${workspace.workspaceId}:${fCode}:${page}`) },
  ]);

  return {
    text: lines.join('\n').trim(),
    replyMarkup: { inline_keyboard: rows },
  };
}

export function buildTaskDetailView(
  workspace: TelegramWorkspaceBundle,
  taskId: number,
  filter: TaskFilterMode,
  page: number,
  todayISO: string,
  appBaseUrl?: string,
): BotViewPayload {
  const found = findBotTaskWithParent(workspace.tasks, taskId);
  if (!found) {
    return buildTaskListView(workspace, filter, page, todayISO, appBaseUrl);
  }

  const { task, parentName } = found;
  const completed = isBotTaskCompleted(task);
  const hasChildren = Array.isArray(task.children) && task.children.length > 0;
  const daysRemaining = task.end ? diffCalendarDaysISO(todayISO, task.end) : null;
  const durationDays =
    task.start && task.end ? Math.max(1, (diffCalendarDaysISO(task.start, task.end) ?? 0) + 1) : 1;

  const lines: string[] = [
    `<b>${completed ? '✅' : '📌'} ${escapeTelegramHtml(task.name)}</b>`,
    `📁 ${escapeTelegramHtml(workspace.workspaceTitle)}${parentName ? ` → <i>${escapeTelegramHtml(parentName)}</i>` : ''}`,
    '',
    `<b>Status:</b> ${formatDeadlineTag(daysRemaining, completed)}`,
    `<b>Progress:</b> <code>${renderProgressBar(task.progress)}</code> ${task.progress}%`,
    `<b>Schedule:</b> ${formatShortDate(task.start)}${task.start !== task.end ? ` → ${formatShortDate(task.end)}` : ''} (${durationDays} ${durationDays === 1 ? 'day' : 'days'})`,
  ];

  if (hasChildren) {
    const doneChildren = task.children!.filter(isBotTaskCompleted).length;
    lines.push(`<b>Subtasks:</b> ${doneChildren} of ${task.children!.length} completed`);
  }

  if (task.description?.trim()) {
    lines.push('', `<b>Notes:</b>\n<i>${escapeTelegramHtml(task.description.trim())}</i>`);
  }

  const fCode = filterToCode(filter);
  const rows: TelegramInlineButton[][] = [];

  // Primary Mark Done / Reopen action
  rows.push([
    {
      text: completed
        ? hasChildren
          ? '↩️ Reopen Group & Subtasks'
          : '↩️ Reopen Task'
        : hasChildren
          ? '✅ Complete Group & Subtasks'
          : '✅ Mark as Done',
      callback_data: encodeCallback(`dn:${workspace.workspaceId}:${task.id}:${fCode}:${page}`),
    },
  ]);

  // Quick numeric progress buttons for leaf tasks
  if (!hasChildren) {
    const steps = [0, 25, 50, 75, 100];
    rows.push(
      steps.map((pct) => ({
        text: task.progress === pct ? `• ${pct}%` : `${pct}%`,
        callback_data: encodeCallback(
          `pr:${workspace.workspaceId}:${task.id}:${pct}:${fCode}:${page}`,
        ),
      })),
    );
  }

  // Back & Open in Web App row
  const navRow: TelegramInlineButton[] = [
    {
      text: '◀️ Back to Tasks',
      callback_data: encodeCallback(`ws:${workspace.workspaceId}:${fCode}:${page}`),
    },
  ];
  const cleanBase = appBaseUrl?.replace(/\/+$/, '');
  if (cleanBase) {
    navRow.push({
      text: '🌐 Open in Sked',
      url: `${cleanBase}/workspace/${workspace.workspaceId}`,
    });
  }
  rows.push(navRow);

  return {
    text: lines.join('\n'),
    replyMarkup: { inline_keyboard: rows },
  };
}

export function buildTodayView(
  workspaces: readonly TelegramWorkspaceBundle[],
  todayISO: string,
  appBaseUrl?: string,
): BotViewPayload {
  const urgentItems = collectUpcomingDeadlines(workspaces, todayISO, 0);
  const cleanBase = appBaseUrl?.replace(/\/+$/, '');

  if (urgentItems.length === 0) {
    return {
      text: [
        `<b>📅 Today's Focus</b> (${formatShortDate(todayISO)})`,
        '',
        '✅ Nothing overdue or due today across your workspaces!',
      ].join('\n'),
      replyMarkup: {
        inline_keyboard: [
          [
            { text: '📋 Browse Tasks', callback_data: 'wl' },
            { text: '⏰ Next 14 Days', callback_data: 'up' },
          ],
        ],
      },
    };
  }

  const lines: string[] = [
    `<b>📅 Today's Focus</b> (${urgentItems.length} ${urgentItems.length === 1 ? 'task' : 'tasks'} due today or overdue)`,
    '',
  ];

  for (const item of urgentItems.slice(0, 12)) {
    const tag = item.daysRemaining < 0 ? `🔴 ${Math.abs(item.daysRemaining)}d overdue` : '🔥 Due today';
    const wsLink = cleanBase
      ? `<a href="${cleanBase}/workspace/${item.workspaceId}">${escapeTelegramHtml(item.workspaceTitle)}</a>`
      : escapeTelegramHtml(item.workspaceTitle);
    lines.push(
      `• ${tag} — <b>${escapeTelegramHtml(item.taskName)}</b> (${wsLink})`,
    );
  }

  if (urgentItems.length > 12) {
    lines.push('', `<i>…and ${urgentItems.length - 12} more items.</i>`);
  }

  const rows: TelegramInlineButton[][] = urgentItems.slice(0, 5).map((item) => [
    {
      text: `✅ Done: ${truncateLabel(item.taskName, 32)}`,
      callback_data: encodeCallback(`qd:t:${item.workspaceId}:${item.taskId}`),
    },
  ]);

  rows.push([
    { text: '📋 Browse Tasks', callback_data: 'wl' },
    { text: '⏰ Upcoming', callback_data: 'up' },
    { text: '🔄 Refresh', callback_data: 'to' },
  ]);

  return {
    text: lines.join('\n'),
    replyMarkup: { inline_keyboard: rows },
  };
}

export function buildUpcomingView(
  workspaces: readonly TelegramWorkspaceBundle[],
  todayISO: string,
  appBaseUrl?: string,
): BotViewPayload {
  const upcoming = collectUpcomingDeadlines(workspaces, todayISO, 14);
  const text = formatTelegramUpcomingMessage(upcoming, todayISO, appBaseUrl);

  const rows: TelegramInlineButton[][] = upcoming.slice(0, 5).map((item) => [
    {
      text: `✅ Done: ${truncateLabel(item.taskName, 32)}`,
      callback_data: encodeCallback(`qd:u:${item.workspaceId}:${item.taskId}`),
    },
  ]);

  rows.push([
    { text: '📅 Today', callback_data: 'to' },
    { text: '📋 Browse Tasks', callback_data: 'wl' },
    { text: '🔄 Refresh', callback_data: 'up' },
  ]);

  return {
    text,
    replyMarkup: { inline_keyboard: rows },
  };
}

export function buildSummaryView(
  workspaces: readonly TelegramWorkspaceBundle[],
  todayISO: string,
  appBaseUrl?: string,
): BotViewPayload {
  if (workspaces.length === 0) {
    return buildWorkspacesView(workspaces, todayISO, appBaseUrl);
  }

  let totalTasks = 0;
  let totalDone = 0;
  let totalOverdue = 0;
  let totalDueToday = 0;
  let totalDueSoon = 0;

  const wsLines: string[] = [];

  for (const ws of workspaces) {
    const flat = flattenBotTasks(ws.tasks, todayISO);
    const stats = computeWorkspaceStats(flat);
    const dueSoon = flat.filter(
      (f) => !f.completed && f.daysRemaining !== null && f.daysRemaining >= 1 && f.daysRemaining <= 7,
    ).length;

    totalTasks += stats.total;
    totalDone += stats.completed;
    totalOverdue += stats.overdue;
    totalDueToday += stats.dueToday;
    totalDueSoon += dueSoon;

    wsLines.push(
      `• <b>${escapeTelegramHtml(ws.workspaceTitle)}</b> — ${stats.percent}% (${stats.completed}/${stats.total})`,
    );
  }

  const overallPercent = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;

  const lines: string[] = [
    '<b>📊 Sked Progress Summary</b>',
    `<code>${renderProgressBar(overallPercent)}</code> <b>${overallPercent}%</b> (${totalDone}/${totalTasks} tasks done)`,
    '',
    `🔴 Overdue: <b>${totalOverdue}</b>   🔥 Due today: <b>${totalDueToday}</b>   📅 Next 7d: <b>${totalDueSoon}</b>`,
    '',
    '<b>Workspaces</b>',
    ...wsLines,
  ];

  const rows: TelegramInlineButton[][] = [
    [
      { text: '📋 Browse Tasks', callback_data: 'wl' },
      { text: '📅 Today', callback_data: 'to' },
      { text: '⏰ Upcoming', callback_data: 'up' },
    ],
  ];

  const cleanBase = appBaseUrl?.replace(/\/+$/, '');
  if (cleanBase) {
    rows.push([{ text: '🌐 Open Sked', url: cleanBase }]);
  }

  return {
    text: lines.join('\n'),
    replyMarkup: { inline_keyboard: rows },
  };
}

/**
 * Builds quick-action inline buttons attached underneath automated scheduled deadline reminders.
 */
export function buildReminderAlertReplyMarkup(
  items: readonly DueReminderItem[],
  appBaseUrl?: string,
): TelegramInlineKeyboard {
  const rows: TelegramInlineButton[][] = items.slice(0, 4).map((item) => [
    {
      text: `✅ Done: ${truncateLabel(item.taskName, 32)}`,
      callback_data: encodeCallback(`qd:a:${item.workspaceId}:${item.taskId}`),
    },
  ]);

  const footer: TelegramInlineButton[] = [
    { text: '📋 Browse Tasks', callback_data: 'wl' },
    { text: '📅 Today', callback_data: 'to' },
  ];
  const cleanBase = appBaseUrl?.replace(/\/+$/, '');
  if (cleanBase) {
    footer.push({ text: '🌐 Open Sked', url: cleanBase });
  }
  rows.push(footer);

  return { inline_keyboard: rows };
}

export function buildHelpMessage(): BotViewPayload {
  return {
    text: [
      '<b>🤖 Sked Bot Commands</b>',
      '',
      '<b>Tasks &amp; Progress</b>',
      '• /tasks — browse tasks, inspect details, and mark items done',
      '• /workspaces — switch between workspaces',
      '• /today — view tasks due today or overdue',
      '• /upcoming — list deadlines in the next 14 days',
      '• /summary — overall progress report across workspaces',
      '',
      '<b>Alert Controls</b>',
      '• /pause — pause scheduled deadline alerts',
      '• /resume — resume scheduled deadline alerts',
      '• /stop — disconnect this Telegram chat',
    ].join('\n'),
    replyMarkup: {
      inline_keyboard: [
        [
          { text: '📋 Browse Tasks', callback_data: 'wl' },
          { text: '📅 Today', callback_data: 'to' },
          { text: '📊 Summary', callback_data: 'sm' },
        ],
      ],
    },
  };
}
