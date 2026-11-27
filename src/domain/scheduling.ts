import type { Task, TaskBaselineEntry, WorkspaceBaseline } from '@/types';
import { flattenTasks, sanitizeTaskTree } from './taskTree';
import { daysBetween, parseISODate } from './timeline';

export interface RescheduleTaskParams {
  taskId: number;
  nextStart: string;
  nextEnd: string;
  autoCascade?: boolean;
}

export type ScheduleDragMode = 'move' | 'resize-start' | 'resize-end';

export interface TaskDateBounds {
  /** Earliest allowed start date (for subtasks, the parent task's start date). */
  minStart?: string;
  /** Latest allowed end date (for subtasks, the parent task's end date). */
  maxEnd?: string;
  /** Latest allowed start date when edge-resizing a parent without shifting children. */
  maxResizeStart?: string;
  /** Earliest allowed end date when edge-resizing a parent without shifting children. */
  minResizeEnd?: string;
}

export interface ClampedDragResult {
  nextStart: string;
  nextEnd: string;
  clampedBy: 'parent' | 'child' | null;
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

function isBeforeISO(a: string, b: string): boolean {
  return diffDaysISO(a, b) > 0;
}

function isAfterISO(a: string, b: string): boolean {
  return diffDaysISO(b, a) > 0;
}

export function clampDateISO(iso: string, minISO?: string, maxISO?: string): string {
  let result = iso;
  if (minISO && isBeforeISO(result, minISO)) result = minISO;
  if (maxISO && isAfterISO(result, maxISO)) result = maxISO;
  return result;
}

function getDescendantSpan(children: readonly Task[]): { minStart: string; maxEnd: string } | null {
  if (!children.length) return null;
  let minStart = children[0]!.start;
  let maxEnd = children[0]!.end;

  const walk = (list: readonly Task[]) => {
    for (const child of list) {
      if (isBeforeISO(child.start, minStart)) minStart = child.start;
      if (isAfterISO(child.end, maxEnd)) maxEnd = child.end;
      if (child.children?.length) walk(child.children);
    }
  };
  walk(children);
  return { minStart, maxEnd };
}

/**
 * Computes date-boundary constraints for every task in the tree:
 * - Subtasks are bounded strictly inside their parent task's [start, end] range.
 * - Parent tasks cannot be edge-resized narrower than their existing subtasks.
 */
export function computeTaskDateBoundsMap(tasks: readonly Task[]): Map<number, TaskDateBounds> {
  const map = new Map<number, TaskDateBounds>();

  const walk = (list: readonly Task[], parent: Task | null) => {
    for (const task of list) {
      const bounds: TaskDateBounds = {};
      if (parent) {
        bounds.minStart = parent.start;
        bounds.maxEnd = parent.end;
      }
      if (task.children?.length) {
        const span = getDescendantSpan(task.children);
        if (span) {
          bounds.maxResizeStart = span.minStart;
          bounds.minResizeEnd = span.maxEnd;
        }
      }
      if (
        bounds.minStart !== undefined ||
        bounds.maxEnd !== undefined ||
        bounds.maxResizeStart !== undefined ||
        bounds.minResizeEnd !== undefined
      ) {
        map.set(task.id, bounds);
      }
      if (task.children?.length) {
        walk(task.children, task);
      }
    }
  };

  walk(tasks, null);
  return map;
}

/**
 * Computes clamped [nextStart, nextEnd] dates for a bar move or edge resize, enforcing:
 * - Minimum 1-day duration (`start <= end`)
 * - Subtask containment inside `[bounds.minStart, bounds.maxEnd]`
 * - Parent containment around existing children when edge-resizing
 */
export function computeClampedDragDates(params: {
  mode: ScheduleDragMode;
  origStart: string;
  origEnd: string;
  deltaDays: number;
  bounds?: TaskDateBounds;
}): ClampedDragResult {
  const { mode, origStart, origEnd, deltaDays, bounds } = params;

  if (mode === 'move') {
    const unclampedStart = addDaysISO(origStart, deltaDays);
    const unclampedEnd = addDaysISO(origEnd, deltaDays);

    if (bounds?.minStart && bounds?.maxEnd) {
      const duration = getInclusiveDurationDays(origStart, origEnd);
      const parentDuration = getInclusiveDurationDays(bounds.minStart, bounds.maxEnd);

      let nextStart: string;
      let nextEnd: string;
      if (duration >= parentDuration) {
        nextStart = bounds.minStart;
        nextEnd = bounds.maxEnd;
      } else {
        const latestStart = addDaysISO(bounds.maxEnd, -(duration - 1));
        nextStart = clampDateISO(unclampedStart, bounds.minStart, latestStart);
        nextEnd = addDaysISO(nextStart, duration - 1);
      }

      return {
        nextStart,
        nextEnd,
        clampedBy: nextStart !== unclampedStart || nextEnd !== unclampedEnd ? 'parent' : null,
      };
    }

    return { nextStart: unclampedStart, nextEnd: unclampedEnd, clampedBy: null };
  }

  if (mode === 'resize-start') {
    const candidate = addDaysISO(origStart, deltaDays);
    let nextStart = isAfterISO(candidate, origEnd) ? origEnd : candidate;
    let clampedBy: 'parent' | 'child' | null = null;

    if (bounds?.minStart) {
      const boundedMin = isAfterISO(bounds.minStart, origEnd) ? origEnd : bounds.minStart;
      if (isBeforeISO(nextStart, boundedMin)) {
        nextStart = boundedMin;
        clampedBy = 'parent';
      }
    }

    if (bounds?.maxResizeStart && !isAfterISO(origStart, bounds.maxResizeStart)) {
      const boundedMax = isBeforeISO(bounds.maxResizeStart, origEnd)
        ? bounds.maxResizeStart
        : origEnd;
      if (isAfterISO(nextStart, boundedMax)) {
        nextStart = boundedMax;
        clampedBy = 'child';
      }
    }

    return { nextStart, nextEnd: origEnd, clampedBy };
  }

  // mode === 'resize-end'
  const candidate = addDaysISO(origEnd, deltaDays);
  let nextEnd = isBeforeISO(candidate, origStart) ? origStart : candidate;
  let clampedBy: 'parent' | 'child' | null = null;

  if (bounds?.maxEnd) {
    const boundedMax = isBeforeISO(bounds.maxEnd, origStart) ? origStart : bounds.maxEnd;
    if (isAfterISO(nextEnd, boundedMax)) {
      nextEnd = boundedMax;
      clampedBy = 'parent';
    }
  }

  if (bounds?.minResizeEnd && !isBeforeISO(origEnd, bounds.minResizeEnd)) {
    const boundedMin = isAfterISO(bounds.minResizeEnd, origStart)
      ? bounds.minResizeEnd
      : origStart;
    if (isBeforeISO(nextEnd, boundedMin)) {
      nextEnd = boundedMin;
      clampedBy = 'child';
    }
  }

  return { nextStart: origStart, nextEnd, clampedBy };
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
 * Reschedules a task (move or edge-resize) while strictly preserving parent/child bounds:
 * - Subtasks stay clamped inside their parent's [start, end] range and never mutate parent dates.
 * - Moving a parent shifts all its descendants together; resizing a parent cannot cut off children.
 * - Optionally auto-cascades downstream dependent tasks forward (also respecting parent bounds).
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

  const boundsMap = computeTaskDateBoundsMap(tasks);
  const targetBounds = boundsMap.get(taskId);

  // Normalize so rawStart <= rawEnd
  const rawStart = params.nextStart;
  const rawEnd = isBeforeISO(params.nextEnd, rawStart) ? rawStart : params.nextEnd;

  const rawStartDelta = diffDaysISO(originalTarget.start, rawStart);
  const rawEndDelta = diffDaysISO(originalTarget.end, rawEnd);
  const oldDuration = getInclusiveDurationDays(originalTarget.start, originalTarget.end);
  const newDuration = getInclusiveDurationDays(rawStart, rawEnd);
  const isPureMove = rawStartDelta !== 0 && oldDuration === newDuration;
  const isResizeStart = rawStartDelta !== 0 && rawEndDelta === 0;
  const isResizeEnd = rawStartDelta === 0 && rawEndDelta !== 0;

  let nextStart = rawStart;
  let nextEnd = rawEnd;

  if (isPureMove) {
    const clamped = computeClampedDragDates({
      mode: 'move',
      origStart: originalTarget.start,
      origEnd: originalTarget.end,
      deltaDays: rawStartDelta,
      bounds: targetBounds,
    });
    nextStart = clamped.nextStart;
    nextEnd = clamped.nextEnd;
  } else if (isResizeStart) {
    const clamped = computeClampedDragDates({
      mode: 'resize-start',
      origStart: originalTarget.start,
      origEnd: originalTarget.end,
      deltaDays: rawStartDelta,
      bounds: targetBounds,
    });
    nextStart = clamped.nextStart;
    nextEnd = clamped.nextEnd;
  } else if (isResizeEnd) {
    const clamped = computeClampedDragDates({
      mode: 'resize-end',
      origStart: originalTarget.start,
      origEnd: originalTarget.end,
      deltaDays: rawEndDelta,
      bounds: targetBounds,
    });
    nextStart = clamped.nextStart;
    nextEnd = clamped.nextEnd;
  } else {
    // Programmatic dual-edge edit: clamp both ends into parent & child bounds
    nextStart = clampDateISO(rawStart, targetBounds?.minStart, targetBounds?.maxEnd);
    nextEnd = clampDateISO(rawEnd, targetBounds?.minStart, targetBounds?.maxEnd);
    if (
      targetBounds?.maxResizeStart &&
      !isAfterISO(originalTarget.start, targetBounds.maxResizeStart) &&
      isAfterISO(nextStart, targetBounds.maxResizeStart)
    ) {
      nextStart = targetBounds.maxResizeStart;
    }
    if (
      targetBounds?.minResizeEnd &&
      !isBeforeISO(originalTarget.end, targetBounds.minResizeEnd) &&
      isBeforeISO(nextEnd, targetBounds.minResizeEnd)
    ) {
      nextEnd = targetBounds.minResizeEnd;
    }
    if (isBeforeISO(nextEnd, nextStart)) {
      nextEnd = nextStart;
    }
  }

  const appliedStartDelta = diffDaysISO(originalTarget.start, nextStart);
  const appliedEndDelta = diffDaysISO(originalTarget.end, nextEnd);

  if (appliedStartDelta === 0 && appliedEndDelta === 0) {
    return { tasks: sanitizeTaskTree(tasks), movedTask: null, cascadedTaskIds: [] };
  }

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
              ? shiftSubtreeDates(task.children, appliedStartDelta)
              : task.children ?? [],
        };
      }
      if (task.children?.length) {
        return { ...task, children: applyPrimaryUpdate(task.children) };
      }
      return task;
    });

  let workingTree = applyPrimaryUpdate(tasks);

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

    // Seed BFS with every task whose end date moved later (target & any shifted children)
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
          // Never push a dependent subtask past its parent task's end date
          const depParent =
            currDep.parentId != null ? currentMap.get(currDep.parentId) : undefined;
          const maxShift = depParent ? diffDaysISO(currDep.end, depParent.end) : neededShift;
          const appliedShift = Math.min(neededShift, maxShift);

          if (appliedShift > 0) {
            workingTree = applyTaskShiftInTree(workingTree, depId, appliedShift);
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
