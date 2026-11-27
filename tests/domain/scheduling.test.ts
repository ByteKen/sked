import { describe, expect, it } from 'vitest';
import {
  addDaysISO,
  computeCriticalPath,
  computeTaskBaselineSlipDays,
  createWorkspaceBaseline,
  rescheduleTaskInTree,
} from '@/domain/scheduling';
import type { Task } from '@/types';

const chainTasks: Task[] = [
  {
    id: 1,
    name: 'Phase A: Spec',
    start: '2026-11-01',
    end: '2026-11-05',
    progress: 100,
    children: [
      {
        id: 2,
        name: 'Draft Spec',
        start: '2026-11-01',
        end: '2026-11-03',
        progress: 100,
        parentId: 1,
      },
      {
        id: 3,
        name: 'Review Spec',
        start: '2026-11-04',
        end: '2026-11-05',
        progress: 100,
        parentId: 1,
      },
    ],
  },
  {
    id: 4,
    name: 'Phase B: Build',
    start: '2026-11-06',
    end: '2026-11-12',
    progress: 40,
    dependencies: [1],
    children: [
      {
        id: 5,
        name: 'API Setup',
        start: '2026-11-06',
        end: '2026-11-09',
        progress: 80,
        parentId: 4,
      },
      {
        id: 6,
        name: 'UI Polish',
        start: '2026-11-10',
        end: '2026-11-12',
        progress: 0,
        parentId: 4,
      },
    ],
  },
  {
    id: 7,
    name: 'Phase C: Launch',
    start: '2026-11-13',
    end: '2026-11-15',
    progress: 0,
    dependencies: [4],
  },
  {
    id: 8,
    name: 'Parallel Docs',
    start: '2026-11-01',
    end: '2026-11-04',
    progress: 50,
    dependencies: [],
  },
];

describe('scheduling domain engine (reschedule, cascade, CPM, baselines)', () => {
  it('shifts ISO calendar dates cleanly across month and leap-year boundaries', () => {
    expect(addDaysISO('2026-11-28', 5)).toBe('2026-12-03');
    expect(addDaysISO('2028-02-28', 2)).toBe('2028-03-01');
    expect(addDaysISO('2026-01-02', -3)).toBe('2025-12-30');
  });

  it('moves a parent phase together with its children and auto-cascades dependent phases cleanly', () => {
    const result = rescheduleTaskInTree(chainTasks, {
      taskId: 1,
      nextStart: '2026-11-04',
      nextEnd: '2026-11-08',
      autoCascade: true,
    });

    expect(result.movedTask?.start).toBe('2026-11-04');
    expect(result.movedTask?.end).toBe('2026-11-08');
    // Children of Phase A shifted +3 days
    expect(result.tasks[0]!.children![0]!.start).toBe('2026-11-04');
    expect(result.tasks[0]!.children![1]!.end).toBe('2026-11-08');

    // Dependent Phase B & its children cascaded +3 days
    expect(result.cascadedTaskIds).toContain(4);
    expect(result.cascadedTaskIds).toContain(7);
    expect(result.tasks[1]!.start).toBe('2026-11-09');
    expect(result.tasks[1]!.end).toBe('2026-11-15');
    expect(result.tasks[1]!.children![0]!.start).toBe('2026-11-09');
    expect(result.tasks[1]!.children![1]!.end).toBe('2026-11-15');

    // Downstream Phase C also cascaded +3 days
    expect(result.tasks[2]!.start).toBe('2026-11-16');
    expect(result.tasks[2]!.end).toBe('2026-11-18');

    // Independent Parallel Docs stays untouched
    expect(result.tasks[3]!.start).toBe('2026-11-01');
    expect(result.tasks[3]!.end).toBe('2026-11-04');
  });

  it('expands parent envelope when a subtask is extended and leaves dependents untouched when autoCascade is false', () => {
    const result = rescheduleTaskInTree(chainTasks, {
      taskId: 3,
      nextStart: '2026-11-04',
      nextEnd: '2026-11-09',
      autoCascade: false,
    });

    expect(result.tasks[0]!.end).toBe('2026-11-09');
    expect(result.cascadedTaskIds).toHaveLength(0);
    expect(result.tasks[1]!.start).toBe('2026-11-06');
  });

  it('computes Critical Path tasks, critical edges, and positive slack for non-critical branches', () => {
    const cpm = computeCriticalPath(chainTasks);

    expect(cpm.projectStartISO).toBe('2026-11-01');
    expect(cpm.projectEndISO).toBe('2026-11-15');
    expect(cpm.projectDurationDays).toBe(15);

    // Phase A -> Phase B -> Phase C form the zero-slack critical path
    expect(cpm.criticalTaskIds.has(1)).toBe(true);
    expect(cpm.criticalTaskIds.has(4)).toBe(true);
    expect(cpm.criticalTaskIds.has(7)).toBe(true);
    expect(cpm.criticalEdgeKeys.has('1->4')).toBe(true);
    expect(cpm.criticalEdgeKeys.has('4->7')).toBe(true);

    // Parallel Docs finishes Nov 4 vs Nov 15 project end -> 11 days slack, NOT critical
    expect(cpm.criticalTaskIds.has(8)).toBe(false);
    expect(cpm.slackByTaskId.get(8)).toBe(11);
  });

  it('handles cyclic dependencies safely without infinite recursion', () => {
    const cyclic: Task[] = [
      { id: 1, name: 'A', start: '2026-11-01', end: '2026-11-05', progress: 0, dependencies: [2] },
      { id: 2, name: 'B', start: '2026-11-06', end: '2026-11-10', progress: 0, dependencies: [1] },
    ];

    const cpm = computeCriticalPath(cyclic);
    expect(cpm.criticalTaskIds.size).toBeGreaterThanOrEqual(1);

    const moved = rescheduleTaskInTree(cyclic, {
      taskId: 1,
      nextStart: '2026-11-03',
      nextEnd: '2026-11-07',
      autoCascade: true,
    });
    expect(moved.movedTask?.end).toBe('2026-11-07');
    expect(moved.tasks[1]!.start).toBe('2026-11-08');
  });

  it('snapshots workspace baselines and computes positive/negative slip days accurately', () => {
    const baseline = createWorkspaceBaseline(chainTasks, '2026-11-01T00:00:00Z');
    expect(baseline.entries[1]).toEqual({ start: '2026-11-01', end: '2026-11-05' });
    expect(baseline.entries[7]).toEqual({ start: '2026-11-13', end: '2026-11-15' });

    expect(computeTaskBaselineSlipDays({ id: 7, end: '2026-11-15' }, baseline)).toBe(0);
    expect(computeTaskBaselineSlipDays({ id: 7, end: '2026-11-18' }, baseline)).toBe(3);
    expect(computeTaskBaselineSlipDays({ id: 7, end: '2026-11-13' }, baseline)).toBe(-2);
    expect(computeTaskBaselineSlipDays({ id: 999, end: '2026-11-20' }, baseline)).toBeNull();
  });
});
