import type { Task, TaskBaselineEntry, WorkspaceBaseline } from '@/types';
import { flattenTasks, sanitizeTaskTree } from './taskTree';
import { daysBetween, parseISODate } from './timeline';

export interface RescheduleTaskParams {
  taskId: number;
  nextStart: string;
  nextEnd: string;
  autoCascade?: boolean;
}

export interface RescheduleResult {
  tasks: Task[];
  movedTask: Task | null;
  cascadedTaskIds: number[];
}

export interface CriticalPathResult {
  criticalTaskIds: Set<number>;
  criticalEdgeKeys: Set<string>;
  projectStartISO: string | null;
  projectEndISO: string | null;
  projectDurationDays: number;
  slackByTaskId: Map<number, number>;
}

/**
 * Adds whole calendar days to an ISO `YYYY-MM-DD` date safely in UTC (immune to DST shifts).
 */
export function addDaysISO(isoDate: string, deltaDays: number): string {
  const parsed = parseISODate(isoDate);
  const utc = new Date(
    Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate() + Math.round(deltaDays), 12),
  );
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const d = String(utc.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function diffDaysISO(startISO: string, endISO: string): number {
  return daysBetween(parseISODate(startISO), parseISODate(endISO));
}

export function getInclusiveDurationDays(startISO: string, endISO: string): number {
  return Math.max(1, diffDaysISO(startISO, endISO) + 1);
}

function shiftSubtreeDates(tasks: readonly Task[], deltaDays: number): Task[] {
  if (deltaDays === 0) return tasks.map((t) => ({ ...t }));
  return tasks.map((task) => {
    const nextStart = addDaysISO(task.start, deltaDays);
    const nextEnd = addDaysISO(task.end, deltaDays);
    return {
      ...task,
      start: nextStart,
      end: nextEnd,
      isDeadline: nextStart === nextEnd,
      children: task.children?.length ? shiftSubtreeDates(task.children, deltaDays) : [],
    };
  });
}

function syncAncestorEnvelopes(tasks: readonly Task[], dirtyIds: ReadonlySet<number>): {
  tasks: Task[];
  hasDirty: boolean;
} {
  let anyDirty = false;

  const mapped = tasks.map((task) => {
    const selfDirty = dirtyIds.has(task.id);
    if (!task.children || task.children.length === 0) {
      if (selfDirty) anyDirty = true;
      return task;
    }

    const childResult = syncAncestorEnvelopes(task.children, dirtyIds);
    if (childResult.hasDirty) {
      anyDirty = true;
      // Fit parent envelope to encompass its updated children
      let minStart = childResult.tasks[0]!.start;
      let maxEnd = childResult.tasks[0]!.end;
      for (const child of childResult.tasks) {
        if (diffDaysISO(minStart, child.start) < 0) minStart = child.start;
        if (diffDaysISO(maxEnd, child.end) > 0) maxEnd = child.end;
      }
      return {
        ...task,
        start: minStart,
        end: maxEnd,
        isDeadline: minStart === maxEnd,
        children: childResult.tasks,
      };
    }

    if (selfDirty) anyDirty = true;
    return { ...task, children: childResult.tasks };
  });

  return { tasks: mapped, hasDirty: anyDirty };
}

function mapTasksById(tasks: readonly Task[]): Map<number, Task> {
  const map = new Map<number, Task>();
  const walk = (list: readonly Task[]) => {
    for (const t of list) {
      map.set(t.id, t);
      if (t.children?.length) walk(t.children);
    }
  };
  walk(tasks);
  return map;
}

function applyTaskShiftInTree(
  tasks: readonly Task[],
  taskId: number,
  deltaDays: number,
): Task[] {
  return tasks.map((task) => {
    if (task.id === taskId) {
      const nextStart = addDaysISO(task.start, deltaDays);
      const nextEnd = addDaysISO(task.end, deltaDays);
      return {
        ...task,
        start: nextStart,
        end: nextEnd,
        isDeadline: nextStart === nextEnd,
        children: task.children?.length ? shiftSubtreeDates(task.children, deltaDays) : [],
      };
    }
    if (task.children?.length) {
      return {
        ...task,
        children: applyTaskShiftInTree(task.children, taskId, deltaDays),
      };
    }
    return task;
  });
}

/**
 * Reschedules a task (move or edge-resize), keeps parent phase envelopes accurate,
 * and optionally auto-cascades downstream dependent tasks forward when a blocker pushes past them.
 */
export function rescheduleTaskInTree(
  tasks: readonly Task[],
  params: RescheduleTaskParams,
): RescheduleResult {
  const { taskId, autoCascade = false } = params;
  const originalMap = mapTasksById(tasks);
  const originalTarget = originalMap.get(taskId);
  if (!originalTarget) {
    return { tasks: sanitizeTaskTree(tasks), movedTask: null, cascadedTaskIds: [] };
  }

  // Normalize so start <= end
  const nextStart = params.nextStart;
  const nextEnd = diffDaysISO(nextStart, params.nextEnd) < 0 ? nextStart : params.nextEnd;

  const startDelta = diffDaysISO(originalTarget.start, nextStart);
  const oldDuration = getInclusiveDurationDays(originalTarget.start, originalTarget.end);
  const newDuration = getInclusiveDurationDays(nextStart, nextEnd);
  const isPureMove = startDelta !== 0 && oldDuration === newDuration;

  const applyPrimaryUpdate = (list: readonly Task[]): Task[] =>
    list.map((task) => {
      if (task.id === taskId) {
        return {
          ...task,
          start: nextStart,
          end: nextEnd,
          isDeadline: nextStart === nextEnd,
          children:
            isPureMove && task.children?.length
              ? shiftSubtreeDates(task.children, startDelta)
              : task.children ?? [],
        };
      }
      if (task.children?.length) {
        return { ...task, children: applyPrimaryUpdate(task.children) };
      }
      return task;
    });

  let workingTree = applyPrimaryUpdate(tasks);
  const dirtyIds = new Set<number>([taskId]);
  workingTree = syncAncestorEnvelopes(workingTree, dirtyIds).tasks;

  const cascadedSet = new Set<number>();

  if (autoCascade) {
    // Build reverse dependency index: predId -> list of dependent task IDs
    const dependentsMap = new Map<number, number[]>();
    for (const task of originalMap.values()) {
      for (const depId of task.dependencies ?? []) {
        const list = dependentsMap.get(depId);
        if (list) list.push(task.id);
        else dependentsMap.set(depId, [task.id]);
      }
    }

    // Seed BFS with every task whose end date moved later (target, shifted children, expanded ancestors)
    let currentMap = mapTasksById(workingTree);
    const queue: number[] = [];
    for (const [id, cur] of currentMap.entries()) {
      const prev = originalMap.get(id);
      if (prev && diffDaysISO(prev.end, cur.end) > 0) {
        queue.push(id);
      }
    }

    const maxIterations = Math.max(20, originalMap.size * 6);
    let iterations = 0;

    while (queue.length > 0 && iterations < maxIterations) {
      iterations += 1;
      const predId = queue.shift()!;
      const prevPred = originalMap.get(predId);
      const currPred = currentMap.get(predId);
      if (!prevPred || !currPred) continue;

      const dependentIds = dependentsMap.get(predId);
      if (!dependentIds?.length) continue;

      for (const depId of dependentIds) {
        if (depId === taskId) continue; // Avoid cyclic self-push
        const prevDep = originalMap.get(depId);
        const currDep = currentMap.get(depId);
        if (!prevDep || !currDep) continue;

        // Preserve original handoff convention: same-day handoff stays same-day; strict next-day stays next-day
        const hadStrictNextDayGap = diffDaysISO(prevPred.end, prevDep.start) >= 1;
        const minAllowedStart = hadStrictNextDayGap
          ? addDaysISO(currPred.end, 1)
          : currPred.end;

        const neededShift = diffDaysISO(currDep.start, minAllowedStart);
        if (neededShift > 0) {
          workingTree = applyTaskShiftInTree(workingTree, depId, neededShift);
          workingTree = syncAncestorEnvelopes(workingTree, new Set([depId])).tasks;
          cascadedSet.add(depId);

          const refreshedMap = mapTasksById(workingTree);
          for (const [id, nextNode] of refreshedMap.entries()) {
            const beforeNode = currentMap.get(id);
            if (beforeNode && diffDaysISO(beforeNode.end, nextNode.end) > 0) {
              queue.push(id);
            }
          }
          currentMap = refreshedMap;
        }
      }
    }
  }

  const sanitized = sanitizeTaskTree(workingTree);
  const finalMap = mapTasksById(sanitized);

  return {
    tasks: sanitized,
    movedTask: finalMap.get(taskId) ?? null,
    cascadedTaskIds: Array.from(cascadedSet),
  };
}

/**
 * Computes Critical Path Method (CPM) forward/backward passes across all tasks and dependencies.
 * Cycle-safe, supports both strict next-day and same-day Finish-to-Start handoffs, and gracefully
 * highlights finish-driving tasks even when no explicit dependencies are drawn yet.
 */
export function computeCriticalPath(tasks: readonly Task[]): CriticalPathResult {
  const flat = flattenTasks(tasks).filter((t) => Boolean(t.start && t.end));
  if (flat.length === 0) {
    return {
      criticalTaskIds: new Set(),
      criticalEdgeKeys: new Set(),
      projectStartISO: null,
      projectEndISO: null,
      projectDurationDays: 0,
      slackByTaskId: new Map(),
    };
  }

  let projectStartISO = flat[0]!.start;
  let projectEndISO = flat[0]!.end;
  for (const t of flat) {
    if (diffDaysISO(projectStartISO, t.start) < 0) projectStartISO = t.start;
    if (diffDaysISO(projectEndISO, t.end) > 0) projectEndISO = t.end;
  }

  const nodeById = new Map<number, {
    id: number;
    schedStart: number;
    schedEnd: number;
    duration: number;
  }>();

  for (const t of flat) {
    const schedStart = diffDaysISO(projectStartISO, t.start);
    const schedEnd = Math.max(schedStart, diffDaysISO(projectStartISO, t.end));
    nodeById.set(t.id, {
      id: t.id,
      schedStart,
      schedEnd,
      duration: schedEnd - schedStart + 1,
    });
  }

  // Build adjacency & in-degrees (ignore self-loops and missing IDs)
  const preds = new Map<number, number[]>();
  const succs = new Map<number, number[]>();
  const inDegree = new Map<number, number>();

  for (const id of nodeById.keys()) {
    preds.set(id, []);
    succs.set(id, []);
    inDegree.set(id, 0);
  }

  for (const t of flat) {
    for (const depId of t.dependencies ?? []) {
      if (depId === t.id || !nodeById.has(depId)) continue;
      if (preds.get(t.id)!.includes(depId)) continue;
      preds.get(t.id)!.push(depId);
      succs.get(depId)!.push(t.id);
      inDegree.set(t.id, (inDegree.get(t.id) ?? 0) + 1);
    }
  }

  // Kahn's topological sort (cycle-safe fallback appends any remaining cyclic nodes in order)
  const topo: number[] = [];
  const queue: number[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }
  while (queue.length > 0) {
    const u = queue.shift()!;
    topo.push(u);
    for (const v of succs.get(u) ?? []) {
      const nextDeg = (inDegree.get(v) ?? 1) - 1;
      inDegree.set(v, nextDeg);
      if (nextDeg === 0) queue.push(v);
    }
  }
  const inTopo = new Set(topo);
  for (const id of nodeById.keys()) {
    if (!inTopo.has(id)) topo.push(id);
  }

  const topoIndex = new Map<number, number>();
  topo.forEach((id, idx) => topoIndex.set(id, idx));

  // Filter strictly DAG edges (u before v in topo order) to stay 100% cycle-safe
  const dagPreds = new Map<number, number[]>();
  const dagSuccs = new Map<number, number[]>();
  for (const id of topo) {
    dagPreds.set(id, []);
    dagSuccs.set(id, []);
  }
  for (const u of topo) {
    for (const v of succs.get(u) ?? []) {
      if ((topoIndex.get(u) ?? 0) < (topoIndex.get(v) ?? 0)) {
        dagSuccs.get(u)!.push(v);
        dagPreds.get(v)!.push(u);
      }
    }
  }

  // Handoff gap matches user's scheduled convention: same-day handoff = 0, strict next-day = 1
  const handoffGap = (predId: number, succId: number): number => {
    const p = nodeById.get(predId)!;
    const s = nodeById.get(succId)!;
    return s.schedStart > p.schedEnd ? 1 : 0;
  };

  // Forward pass (early start / early finish)
  const es = new Map<number, number>();
  const ef = new Map<number, number>();
  let projectFinish = 0;

  for (const u of topo) {
    const node = nodeById.get(u)!;
    let earlyStart = node.schedStart;
    for (const p of dagPreds.get(u)!) {
      const candidate = (ef.get(p) ?? 0) + handoffGap(p, u);
      if (candidate > earlyStart) earlyStart = candidate;
    }
    const earlyFinish = earlyStart + node.duration - 1;
    es.set(u, earlyStart);
    ef.set(u, earlyFinish);
    if (earlyFinish > projectFinish) projectFinish = earlyFinish;
  }

  // Backward pass (late start / late finish)
  const ls = new Map<number, number>();
  const lf = new Map<number, number>();

  for (let i = topo.length - 1; i >= 0; i--) {
    const u = topo[i]!;
    const node = nodeById.get(u)!;
    const outgoing = dagSuccs.get(u)!;
    let lateFinish = projectFinish;
    if (outgoing.length > 0) {
      lateFinish = Math.min(
        ...outgoing.map((v) => (ls.get(v) ?? projectFinish) - handoffGap(u, v)),
      );
    }
    const lateStart = lateFinish - (node.duration - 1);
    lf.set(u, lateFinish);
    ls.set(u, lateStart);
  }

  const slackByTaskId = new Map<number, number>();
  const criticalTaskIds = new Set<number>();

  for (const u of topo) {
    const slack = (ls.get(u) ?? 0) - (es.get(u) ?? 0);
    slackByTaskId.set(u, slack);
    if (slack <= 0) {
      criticalTaskIds.add(u);
    }
  }

  const criticalEdgeKeys = new Set<string>();
  for (const u of topo) {
    if (!criticalTaskIds.has(u)) continue;
    for (const v of dagSuccs.get(u)!) {
      if (!criticalTaskIds.has(v)) continue;
      const tight = (ef.get(u) ?? 0) + handoffGap(u, v) >= (ls.get(v) ?? 0);
      if (tight) {
        criticalEdgeKeys.add(`${u}->${v}`);
      }
    }
  }

  return {
    criticalTaskIds,
    criticalEdgeKeys,
    projectStartISO,
    projectEndISO,
    projectDurationDays: projectFinish + 1,
    slackByTaskId,
  };
}

/**
 * Freezes a lightweight Planned Baseline snapshot of every task's current start/end dates.
 */
export function createWorkspaceBaseline(
  tasks: readonly Task[],
  savedAtISO = new Date().toISOString(),
): WorkspaceBaseline {
  const entries: Record<number, TaskBaselineEntry> = {};
  for (const task of flattenTasks(tasks)) {
    if (task.start && task.end) {
      entries[task.id] = { start: task.start, end: task.end };
    }
  }
  return {
    savedAt: savedAtISO,
    entries,
  };
}

/**
 * Returns schedule slip in days vs baseline (`> 0` = behind plan, `< 0` = ahead, `0` = on track).
 */
export function computeTaskBaselineSlipDays(
  task: Pick<Task, 'id' | 'end'>,
  baseline?: WorkspaceBaseline | null,
): number | null {
  if (!baseline || !task.end) return null;
  const entry = baseline.entries[task.id];
  if (!entry?.end) return null;
  return diffDaysISO(entry.end, task.end);
}
