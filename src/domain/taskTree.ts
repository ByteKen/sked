import type {
  FlatTask,
  ImportTaskInput,
  Task,
  TaskDraft,
  TaskStats,
  TaskStatus,
} from '@/types';

export interface FlattenOptions {
  respectCollapsed?: boolean;
  collapsedOverrides?: Record<number, boolean>;
  level?: number;
}

/**
 * Flatten a hierarchical task tree into display order.
 * Supports synchronized collapse/expand for both editable and read-only views.
 */
export function flattenTasks(tasks: readonly Task[], options: FlattenOptions = {}): FlatTask[] {
  const { respectCollapsed = false, collapsedOverrides, level = 0 } = options;
  const result: FlatTask[] = [];

  for (const task of tasks) {
    const children = task.children ?? [];
    const hasChildren = children.length > 0;
    const isCollapsed =
      collapsedOverrides && Object.prototype.hasOwnProperty.call(collapsedOverrides, task.id)
        ? Boolean(collapsedOverrides[task.id])
        : Boolean(task.collapsed);

    result.push({
      ...task,
      level,
      hasChildren,
      isSubtask: level > 0 || (task.parentId !== null && task.parentId !== undefined),
    });

    if (hasChildren && (!respectCollapsed || !isCollapsed)) {
      result.push(
        ...flattenTasks(children, {
          respectCollapsed,
          collapsedOverrides,
          level: level + 1,
        }),
      );
    }
  }

  return result;
}

/**
 * Strip unknown/internal properties (e.g. legacy `_originalDependencies`) and undefined fields
 * so objects are always safe to write to Firestore.
 */
export function sanitizeTask(task: Task): Task {
  const trimmedDescription = typeof task.description === 'string' ? task.description.trim() : '';
  const clean: Task = {
    id: task.id,
    name: task.name,
    ...(trimmedDescription ? { description: trimmedDescription } : {}),
    start: task.start,
    end: task.end,
    progress: typeof task.progress === 'number' && !Number.isNaN(task.progress) ? task.progress : 0,
    isMilestone: Boolean(task.isMilestone),
    isDeadline: Boolean(task.isDeadline || task.start === task.end),
    isDone: Boolean(task.isDone || task.progress === 100),
    isWorking: Boolean(task.isWorking),
    parentId: task.parentId ?? null,
    dependencies: Array.isArray(task.dependencies) ? [...task.dependencies] : [],
    children: Array.isArray(task.children) ? task.children.map(sanitizeTask) : [],
    collapsed: Boolean(task.collapsed),
  };
  return clean;
}

export function sanitizeTaskTree(tasks: readonly Task[]): Task[] {
  return tasks.map(sanitizeTask);
}

export function findTaskById(tasks: readonly Task[], id: number): Task | null {
  for (const task of tasks) {
    if (task.id === id) return task;
    if (task.children && task.children.length > 0) {
      const found = findTaskById(task.children, id);
      if (found) return found;
    }
  }
  return null;
}

export function hasWorkingChild(task: Task): boolean {
  if (!task.children || task.children.length === 0) return false;
  return task.children.some((child) => Boolean(child.isWorking) || hasWorkingChild(child));
}

export function isTaskCompleted(task: Task): boolean {
  return task.progress === 100 || Boolean(task.isDone);
}

export function isTaskDeadline(task: Task): boolean {
  return Boolean(task.isDeadline) || task.start === task.end;
}

export function getTaskStatus(task: Task): TaskStatus {
  if (isTaskCompleted(task)) return 'completed';
  if (task.isWorking || hasWorkingChild(task)) return 'working';
  if (task.progress > 0) return 'in-progress';
  return 'not-started';
}

/**
 * Filter a task tree by search query while preserving ancestor branches
 * when any descendant matches.
 */
export function filterTasks(tasks: readonly Task[], rawQuery: string): Task[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [...tasks];

  const filtered: Task[] = [];
  for (const task of tasks) {
    const selfMatches =
      task.name.toLowerCase().includes(query) ||
      Boolean(task.description?.toLowerCase().includes(query));
    const matchingChildren = task.children ? filterTasks(task.children, query) : [];

    if (selfMatches) {
      filtered.push({ ...task, collapsed: false });
    } else if (matchingChildren.length > 0) {
      filtered.push({
        ...task,
        children: matchingChildren,
        collapsed: false,
      });
    }
  }
  return filtered;
}

/**
 * Bottom-up recalculation of parent task progress from subtask completion.
 */
export function recalculateParentProgress(tasks: readonly Task[]): Task[] {
  return tasks.map((task) => {
    if (!task.children || task.children.length === 0) {
      return task;
    }
    const updatedChildren = recalculateParentProgress(task.children);
    const completedCount = updatedChildren.filter(isTaskCompleted).length;
    const progress = Math.round((completedCount / updatedChildren.length) * 100);
    return {
      ...task,
      children: updatedChildren,
      progress,
      isDone: progress === 100,
    };
  });
}

export function addTaskToTree(
  tasks: readonly Task[],
  nextId: number,
  draft: TaskDraft,
): { tasks: Task[]; nextId: number; createdTask: Task } {
  const createdTask = sanitizeTask({
    ...draft,
    id: nextId,
    parentId: null,
    children: [],
    collapsed: false,
  });

  return {
    tasks: [...tasks, createdTask],
    nextId: nextId + 1,
    createdTask,
  };
}

export function addSubtaskToTree(
  tasks: readonly Task[],
  nextId: number,
  parentId: number,
  draft: TaskDraft,
): { tasks: Task[]; nextId: number; createdTask: Task } {
  const createdTask = sanitizeTask({
    ...draft,
    id: nextId,
    parentId,
    children: [],
    collapsed: false,
  });

  const insertRecursive = (list: readonly Task[]): Task[] =>
    list.map((task) => {
      if (task.id === parentId) {
        return {
          ...task,
          collapsed: false,
          children: [...(task.children ?? []), createdTask],
        };
      }
      if (task.children && task.children.length > 0) {
        return {
          ...task,
          children: insertRecursive(task.children),
        };
      }
      return task;
    });

  return {
    tasks: recalculateParentProgress(insertRecursive(tasks)),
    nextId: nextId + 1,
    createdTask,
  };
}

export function updateTaskInTree(
  tasks: readonly Task[],
  taskId: number,
  updates: Partial<Task>,
): Task[] {
  const updateRecursive = (list: readonly Task[]): Task[] =>
    list.map((task) => {
      if (task.id === taskId) {
        return sanitizeTask({ ...task, ...updates, id: task.id });
      }
      if (task.children && task.children.length > 0) {
        return {
          ...task,
          children: updateRecursive(task.children),
        };
      }
      return task;
    });

  return recalculateParentProgress(updateRecursive(tasks));
}

export function toggleSubtaskDoneInTree(tasks: readonly Task[], taskId: number): Task[] {
  const toggleRecursive = (list: readonly Task[]): Task[] =>
    list.map((task) => {
      if (task.id === taskId) {
        const nextDone = !isTaskCompleted(task);
        return {
          ...task,
          isDone: nextDone,
          isWorking: nextDone ? false : task.isWorking,
          progress: nextDone ? 100 : 0,
        };
      }
      if (task.children && task.children.length > 0) {
        return {
          ...task,
          children: toggleRecursive(task.children),
        };
      }
      return task;
    });

  return recalculateParentProgress(toggleRecursive(tasks));
}

export function toggleTaskCollapsedInTree(tasks: readonly Task[], taskId: number): Task[] {
  const toggleRecursive = (list: readonly Task[]): Task[] =>
    list.map((task) => {
      if (task.id === taskId) {
        return { ...task, collapsed: !task.collapsed };
      }
      if (task.children && task.children.length > 0) {
        return {
          ...task,
          children: toggleRecursive(task.children),
        };
      }
      return task;
    });

  return toggleRecursive(tasks);
}

export function setAllCollapsedInTree(tasks: readonly Task[], collapsed: boolean): Task[] {
  return tasks.map((task) => ({
    ...task,
    collapsed: task.children && task.children.length > 0 ? collapsed : false,
    children: task.children ? setAllCollapsedInTree(task.children, collapsed) : [],
  }));
}

export function deleteTaskFromTree(tasks: readonly Task[], taskId: number): Task[] {
  // Also prune dangling references to the deleted task (and its descendants) from dependencies
  const deletedIds = new Set<number>();
  const target = findTaskById(tasks, taskId);
  if (target) {
    for (const flat of flattenTasks([target])) {
      deletedIds.add(flat.id);
    }
  } else {
    deletedIds.add(taskId);
  }

  const removeRecursive = (list: readonly Task[]): Task[] =>
    list
      .filter((task) => task.id !== taskId)
      .map((task) => ({
        ...task,
        dependencies: (task.dependencies ?? []).filter((depId) => !deletedIds.has(depId)),
        children: task.children ? removeRecursive(task.children) : [],
      }));

  return recalculateParentProgress(removeRecursive(tasks));
}

/**
 * Pure atomic batch importer: allocates fresh sequential IDs and remaps dependencies
 * in memory with zero mutation and zero internal-field leaks.
 */
export function prepareImportedTasks(
  existingTasks: readonly Task[],
  existingNextId: number,
  importedInputs: readonly ImportTaskInput[],
): { tasks: Task[]; nextId: number; importedCount: number } {
  let currentNextId = Math.max(existingNextId, getMaxTaskId(existingTasks) + 1);
  const idMapping = new Map<string, number>();
  const pendingDependencies = new Map<number, Array<string | number>>();
  let importedCount = 0;

  const buildNode = (
    input: ImportTaskInput,
    parentId: number | null,
    rootOneBasedIndex: number | null,
  ): Task => {
    const newId = currentNextId++;
    importedCount += 1;

    if (input.id !== undefined && input.id !== null) {
      idMapping.set(String(input.id), newId);
    }
    if (rootOneBasedIndex !== null) {
      const idxKey = String(rootOneBasedIndex);
      if (!idMapping.has(idxKey)) {
        idMapping.set(idxKey, newId);
      }
    }

    if (Array.isArray(input.dependencies) && input.dependencies.length > 0) {
      pendingDependencies.set(newId, input.dependencies);
    }

    const children = Array.isArray(input.children)
      ? input.children.map((child) => buildNode(child, newId, null))
      : [];

    const progress =
      typeof input.progress === 'number' && !Number.isNaN(input.progress)
        ? Math.min(100, Math.max(0, input.progress))
        : 0;

    return sanitizeTask({
      id: newId,
      name: input.name.trim(),
      ...(typeof input.description === 'string' && input.description.trim()
        ? { description: input.description.trim() }
        : {}),
      start: input.start,
      end: input.end,
      progress,
      isMilestone: Boolean(input.isMilestone),
      isDeadline: Boolean(input.isDeadline || input.start === input.end),
      isDone: progress === 100,
      isWorking: false,
      parentId,
      dependencies: [],
      children,
      collapsed: false,
    });
  };

  const createdRoots = importedInputs.map((input, idx) => buildNode(input, null, idx + 1));

  const applyDependencies = (list: readonly Task[]): Task[] =>
    list.map((task) => {
      const rawDeps = pendingDependencies.get(task.id);
      const resolvedDeps = rawDeps
        ? rawDeps
            .map((rawId) => idMapping.get(String(rawId)))
            .filter((mappedId): mappedId is number => mappedId !== undefined && mappedId !== task.id)
        : (task.dependencies ?? []);

      return {
        ...task,
        dependencies: Array.from(new Set(resolvedDeps)),
        children: task.children ? applyDependencies(task.children) : [],
      };
    });

  const resolvedRoots = applyDependencies(createdRoots);
  const merged = recalculateParentProgress([...existingTasks, ...resolvedRoots]);

  return {
    tasks: merged,
    nextId: currentNextId,
    importedCount,
  };
}

export function getMaxTaskId(tasks: readonly Task[]): number {
  let max = 0;
  for (const flat of flattenTasks(tasks)) {
    if (flat.id > max) max = flat.id;
  }
  return max;
}

export function cloneTasksForWorkspace(tasks: readonly Task[]): { tasks: Task[]; nextId: number } {
  const sanitized = sanitizeTaskTree(tasks);
  return {
    tasks: sanitized,
    nextId: getMaxTaskId(sanitized) + 1,
  };
}

export function computeTaskStats(tasks: readonly Task[]): TaskStats {
  const flat = flattenTasks(tasks);
  const total = flat.length;
  if (total === 0) {
    return {
      total: 0,
      completed: 0,
      working: 0,
      inProgress: 0,
      notStarted: 0,
      completionPercent: 0,
    };
  }

  let completed = 0;
  let working = 0;
  let inProgress = 0;
  let notStarted = 0;
  let progressSum = 0;

  for (const task of flat) {
    const status = getTaskStatus(task);
    if (status === 'completed') completed += 1;
    else if (status === 'working') working += 1;
    else if (status === 'in-progress') inProgress += 1;
    else notStarted += 1;

    progressSum += isTaskCompleted(task) ? 100 : (task.progress ?? 0);
  }

  return {
    total,
    completed,
    working,
    inProgress,
    notStarted,
    completionPercent: Math.round(progressSum / total),
  };
}
