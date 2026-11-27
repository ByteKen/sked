import { describe, expect, it } from 'vitest';
import {
  addSubtaskToTree,
  addTaskToTree,
  cloneTasksForWorkspace,
  computeTaskStats,
  deleteTaskFromTree,
  filterTasks,
  flattenTasks,
  prepareImportedTasks,
  recalculateParentProgress,
  toggleSubtaskDoneInTree,
  toggleTaskCollapsedInTree,
  updateTaskInTree,
} from '@/domain/taskTree';
import type { Task } from '@/types';

const sampleTasks: Task[] = [
  {
    id: 1,
    name: 'Phase 1',
    start: '2026-01-01',
    end: '2026-01-20',
    progress: 50,
    collapsed: false,
    dependencies: [],
    children: [
      {
        id: 2,
        name: 'Research',
        start: '2026-01-01',
        end: '2026-01-10',
        progress: 100,
        isDone: true,
        parentId: 1,
        children: [],
      },
      {
        id: 3,
        name: 'Spec',
        start: '2026-01-11',
        end: '2026-01-20',
        progress: 0,
        isDone: false,
        isWorking: true,
        parentId: 1,
        children: [],
      },
    ],
  },
  {
    id: 4,
    name: 'Launch',
    start: '2026-01-21',
    end: '2026-01-21',
    progress: 0,
    isDeadline: true,
    dependencies: [1],
    children: [],
  },
];

describe('taskTree domain logic', () => {
  it('flattens tasks and respects collapsed parents identically for tree and timeline', () => {
    expect(flattenTasks(sampleTasks).map((t) => t.id)).toEqual([1, 2, 3, 4]);

    const collapsed = toggleTaskCollapsedInTree(sampleTasks, 1);
    expect(flattenTasks(collapsed, { respectCollapsed: true }).map((t) => t.id)).toEqual([1, 4]);

    // Read-only local override collapses without mutating source
    expect(
      flattenTasks(sampleTasks, {
        respectCollapsed: true,
        collapsedOverrides: { 1: true },
      }).map((t) => t.id),
    ).toEqual([1, 4]);
  });

  it('auto-recalculates parent progress from partial subtask progress and only hits 100% when all subtasks finish', () => {
    // Updating Spec (id: 3) to 40% alongside Research (100%) rolls Phase 1 up to 70%
    const partial = updateTaskInTree(sampleTasks, 3, { progress: 40 });
    expect(partial[0]!.progress).toBe(70);
    expect(partial[0]!.isDone).toBe(false);

    // Single subtask at 70% rolls parent directly up to 70% (not 0%)
    const singleChildTree: Task[] = [
      {
        id: 10,
        name: 'PLANNING',
        start: '2026-11-26',
        end: '2026-12-10',
        progress: 0,
        children: [
          {
            id: 11,
            name: 'Identify Beneficiary',
            start: '2026-11-26',
            end: '2026-11-29',
            progress: 70,
            parentId: 10,
          },
        ],
      },
    ];
    const rolledSingle = recalculateParentProgress(singleChildTree);
    expect(rolledSingle[0]!.progress).toBe(70);
    expect(rolledSingle[0]!.isDone).toBe(false);

    // 100%, 100%, 99% averages 99.67% -> stays capped at 99% until all subtasks actually complete
    const nearComplete = recalculateParentProgress([
      {
        id: 20,
        name: 'Phase',
        start: '2026-01-01',
        end: '2026-01-10',
        progress: 0,
        children: [
          { id: 21, name: 'A', start: '2026-01-01', end: '2026-01-03', progress: 100, isDone: true, parentId: 20 },
          { id: 22, name: 'B', start: '2026-01-04', end: '2026-01-06', progress: 100, isDone: true, parentId: 20 },
          { id: 23, name: 'C', start: '2026-01-07', end: '2026-01-10', progress: 99, isDone: false, parentId: 20 },
        ],
      },
    ]);
    expect(nearComplete[0]!.progress).toBe(99);
    expect(nearComplete[0]!.isDone).toBe(false);

    // Toggling remaining subtask done reaches 100% and marks parent done
    const updated = toggleSubtaskDoneInTree(sampleTasks, 3);
    const parent = updated[0]!;
    expect(parent.progress).toBe(100);
    expect(parent.isDone).toBe(true);
    expect(parent.children?.[1]?.isWorking).toBe(false);
  });

  it('prunes dangling dependencies when deleting a task', () => {
    const remaining = deleteTaskFromTree(sampleTasks, 1);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(4);
    expect(remaining[0]?.dependencies).toEqual([]);
  });

  it('preserves ancestor branches when searching for a nested subtask', () => {
    const filtered = filterTasks(sampleTasks, 'spec');
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe(1);
    expect(filtered[0]?.children?.map((c) => c.id)).toEqual([3]);
  });

  it('imports tasks atomically with remapped dependencies and zero leaked internal keys', () => {
    const { tasks: existing, nextId } = addTaskToTree([], 1, {
      name: 'Existing',
      start: '2026-01-01',
      end: '2026-01-05',
      progress: 0,
    });

    const result = prepareImportedTasks(existing, nextId, [
      {
        id: 'A',
        name: 'Design',
        start: '2026-01-06',
        end: '2026-01-12',
        children: [{ name: 'Wireframes', start: '2026-01-06', end: '2026-01-09', progress: 100 }],
      },
      {
        id: 'B',
        name: 'Build',
        start: '2026-01-13',
        end: '2026-01-20',
        dependencies: ['A'],
      },
    ]);

    expect(result.importedCount).toBe(3);
    expect(result.tasks).toHaveLength(3);

    const designTask = result.tasks[1]!;
    const buildTask = result.tasks[2]!;
    expect(designTask.progress).toBe(100);
    expect(buildTask.dependencies).toEqual([designTask.id]);
    expect('_originalDependencies' in buildTask).toBe(false);
    expect(result.nextId).toBe(5);
  });

  it('adds subtasks and computes workspace task stats accurately', () => {
    const { tasks: withSub } = addSubtaskToTree(sampleTasks, 5, 1, {
      name: 'QA Check',
      start: '2026-01-18',
      end: '2026-01-20',
      progress: 0,
    });
    expect(withSub[0]?.children).toHaveLength(3);
    expect(withSub[0]?.progress).toBe(33);

    const stats = computeTaskStats(sampleTasks);
    expect(stats.total).toBe(4);
    expect(stats.completed).toBe(1);
    expect(stats.working).toBe(2); // parent hasWorkingChild + child isWorking

    const cloned = cloneTasksForWorkspace(sampleTasks);
    expect(cloned.nextId).toBe(5);
    expect(cloned.tasks).toHaveLength(2);
  });

  it('sanitizes, preserves, imports, and searches task descriptions cleanly', () => {
    const { tasks: withDesc, nextId } = addTaskToTree([], 1, {
      name: 'API Spec',
      description: '  Define OpenAPI endpoints & auth scopes  ',
      start: '2026-02-01',
      end: '2026-02-05',
      progress: 0,
    });
    expect(withDesc[0]?.description).toBe('Define OpenAPI endpoints & auth scopes');

    const { tasks: withEmpty } = addTaskToTree(withDesc, nextId, {
      name: 'Blank Notes',
      description: '    ',
      start: '2026-02-06',
      end: '2026-02-08',
      progress: 0,
    });
    expect('description' in withEmpty[1]!).toBe(false);

    const searchMatches = filterTasks(withEmpty, 'openapi');
    expect(searchMatches.map((t) => t.name)).toEqual(['API Spec']);

    const imported = prepareImportedTasks([], 1, [
      {
        name: 'Imported Task',
        description: '  Carry over notes  ',
        start: '2026-03-01',
        end: '2026-03-05',
      },
    ]);
    expect(imported.tasks[0]?.description).toBe('Carry over notes');
  });
});
