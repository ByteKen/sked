import { enrichTaskTreeForViews, type DueUrgency } from '@/domain/taskViews';
import { computeTaskStats, isTaskCompleted } from '@/domain/taskTree';
import type { Task, TaskStatus, Workspace, WorkspaceMap } from '@/types';

export type ProjectHealthLevel = 'completed' | 'on-track' | 'at-risk' | 'off-track' | 'empty';

export type FocusBucket = 'overdue' | 'today' | 'working' | 'upcoming';

export interface WorkspaceHealthSummary {
  workspaceId: string;
  workspaceTitle: string;
  health: ProjectHealthLevel;
  totalTasks: number;
  completedTasks: number;
  completionPercent: number;
  overdueCount: number;
  dueTodayCount: number;
  dueThisWeekCount: number;
  workingCount: number;
  blockedCount: number;
  maxBaselineSlipDays: number;
  nextDueDate: string | null;
}

export interface CrossWorkspaceFocusTask {
  workspaceId: string;
  workspaceTitle: string;
  taskId: number;
  taskName: string;
  parentName: string | null;
  start: string;
  end: string;
  progress: number;
  status: TaskStatus;
  dueUrgency: DueUrgency;
  daysUntilDue: number;
  isCritical: boolean;
  slipDays: number | null;
  blockedByIncompleteCount: number;
  bucket: FocusBucket;
}

export interface PortfolioFocusSummary {
  healthByWorkspaceId: Record<string, WorkspaceHealthSummary>;
  counts: {
    overdue: number;
    today: number;
    working: number;
    upcoming: number;
    blocked: number;
    activeWorkspaces: number;
    atRiskWorkspaces: number;
    offTrackWorkspaces: number;
  };
  buckets: Record<FocusBucket, CrossWorkspaceFocusTask[]>;
  prioritizedQueue: CrossWorkspaceFocusTask[];
}

export const HEALTH_LABELS: Record<ProjectHealthLevel, string> = {
  completed: 'Completed',
  'on-track': 'On Track',
  'at-risk': 'At Risk',
  'off-track': 'Off Track',
  empty: 'No Tasks',
};

/**
 * Compute deterministic project health for a single workspace using actionable leaf tasks
 * so parent phase rollups never double-count overdue or blocked subtasks.
 */
export function computeWorkspaceHealth(
  workspace: Workspace,
  tasks: readonly Task[],
  todayISO: string,
  upcomingHorizonDays = 7,
): { summary: WorkspaceHealthSummary; focusItems: CrossWorkspaceFocusTask[] } {
  const stats = computeTaskStats(tasks);
  if (stats.total === 0) {
    return {
      summary: {
        workspaceId: workspace.id,
        workspaceTitle: workspace.title,
        health: 'empty',
        totalTasks: 0,
        completedTasks: 0,
        completionPercent: 0,
        overdueCount: 0,
        dueTodayCount: 0,
        dueThisWeekCount: 0,
        workingCount: 0,
        blockedCount: 0,
        maxBaselineSlipDays: 0,
        nextDueDate: null,
      },
      focusItems: [],
    };
  }

  const enriched = enrichTaskTreeForViews(tasks, {
    todayISO,
    baseline: workspace.baseline,
  });

  // Actionable leaf tasks avoid double-counting phases + subtasks
  const leafItems = enriched.filter((item) => !item.task.hasChildren);

  let overdueCount = 0;
  let maxOverdueDays = 0;
  let dueTodayCount = 0;
  let dueThisWeekCount = 0;
  let workingCount = 0;
  let blockedCount = 0;
  let maxBaselineSlipDays = 0;
  let nextDueDate: string | null = null;
  const focusItems: CrossWorkspaceFocusTask[] = [];

  for (const item of leafItems) {
    const completed = isTaskCompleted(item.task);
    if (typeof item.slipDays === 'number' && item.slipDays > maxBaselineSlipDays) {
      maxBaselineSlipDays = item.slipDays;
    }

    if (completed) continue;

    if (!nextDueDate || item.task.end < nextDueDate) {
      nextDueDate = item.task.end;
    }

    if (item.status === 'working') {
      workingCount += 1;
    }
    if (item.blockedByIncompleteCount > 0) {
      blockedCount += 1;
    }

    let bucket: FocusBucket | null = null;
    if (item.daysUntilDue < 0) {
      overdueCount += 1;
      maxOverdueDays = Math.max(maxOverdueDays, Math.abs(item.daysUntilDue));
      bucket = 'overdue';
    } else if (item.daysUntilDue === 0) {
      dueTodayCount += 1;
      dueThisWeekCount += 1;
      bucket = 'today';
    } else if (item.status === 'working') {
      if (item.daysUntilDue <= upcomingHorizonDays) {
        dueThisWeekCount += 1;
      }
      bucket = 'working';
    } else if (item.daysUntilDue <= upcomingHorizonDays) {
      dueThisWeekCount += 1;
      bucket = 'upcoming';
    }

    if (bucket) {
      focusItems.push({
        workspaceId: workspace.id,
        workspaceTitle: workspace.title,
        taskId: item.task.id,
        taskName: item.task.name,
        parentName: item.parentName,
        start: item.task.start,
        end: item.task.end,
        progress: item.task.progress,
        status: item.status,
        dueUrgency: item.dueUrgency,
        daysUntilDue: item.daysUntilDue,
        isCritical: item.isCritical,
        slipDays: item.slipDays,
        blockedByIncompleteCount: item.blockedByIncompleteCount,
        bucket,
      });
    }
  }

  let health: ProjectHealthLevel;
  if (stats.completed === stats.total) {
    health = 'completed';
  } else if (overdueCount >= 2 || maxOverdueDays > 3 || maxBaselineSlipDays >= 7) {
    health = 'off-track';
  } else if (
    overdueCount >= 1 ||
    (dueTodayCount >= 1 && workingCount === 0) ||
    blockedCount >= 2 ||
    maxBaselineSlipDays >= 2
  ) {
    health = 'at-risk';
  } else {
    health = 'on-track';
  }

  return {
    summary: {
      workspaceId: workspace.id,
      workspaceTitle: workspace.title,
      health,
      totalTasks: stats.total,
      completedTasks: stats.completed,
      completionPercent: stats.completionPercent,
      overdueCount,
      dueTodayCount,
      dueThisWeekCount,
      workingCount,
      blockedCount,
      maxBaselineSlipDays,
      nextDueDate,
    },
    focusItems,
  };
}

/**
 * Build the complete cross-workspace My Focus & Portfolio Health summary from all user workspaces.
 */
export function buildPortfolioFocusSummary(
  workspaces: WorkspaceMap,
  tasksByWorkspaceId: Record<string, readonly Task[]>,
  todayISO: string,
  upcomingHorizonDays = 7,
): PortfolioFocusSummary {
  const healthByWorkspaceId: Record<string, WorkspaceHealthSummary> = {};
  const buckets: Record<FocusBucket, CrossWorkspaceFocusTask[]> = {
    overdue: [],
    today: [],
    working: [],
    upcoming: [],
  };

  let blocked = 0;
  let activeWorkspaces = 0;
  let atRiskWorkspaces = 0;
  let offTrackWorkspaces = 0;

  for (const workspace of Object.values(workspaces)) {
    const tasks = tasksByWorkspaceId[workspace.id] ?? [];
    const { summary, focusItems } = computeWorkspaceHealth(
      workspace,
      tasks,
      todayISO,
      upcomingHorizonDays,
    );

    healthByWorkspaceId[workspace.id] = summary;
    blocked += summary.blockedCount;
    if (summary.health !== 'empty' && summary.health !== 'completed') {
      activeWorkspaces += 1;
    }
    if (summary.health === 'at-risk') atRiskWorkspaces += 1;
    if (summary.health === 'off-track') offTrackWorkspaces += 1;

    for (const item of focusItems) {
      buckets[item.bucket].push(item);
    }
  }

  // Deterministic urgency sorting inside each bucket
  buckets.overdue.sort(
    (a, b) =>
      a.daysUntilDue - b.daysUntilDue ||
      Number(b.isCritical) - Number(a.isCritical) ||
      a.taskName.localeCompare(b.taskName),
  );
  buckets.today.sort(
    (a, b) =>
      Number(b.isCritical) - Number(a.isCritical) ||
      Number(b.status === 'working') - Number(a.status === 'working') ||
      a.taskName.localeCompare(b.taskName),
  );
  buckets.working.sort(
    (a, b) =>
      a.daysUntilDue - b.daysUntilDue ||
      Number(b.isCritical) - Number(a.isCritical) ||
      a.taskName.localeCompare(b.taskName),
  );
  buckets.upcoming.sort(
    (a, b) =>
      a.daysUntilDue - b.daysUntilDue ||
      Number(b.isCritical) - Number(a.isCritical) ||
      a.taskName.localeCompare(b.taskName),
  );

  const prioritizedQueue: CrossWorkspaceFocusTask[] = [
    ...buckets.overdue,
    ...buckets.today,
    ...buckets.working,
    ...buckets.upcoming,
  ];

  return {
    healthByWorkspaceId,
    counts: {
      overdue: buckets.overdue.length,
      today: buckets.today.length,
      working: buckets.working.length,
      upcoming: buckets.upcoming.length,
      blocked,
      activeWorkspaces,
      atRiskWorkspaces,
      offTrackWorkspaces,
    },
    buckets,
    prioritizedQueue,
  };
}
