import {
  computeCriticalPath,
  computeTaskBaselineSlipDays,
  diffDaysISO,
  getInclusiveDurationDays,
} from '@/domain/scheduling';
import {
  flattenTasks,
  getTaskStatus,
  isTaskCompleted,
  recalculateParentProgress,
  sanitizeTask,
} from '@/domain/taskTree';
import type { FlatTask, Task, TaskDraft, TaskStatus, WorkspaceBaseline } from '@/types';

export const BOARD_COLUMN_ORDER: readonly TaskStatus[] = [
  'not-started',
  'working',
  'in-progress',
  'completed',
] as const;

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  'not-started': 'Not Started',
  working: 'Working Now',
  'in-progress': 'In Progress',
  completed: 'Completed',
};

export const TASK_STATUS_SHORT_LABELS: Record<TaskStatus, string> = {
  'not-started': 'To Do',
  working: 'Working',
  'in-progress': 'In Progress',
  completed: 'Done',
};

export type DueUrgency = 'overdue' | 'today' | 'soon' | 'upcoming' | 'completed';

export type ListSortField = 'tree' | 'name' | 'status' | 'start' | 'end' | 'duration' | 'progress';
export type SortDirection = 'asc' | 'desc';

export interface EnrichedTaskItem {
  task: FlatTask;
  status: TaskStatus;
  parentName: string | null;
  rootPhaseId: number;
  rootPhaseName: string;
  durationDays: number;
  dueUrgency: DueUrgency;
  daysUntilDue: number;
  isCritical: boolean;
  slackDays: number | null;
  slipDays: number | null;
  dependencyCount: number;
  blockedByIncompleteCount: number;
}

export interface PhaseFilterOption {
  id: number;
  name: string;
  taskCount: number;
}

export interface EnrichTaskViewOptions {
  todayISO: string;
  baseline?: WorkspaceBaseline | null;
  respectCollapsed?: boolean;
  collapsedOverrides?: Record<number, boolean>;
}

/**
 * Compute due urgency relative to local today ISO date (YYYY-MM-DD).
 */
export function getTaskDueUrgency(
  task: Pick<Task, 'end' | 'progress' | 'isDone'>,
  todayISO: string,
): { urgency: DueUrgency; daysUntilDue: number } {
  const daysUntilDue = diffDaysISO(todayISO, task.end);
  if (isTaskCompleted(task as Task)) {
    return { urgency: 'completed', daysUntilDue };
  }
  if (daysUntilDue < 0) {
    return { urgency: 'overdue', daysUntilDue };
  }
  if (daysUntilDue === 0) {
    return { urgency: 'today', daysUntilDue };
  }
  if (daysUntilDue <= 3) {
    return { urgency: 'soon', daysUntilDue };
  }
  return { urgency: 'upcoming', daysUntilDue };
}

/**
 * Enrich the flattened task tree with status, phase hierarchy context, critical path,
 * baseline variance, due urgency, and unresolved blocker counts for Board & List views.
 */
export function enrichTaskTreeForViews(
  tasks: readonly Task[],
  options: EnrichTaskViewOptions,
): EnrichedTaskItem[] {
  const allFlat = flattenTasks(tasks);
  const byId = new Map<number, FlatTask>(allFlat.map((t) => [t.id, t]));
  const criticalPath = computeCriticalPath(tasks);

  const visibleFlat = flattenTasks(tasks, {
    respectCollapsed: options.respectCollapsed,
    collapsedOverrides: options.collapsedOverrides,
  });

  const resolveRootPhase = (task: FlatTask): FlatTask => {
    let curr: FlatTask = task;
    const seen = new Set<number>([curr.id]);
    while (curr.parentId !== null && curr.parentId !== undefined) {
      const parent = byId.get(curr.parentId);
      if (!parent || seen.has(parent.id)) break;
      seen.add(parent.id);
      curr = parent;
    }
    return curr;
  };

  return visibleFlat.map((task) => {
    const parent =
      task.parentId !== null && task.parentId !== undefined ? byId.get(task.parentId) ?? null : null;
    const rootPhase = resolveRootPhase(task);
    const { urgency, daysUntilDue } = getTaskDueUrgency(task, options.todayISO);
    const deps = task.dependencies ?? [];
    let blockedByIncompleteCount = 0;
    for (const depId of deps) {
      const depTask = byId.get(depId);
      if (depTask && !isTaskCompleted(depTask)) {
        blockedByIncompleteCount += 1;
      }
    }

    return {
      task,
      status: getTaskStatus(task),
      parentName: parent?.name ?? null,
      rootPhaseId: rootPhase.id,
      rootPhaseName: rootPhase.name,
      durationDays: getInclusiveDurationDays(task.start, task.end),
      dueUrgency: urgency,
      daysUntilDue,
      isCritical: criticalPath.criticalTaskIds.has(task.id),
      slackDays: criticalPath.slackByTaskId.get(task.id) ?? null,
      slipDays: computeTaskBaselineSlipDays(task, options.baseline),
      dependencyCount: deps.length,
      blockedByIncompleteCount,
    };
  });
}

/**
 * Extract top-level phase filter options with actionable task counts.
 */
export function extractPhaseFilterOptions(items: readonly EnrichedTaskItem[]): PhaseFilterOption[] {
  const map = new Map<number, PhaseFilterOption>();
  for (const item of items) {
    const existing = map.get(item.rootPhaseId);
    const increment = item.task.hasChildren ? 0 : 1;
    if (existing) {
      existing.taskCount += increment;
    } else {
      map.set(item.rootPhaseId, {
        id: item.rootPhaseId,
        name: item.rootPhaseName,
        taskCount: increment,
      });
    }
  }
  return Array.from(map.values());
}

/**
 * Group enriched tasks into Kanban columns by status.
 * Defaults to actionable leaf tasks so parent rollups never fight subtask progress.
 */
export function groupTasksForBoard(
  items: readonly EnrichedTaskItem[],
  options: { includePhases?: boolean; phaseId?: number | null } = {},
): Record<TaskStatus, EnrichedTaskItem[]> {
  const { includePhases = false, phaseId = null } = options;
  const groups: Record<TaskStatus, EnrichedTaskItem[]> = {
    'not-started': [],
    working: [],
    'in-progress': [],
    completed: [],
  };

  for (const item of items) {
    if (!includePhases && item.task.hasChildren) continue;
    if (phaseId !== null && item.rootPhaseId !== phaseId) continue;
    groups[item.status].push(item);
  }

  return groups;
}

/**
 * Sort enriched items for the List/Table view.
 * 'tree' preserves natural hierarchical order; any other column produces a stable sorted table.
 */
export function sortTaskItemsForList(
  items: readonly EnrichedTaskItem[],
  sortBy: ListSortField,
  direction: SortDirection,
): EnrichedTaskItem[] {
  if (sortBy === 'tree') {
    return [...items];
  }

  const mult = direction === 'asc' ? 1 : -1;
  const statusRank = (status: TaskStatus) => BOARD_COLUMN_ORDER.indexOf(status);

  return [...items].sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case 'name':
        cmp = a.task.name.localeCompare(b.task.name, undefined, { sensitivity: 'base' });
        break;
      case 'status':
        cmp = statusRank(a.status) - statusRank(b.status);
        break;
      case 'start':
        cmp = a.task.start.localeCompare(b.task.start);
        break;
      case 'end':
        cmp = a.task.end.localeCompare(b.task.end);
        break;
      case 'duration':
        cmp = a.durationDays - b.durationDays;
        break;
      case 'progress':
        cmp = a.task.progress - b.task.progress;
        break;
    }
    if (cmp !== 0) return cmp * mult;
    const startTie = a.task.start.localeCompare(b.task.start);
    if (startTie !== 0) return startTie;
    return a.task.id - b.task.id;
  });
}

function applyLeafStatus(task: Task, targetStatus: TaskStatus): Task {
  switch (targetStatus) {
    case 'not-started':
      return sanitizeTask({ ...task, progress: 0, isDone: false, isWorking: false });
    case 'working':
      return sanitizeTask({
        ...task,
        isWorking: true,
        isDone: false,
        progress: task.progress === 100 ? 50 : task.progress,
      });
    case 'in-progress':
      return sanitizeTask({
        ...task,
        isWorking: false,
        isDone: false,
        progress: task.progress === 0 || task.progress === 100 ? 50 : task.progress,
      });
    case 'completed':
      return sanitizeTask({ ...task, progress: 100, isDone: true, isWorking: false });
  }
}

function applyRecursiveDescendantsStatus(
  children: readonly Task[],
  targetStatus: 'not-started' | 'completed',
): Task[] {
  return children.map((child) => {
    const updatedChildren =
      child.children && child.children.length > 0
        ? applyRecursiveDescendantsStatus(child.children, targetStatus)
        : [];
    return applyLeafStatus({ ...child, children: updatedChildren }, targetStatus);
  });
}

function clearWorkingRecursive(children: readonly Task[]): Task[] {
  return children.map((child) => ({
    ...child,
    isWorking: false,
    children: child.children ? clearWorkingRecursive(child.children) : [],
  }));
}

/**
 * Pure status transition for both leaf tasks and parent phases (used by Kanban & List views).
 * Guarantees recalculated parent progress and zero invalid state combinations.
 */
export function setTaskStatusInTree(
  tasks: readonly Task[],
  taskId: number,
  targetStatus: TaskStatus,
): { tasks: Task[]; updatedTask: Task | null } {
  let updatedTask: Task | null = null;

  const updateRecursive = (list: readonly Task[]): Task[] =>
    list.map((task) => {
      if (task.id === taskId) {
        const hasChildren = Boolean(task.children && task.children.length > 0);
        if (!hasChildren) {
          const next = applyLeafStatus(task, targetStatus);
          updatedTask = next;
          return next;
        }

        // Phase with children: keep child progress consistent with the requested phase status
        const existingChildren = task.children ?? [];
        if (targetStatus === 'completed' || targetStatus === 'not-started') {
          const nextChildren = applyRecursiveDescendantsStatus(existingChildren, targetStatus);
          const next = sanitizeTask({
            ...task,
            isWorking: false,
            isDone: targetStatus === 'completed',
            progress: targetStatus === 'completed' ? 100 : 0,
            children: nextChildren,
          });
          updatedTask = next;
          return next;
        }

        if (targetStatus === 'working') {
          const allDone = existingChildren.every(isTaskCompleted);
          const nextChildren = allDone
            ? existingChildren.map((child, idx) =>
                idx === existingChildren.length - 1 ? applyLeafStatus(child, 'working') : child,
              )
            : existingChildren;
          const next = sanitizeTask({
            ...task,
            isWorking: true,
            isDone: false,
            children: nextChildren,
          });
          updatedTask = next;
          return next;
        }

        // targetStatus === 'in-progress'
        const clearedChildren = clearWorkingRecursive(existingChildren);
        const allDone = clearedChildren.every(isTaskCompleted);
        const allNotStarted = clearedChildren.every((c) => !isTaskCompleted(c) && c.progress === 0);
        const nextChildren =
          allDone || allNotStarted
            ? clearedChildren.map((child, idx) =>
                idx === 0 ? applyLeafStatus(child, 'in-progress') : child,
              )
            : clearedChildren;
        const next = sanitizeTask({
          ...task,
          isWorking: false,
          isDone: false,
          children: nextChildren,
        });
        updatedTask = next;
        return next;
      }

      if (task.children && task.children.length > 0) {
        return {
          ...task,
          children: updateRecursive(task.children),
        };
      }
      return task;
    });

  const nextTasks = recalculateParentProgress(updateRecursive(tasks));
  return { tasks: nextTasks, updatedTask };
}

/**
 * Default draft field values when adding a task directly inside a Kanban column.
 */
export function buildDraftDefaultsForStatus(status: TaskStatus): Partial<TaskDraft> {
  switch (status) {
    case 'working':
      return { progress: 25, isWorking: true, isDone: false };
    case 'in-progress':
      return { progress: 50, isWorking: false, isDone: false };
    case 'completed':
      return { progress: 100, isWorking: false, isDone: true };
    case 'not-started':
    default:
      return { progress: 0, isWorking: false, isDone: false };
  }
}
