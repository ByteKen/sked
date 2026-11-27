import { describe, expect, it } from 'vitest';
import {
  buildDraftDefaultsForStatus,
  enrichTaskTreeForViews,
  extractPhaseFilterOptions,
  getTaskDueUrgency,
  groupTasksForBoard,
  setTaskStatusInTree,
  sortTaskItemsForList,
} from '@/domain/taskViews';
import type { Task, WorkspaceBaseline } from '@/types';

const sampleTasks: Task[] = [
  {
    id: 1,
    name: 'Phase 1: Build',
    start: '2026-05-01',
    end: '2026-05-20',
    progress: 50,
    children: [
      {
        id: 2,
        name: 'API Schema',
        start: '2026-05-01',
        end: '2026-05-05',
        progress: 100,
        isDone: true,
        parentId: 1,
      },
      {
        id: 3,
        name: 'Auth Endpoints',
        start: '2026-05-06',
        end: '2026-05-12',
        progress: 40,
        isWorking: true,
        parentId: 1,
        dependencies: [2],
      },
      {
        id: 4,
        name: 'QA Integration',
        start: '2026-05-13',
        end: '2026-05-20',
        progress: 0,
        parentId: 1,
        dependencies: [3],
      },
    ],
  },
  {
    id: 5,
    name: 'Release Announcement',
    start: '2026-05-21',
    end: '2026-05-25',
    progress: 25,
    dependencies: [1],
  },
];

const baselineFixture: WorkspaceBaseline = {
  savedAt: '2026-04-20T00:00:00Z',
  entries: {
    3: { start: '2026-05-06', end: '2026-05-10' },
  },
};

describe('taskViews pure domain helpers', () => {
  it('computes accurate due urgency relative to local today ISO', () => {
    expect(getTaskDueUrgency({ end: '2026-05-05', progress: 100, isDone: true }, '2026-05-10')).toEqual({
      urgency: 'completed',
      daysUntilDue: -5,
    });
    expect(getTaskDueUrgency({ end: '2026-05-08', progress: 20 }, '2026-05-10')).toEqual({
      urgency: 'overdue',
      daysUntilDue: -2,
    });
    expect(getTaskDueUrgency({ end: '2026-05-10', progress: 50 }, '2026-05-10')).toEqual({
      urgency: 'today',
      daysUntilDue: 0,
    });
    expect(getTaskDueUrgency({ end: '2026-05-12', progress: 0 }, '2026-05-10')).toEqual({
      urgency: 'soon',
      daysUntilDue: 2,
    });
    expect(getTaskDueUrgency({ end: '2026-05-25', progress: 0 }, '2026-05-10')).toEqual({
      urgency: 'upcoming',
      daysUntilDue: 15,
    });
  });

  it('enriches tasks with parent breadcrumbs, blocker counts, baseline slip, and critical path', () => {
    const items = enrichTaskTreeForViews(sampleTasks, {
      todayISO: '2026-05-11',
      baseline: baselineFixture,
    });

    const auth = items.find((i) => i.task.id === 3)!;
    expect(auth.parentName).toBe('Phase 1: Build');
    expect(auth.rootPhaseId).toBe(1);
    expect(auth.blockedByIncompleteCount).toBe(0); // Dep 2 is complete
    expect(auth.slipDays).toBe(2); // 05-12 vs 05-10
    expect(auth.dueUrgency).toBe('soon');

    const qa = items.find((i) => i.task.id === 4)!;
    expect(qa.blockedByIncompleteCount).toBe(1); // Dep 3 is incomplete
    expect(qa.durationDays).toBe(8);

    const phases = extractPhaseFilterOptions(items);
    expect(phases).toEqual([
      { id: 1, name: 'Phase 1: Build', taskCount: 3 },
      { id: 5, name: 'Release Announcement', taskCount: 1 },
    ]);
  });

  it('groups actionable leaf tasks into Kanban columns by default and supports phase filtering', () => {
    const items = enrichTaskTreeForViews(sampleTasks, { todayISO: '2026-05-11' });

    const defaultBoard = groupTasksForBoard(items);
    // Parent phase (id: 1) is excluded by default so cards don't fight subtask rollups
    expect(defaultBoard['not-started'].map((i) => i.task.id)).toEqual([4]);
    expect(defaultBoard.working.map((i) => i.task.id)).toEqual([3]);
    expect(defaultBoard['in-progress'].map((i) => i.task.id)).toEqual([5]);
    expect(defaultBoard.completed.map((i) => i.task.id)).toEqual([2]);

    const phaseFiltered = groupTasksForBoard(items, { phaseId: 5 });
    expect(phaseFiltered['in-progress'].map((i) => i.task.id)).toEqual([5]);
    expect(phaseFiltered.completed).toHaveLength(0);

    const withPhases = groupTasksForBoard(items, { includePhases: true });
    expect(withPhases.working.map((i) => i.task.id)).toContain(1); // Phase 1 has working child 3
  });

  it('sorts list items cleanly by due date, progress, and status while preserving tree order when selected', () => {
    const items = enrichTaskTreeForViews(sampleTasks, { todayISO: '2026-05-11' });

    const treeOrder = sortTaskItemsForList(items, 'tree', 'asc');
    expect(treeOrder.map((i) => i.task.id)).toEqual([1, 2, 3, 4, 5]);

    const byProgressDesc = sortTaskItemsForList(items, 'progress', 'desc');
    expect(byProgressDesc[0]?.task.id).toBe(2); // 100%
    expect(byProgressDesc[byProgressDesc.length - 1]?.task.id).toBe(4); // 0%

    const byDueAsc = sortTaskItemsForList(items, 'end', 'asc');
    expect(byDueAsc[0]?.task.id).toBe(2); // 2026-05-05
    expect(byDueAsc[byDueAsc.length - 1]?.task.id).toBe(5); // 2026-05-25
  });

  it('transitions leaf tasks across all 4 statuses and recalculates parent phase progress', () => {
    // Move QA Integration (id: 4, 0%) -> in-progress -> gets 50% progress
    const step1 = setTaskStatusInTree(sampleTasks, 4, 'in-progress');
    expect(step1.updatedTask?.progress).toBe(50);
    expect(step1.updatedTask?.isWorking).toBe(false);

    // Move Auth Endpoints (id: 3) & QA (id: 4) -> completed -> parent phase hits 100%
    const step2 = setTaskStatusInTree(step1.tasks, 3, 'completed');
    const step3 = setTaskStatusInTree(step2.tasks, 4, 'completed');
    const phase1 = step3.tasks.find((t) => t.id === 1)!;
    expect(phase1.progress).toBe(100);
    expect(phase1.isDone).toBe(true);

    // Move entire parent phase back to not-started -> resets all children cleanly
    const step4 = setTaskStatusInTree(step3.tasks, 1, 'not-started');
    const resetPhase = step4.tasks.find((t) => t.id === 1)!;
    expect(resetPhase.progress).toBe(0);
    expect(resetPhase.children?.every((c) => c.progress === 0 && !c.isDone)).toBe(true);
  });

  it('provides consistent draft defaults for Kanban column quick-add', () => {
    expect(buildDraftDefaultsForStatus('not-started')).toEqual({
      progress: 0,
      isWorking: false,
      isDone: false,
    });
    expect(buildDraftDefaultsForStatus('working')).toEqual({
      progress: 25,
      isWorking: true,
      isDone: false,
    });
    expect(buildDraftDefaultsForStatus('in-progress')).toEqual({
      progress: 50,
      isWorking: false,
      isDone: false,
    });
    expect(buildDraftDefaultsForStatus('completed')).toEqual({
      progress: 100,
      isWorking: false,
      isDone: true,
    });
  });
});
