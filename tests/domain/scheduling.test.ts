import { describe, expect, it } from 'vitest';
import {
  addDaysISO,
  computeClampedDragDates,
  computeCriticalPath,
  computeTaskBaselineSlipDays,
  computeTaskDateBoundsMap,
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

  it('clamps subtask resizes and moves strictly inside its parent range without altering parent dates', () => {
    // Review Spec (id: 3) is Nov 4 – Nov 5 inside Phase A (Nov 1 – Nov 5).
    // Attempting to extend past Nov 5 clamps to Nov 5 (no-op) and leaves Phase A unchanged.
    const pastEnd = rescheduleTaskInTree(chainTasks, {
      taskId: 3,
      nextStart: '2026-11-04',
      nextEnd: '2026-11-09',
      autoCascade: true,
    });
    expect(pastEnd.movedTask).toBeNull();
    expect(pastEnd.tasks[0]!.start).toBe('2026-11-01');
    expect(pastEnd.tasks[0]!.end).toBe('2026-11-05');
    expect(pastEnd.tasks[0]!.children![1]!.end).toBe('2026-11-05');
    expect(pastEnd.cascadedTaskIds).toHaveLength(0);

    // Extending Draft Spec (id: 2, Nov 1 – Nov 3) past Phase A's Nov 5 clamps strictly to Nov 5
    // while leaving Phase A's [Nov 1, Nov 5] untouched.
    const clampedExtend = rescheduleTaskInTree(chainTasks, {
      taskId: 2,
      nextStart: '2026-11-01',
      nextEnd: '2026-11-10',
      autoCascade: false,
    });
    expect(clampedExtend.movedTask?.start).toBe('2026-11-01');
    expect(clampedExtend.movedTask?.end).toBe('2026-11-05');
    expect(clampedExtend.tasks[0]!.start).toBe('2026-11-01');
    expect(clampedExtend.tasks[0]!.end).toBe('2026-11-05');

    // Moving Review Spec (2 days: Nov 4 – Nov 5) earlier than Phase A's start clamps to Nov 1 – Nov 2
    const clampedEarlier = rescheduleTaskInTree(chainTasks, {
      taskId: 3,
      nextStart: '2026-10-28',
      nextEnd: '2026-10-29',
      autoCascade: false,
    });
    expect(clampedEarlier.movedTask?.start).toBe('2026-11-01');
    expect(clampedEarlier.movedTask?.end).toBe('2026-11-02');
    expect(clampedEarlier.tasks[0]!.start).toBe('2026-11-01');
    expect(clampedEarlier.tasks[0]!.end).toBe('2026-11-05');

    // Shrinking a subtask to a single day succeeds without shrinking its parent
    const singleDay = rescheduleTaskInTree(chainTasks, {
      taskId: 3,
      nextStart: '2026-11-04',
      nextEnd: '2026-11-04',
      autoCascade: false,
    });
    expect(singleDay.movedTask?.start).toBe('2026-11-04');
    expect(singleDay.movedTask?.end).toBe('2026-11-04');
    expect(singleDay.movedTask?.isDeadline).toBe(true);
    expect(singleDay.tasks[0]!.end).toBe('2026-11-05');
  });

  it('prevents edge-resizing a parent narrower than its subtasks while allowing full extension', () => {
    const bounds = computeTaskDateBoundsMap(chainTasks);
    // Phase A (Nov 1 – Nov 5) contains Nov 1 – Nov 5 children
    expect(bounds.get(1)).toEqual({
      maxResizeStart: '2026-11-01',
      minResizeEnd: '2026-11-05',
    });

    // Shrinking Phase A's end date to Nov 3 clamps to latest child end (Nov 5)
    const shrinkBlocked = computeClampedDragDates({
      mode: 'resize-end',
      origStart: '2026-11-01',
      origEnd: '2026-11-05',
      deltaDays: -2,
      bounds: bounds.get(1),
    });
    expect(shrinkBlocked).toEqual({
      nextStart: '2026-11-01',
      nextEnd: '2026-11-05',
      clampedBy: 'child',
    });

    // Extending Phase A's end date to Nov 8 works freely
    const extended = rescheduleTaskInTree(chainTasks, {
      taskId: 1,
      nextStart: '2026-11-01',
      nextEnd: '2026-11-08',
      autoCascade: false,
    });
    expect(extended.movedTask?.end).toBe('2026-11-08');
  });

  it('keeps auto-cascaded dependent subtasks inside their parent bounds without expanding the parent', () => {
    const nestedDeps: Task[] = [
      {
        id: 1,
        name: 'Phase 1',
        start: '2026-11-01',
        end: '2026-11-06',
        progress: 0,
        children: [
          { id: 2, name: 'Sub A', start: '2026-11-01', end: '2026-11-02', progress: 0, parentId: 1 },
          {
            id: 3,
            name: 'Sub B',
            start: '2026-11-03',
            end: '2026-11-04',
            progress: 0,
            parentId: 1,
            dependencies: [2],
          },
        ],
      },
    ];

    // Extend Sub A from Nov 2 to Nov 5 (within Phase 1 end Nov 6).
    // Sub B wants to shift +3d to Nov 6 – Nov 7, but clamps at +2d (Nov 5 – Nov 6) to stay inside Phase 1.
    const result = rescheduleTaskInTree(nestedDeps, {
      taskId: 2,
      nextStart: '2026-11-01',
      nextEnd: '2026-11-05',
      autoCascade: true,
    });

    expect(result.tasks[0]!.end).toBe('2026-11-06');
    expect(result.tasks[0]!.children![1]!.start).toBe('2026-11-05');
    expect(result.tasks[0]!.children![1]!.end).toBe('2026-11-06');
    expect(result.cascadedTaskIds).toContain(3);
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

  it('only marks subtasks critical when their parent is critical and they drive the parent finish', () => {
    const cpm = computeCriticalPath(chainTasks);

    // Phase A (critical): Review Spec ends on Phase A's end date -> critical; Draft Spec has 2 days of slack
    expect(cpm.criticalTaskIds.has(3)).toBe(true);
    expect(cpm.criticalTaskIds.has(2)).toBe(false);
    expect(cpm.slackByTaskId.get(2)).toBe(2);

    // Phase B (critical): UI Polish drives Phase B's end -> critical; API Setup has slack
    expect(cpm.criticalTaskIds.has(6)).toBe(true);
    expect(cpm.criticalTaskIds.has(5)).toBe(false);

    // Subtasks of a non-critical parent are never critical, even if they end on the parent's end date
    const withSideProject: Task[] = [
      ...chainTasks,
      {
        id: 9,
        name: 'Side Project',
        start: '2026-11-01',
        end: '2026-11-04',
        progress: 0,
        children: [
          { id: 10, name: 'Side Sub', start: '2026-11-03', end: '2026-11-04', progress: 0, parentId: 9 },
        ],
      },
    ];
    const sideCpm = computeCriticalPath(withSideProject);
    expect(sideCpm.criticalTaskIds.has(9)).toBe(false);
    expect(sideCpm.criticalTaskIds.has(10)).toBe(false);
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
