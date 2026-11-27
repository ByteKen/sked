import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { auth } from '@/config/firebase';
import { haveTasksChanged, isCollaborativeWorkspace } from '@/domain/collaboration';
import { rescheduleTaskInTree, type RescheduleResult } from '@/domain/scheduling';
import {
  addSubtaskToTree,
  addTaskToTree,
  deleteTaskFromTree,
  findTaskById,
  flattenTasks,
  getMaxTaskId,
  prepareImportedTasks,
  recalculateParentProgress,
  sanitizeTaskTree,
  setAllCollapsedInTree,
  toggleSubtaskDoneInTree,
  toggleTaskCollapsedInTree,
  updateTaskInTree,
} from '@/domain/taskTree';
import { setTaskStatusInTree } from '@/domain/taskViews';
import {
  commitCollaborativeChartMutation,
  subscribeToSharedChart,
  syncSharedChart,
  type CollaborativeChartMutationResult,
} from '@/services/shareRepository';
import { userDocumentSync } from '@/services/userDocumentSync';
import { saveWorkspaceTasksInFirestore } from '@/services/userRepository';
import type {
  ChartEditorAttribution,
  FlatTask,
  ImportTaskInput,
  Task,
  TaskDraft,
  TaskStatus,
} from '@/types';
import { useAuthStore } from './authStore';
import { useWorkspaceStore } from './workspaceStore';

const RAPID_EDIT_DEBOUNCE_MS = 500;
const COLLAB_OWNER_BACKUP_DEBOUNCE_MS = 4000;

interface PendingWriteOptions {
  /** Debounce high-frequency actions (progress sliders, collapse toggles) to conserve Firestore quota. */
  debounceMs?: number;
  /** Skip mirroring UI-only state (like collapse toggles) to public read-only shares. */
  skipShareSync?: boolean;
  /** Optional conflict-safe mutator applied inside a Firestore transaction when multi-editor is active. */
  collaborativeMutate?: (current: {
    tasks: Task[];
    nextId: number;
  }) => CollaborativeChartMutationResult | null;
}

interface GanttStoreState {
  tasks: Task[];
  nextId: number;
  loading: boolean;
  currentWorkspaceId: string | null;
  collaborativeShareId: string | null;
  lastEditedBy: ChartEditorAttribution | null;
  unsubscribe: (() => void) | null;
  initTasks: (workspaceId: string) => () => void;
  cleanup: () => void;
  flushPendingWrites: () => Promise<void>;
  addTask: (draft: TaskDraft) => Task;
  addSubtask: (parentId: number, draft: TaskDraft) => Task;
  updateTask: (taskId: number, updates: Partial<Task>, options?: { debounce?: boolean }) => void;
  rescheduleTask: (
    taskId: number,
    nextStart: string,
    nextEnd: string,
    autoCascade?: boolean,
  ) => RescheduleResult & { previousTasks: Task[] };
  setTaskStatus: (
    taskId: number,
    status: TaskStatus,
  ) => { tasks: Task[]; updatedTask: Task | null; previousTasks: Task[] };
  restoreTasksSnapshot: (tasks: Task[]) => void;
  toggleSubtaskDone: (taskId: number) => void;
  toggleCollapse: (taskId: number) => void;
  setAllCollapsed: (collapsed: boolean) => void;
  deleteTask: (taskId: number) => void;
  importTasksBatch: (inputs: readonly ImportTaskInput[]) => number;
  clearTasks: () => Promise<void>;
  getAllTasks: () => FlatTask[];
  findTaskById: (id: number) => Task | null;
  persistTasks: (options?: PendingWriteOptions) => Promise<void>;
}

// Module-scoped timers so rapid sliders/toggles coalesce cleanly without triggering React re-renders
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingDebounceOptions: PendingWriteOptions | null = null;
let ownerBackupTimer: ReturnType<typeof setTimeout> | null = null;
let lastPersistedPrivateTasks: Task[] | null = null;
let pageHideListenerAttached = false;

function clearTimers() {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (ownerBackupTimer !== null) {
    clearTimeout(ownerBackupTimer);
    ownerBackupTimer = null;
  }
  pendingDebounceOptions = null;
}

function getCurrentEditorAttribution(): Omit<ChartEditorAttribution, 'at'> | null {
  const user = useAuthStore.getState().user;
  const authUser = auth.currentUser;
  const uid = user?.id || authUser?.uid;
  if (!uid) return null;
  return {
    uid,
    name: user?.name || authUser?.displayName || 'Owner',
  };
}

export const useGanttStore = create<GanttStoreState>()(
  subscribeWithSelector((set, get) => {
    const scheduleOwnerBackupMirror = (workspaceId: string) => {
      if (ownerBackupTimer !== null) clearTimeout(ownerBackupTimer);
      ownerBackupTimer = setTimeout(() => {
        ownerBackupTimer = null;
        const user = auth.currentUser;
        const state = get();
        if (!user || state.currentWorkspaceId !== workspaceId) return;
        if (lastPersistedPrivateTasks && !haveTasksChanged(lastPersistedPrivateTasks, state.tasks)) {
          return;
        }
        lastPersistedPrivateTasks = state.tasks;
        void saveWorkspaceTasksInFirestore(user.uid, workspaceId, state.tasks, state.nextId).catch(
          (err) => console.warn('Background owner mirror skipped:', err),
        );
      }, COLLAB_OWNER_BACKUP_DEBOUNCE_MS);
    };

    const executePersistNow = async (options: PendingWriteOptions = {}) => {
      const user = auth.currentUser;
      const { currentWorkspaceId, collaborativeShareId, tasks, nextId } = get();
      if (!user || !currentWorkspaceId) return;

      // Collaborative workspaces write ONCE to sharedCharts/{shareId} (atomic transaction)
      // and lazily mirror to the owner's private doc to cut Spark plan writes in half.
      if (collaborativeShareId) {
        if (options.skipShareSync) {
          // Local collapse state stays local in multi-editor mode (0 Firestore writes!)
          return;
        }
        const editor = getCurrentEditorAttribution();
        if (!editor) return;

        try {
          const committed = await commitCollaborativeChartMutation({
            shareId: collaborativeShareId,
            editor,
            mutate: (current) => {
              if (options.collaborativeMutate) {
                return options.collaborativeMutate(current);
              }
              return { tasks, nextId };
            },
          });
          if (committed) {
            set({ tasks: committed.tasks, nextId: committed.nextId });
            scheduleOwnerBackupMirror(currentWorkspaceId);
          }
        } catch (err) {
          console.error('Failed to commit collaborative update:', err);
        }
        return;
      }

      // Private or public read-only workspace: skip redundant no-op writes
      if (lastPersistedPrivateTasks && !haveTasksChanged(lastPersistedPrivateTasks, tasks)) {
        return;
      }
      lastPersistedPrivateTasks = tasks;

      try {
        await saveWorkspaceTasksInFirestore(user.uid, currentWorkspaceId, tasks, nextId);

        if (!options.skipShareSync) {
          const activeWorkspace = useWorkspaceStore.getState().workspaces[currentWorkspaceId];
          if (activeWorkspace?.isShared && activeWorkspace.shareId) {
            await syncSharedChart(activeWorkspace.shareId, { tasks, nextId });
          }
        }
      } catch (err) {
        console.error('Failed to persist tasks:', err);
      }
    };

    const schedulePersist = (options: PendingWriteOptions = {}) => {
      const delay = options.debounceMs ?? 0;

      if (delay <= 0) {
        if (debounceTimer !== null) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
          pendingDebounceOptions = null;
        }
        void executePersistNow(options);
        return;
      }

      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
      }
      // If a pending write needed share sync, never downgrade it to skipShareSync
      const mergedSkipShare = Boolean(
        options.skipShareSync && (pendingDebounceOptions?.skipShareSync ?? true),
      );
      pendingDebounceOptions = {
        ...options,
        skipShareSync: mergedSkipShare,
        // Coalesced rapid writes flush the settled local tree snapshot
        collaborativeMutate: undefined,
      };

      debounceTimer = setTimeout(() => {
        const opts = pendingDebounceOptions ?? {};
        debounceTimer = null;
        pendingDebounceOptions = null;
        void executePersistNow(opts);
      }, delay);
    };

    const ensurePageHideFlush = () => {
      if (typeof window === 'undefined' || pageHideListenerAttached) return;
      pageHideListenerAttached = true;
      const flush = () => {
        void get().flushPendingWrites();
      };
      window.addEventListener('pagehide', flush);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flush();
      });
    };

    return {
      tasks: [],
      nextId: 1,
      loading: false,
      currentWorkspaceId: null,
      collaborativeShareId: null,
      lastEditedBy: null,
      unsubscribe: null,

      flushPendingWrites: async () => {
        const hadPendingDebounce = debounceTimer !== null;
        const opts = pendingDebounceOptions ?? {};
        if (debounceTimer !== null) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
          pendingDebounceOptions = null;
        }
        if (hadPendingDebounce) {
          await executePersistNow(opts);
        }

        if (ownerBackupTimer !== null) {
          clearTimeout(ownerBackupTimer);
          ownerBackupTimer = null;
          const user = auth.currentUser;
          const { currentWorkspaceId, tasks, nextId } = get();
          if (
            user &&
            currentWorkspaceId &&
            (!lastPersistedPrivateTasks || haveTasksChanged(lastPersistedPrivateTasks, tasks))
          ) {
            lastPersistedPrivateTasks = tasks;
            await saveWorkspaceTasksInFirestore(user.uid, currentWorkspaceId, tasks, nextId).catch(
              () => {},
            );
          }
        }
      },

      initTasks: (workspaceId) => {
        ensurePageHideFlush();
        const prevUnsub = get().unsubscribe;
        if (prevUnsub) prevUnsub();
        void get().flushPendingWrites();
        clearTimers();
        lastPersistedPrivateTasks = null;

        const user = auth.currentUser;
        if (!user || !workspaceId) {
          set({
            tasks: [],
            nextId: 1,
            loading: false,
            currentWorkspaceId: null,
            collaborativeShareId: null,
            lastEditedBy: null,
            unsubscribe: null,
          });
          return () => {};
        }

        const activeWorkspace = useWorkspaceStore.getState().workspaces[workspaceId];
        const collabShareId =
          isCollaborativeWorkspace(activeWorkspace) && activeWorkspace?.shareId
            ? activeWorkspace.shareId
            : null;

        set({
          loading: true,
          currentWorkspaceId: workspaceId,
          collaborativeShareId: collabShareId,
          lastEditedBy: null,
        });

        let unsubscribe: () => void;
        if (collabShareId) {
          // Collaborative mode: subscribe directly to sharedCharts/{shareId} so owner & editors stay live
          unsubscribe = subscribeToSharedChart(
            collabShareId,
            (chart) => {
              if (!chart) {
                set({ loading: false });
                return;
              }
              const sanitized = recalculateParentProgress(sanitizeTaskTree(chart.tasks));
              const nextId = Math.max(1, chart.nextId ?? getMaxTaskId(sanitized) + 1);
              set({
                tasks: sanitized,
                nextId,
                lastEditedBy: chart.lastEditedBy ?? null,
                loading: false,
              });
              // Keep owner's private backup up to date lazily if collaborator made edits while owner was away
              const ownerCached = useWorkspaceStore.getState().workspaceTasks[workspaceId] ?? [];
              if (haveTasksChanged(ownerCached, sanitized)) {
                scheduleOwnerBackupMirror(workspaceId);
              }
            },
            () => {
              set({ loading: false });
            },
          );
        } else {
          unsubscribe = userDocumentSync.subscribe(
            (snapshot) => {
              if (!snapshot.exists || !snapshot.data) {
                set({ tasks: [], nextId: 1, loading: false });
                return;
              }

              const rawTasks = (snapshot.data[`tasks_${workspaceId}`] ?? []) as Task[];
              const rawNextId = (snapshot.data[`nextId_${workspaceId}`] ?? 1) as number;
              const sanitized = recalculateParentProgress(sanitizeTaskTree(rawTasks));
              lastPersistedPrivateTasks = sanitized;

              set({
                tasks: sanitized,
                nextId: Math.max(1, rawNextId),
                loading: false,
              });
            },
            () => {
              set({ loading: false });
            },
          );
        }

        set({ unsubscribe });
        return unsubscribe;
      },

      cleanup: () => {
        void get().flushPendingWrites();
        clearTimers();
        lastPersistedPrivateTasks = null;
        const { unsubscribe } = get();
        if (unsubscribe) {
          unsubscribe();
        }
        set({
          unsubscribe: null,
          tasks: [],
          nextId: 1,
          currentWorkspaceId: null,
          collaborativeShareId: null,
          lastEditedBy: null,
          loading: false,
        });
      },

      addTask: (draft) => {
        const { tasks, nextId, createdTask } = addTaskToTree(get().tasks, get().nextId, draft);
        set({ tasks, nextId });
        schedulePersist({
          collaborativeMutate: (current) => {
            const next = addTaskToTree(current.tasks, current.nextId, draft);
            return { tasks: next.tasks, nextId: next.nextId };
          },
        });
        return createdTask;
      },

      addSubtask: (parentId, draft) => {
        const { tasks, nextId, createdTask } = addSubtaskToTree(
          get().tasks,
          get().nextId,
          parentId,
          draft,
        );
        set({ tasks, nextId });
        schedulePersist({
          collaborativeMutate: (current) => {
            const next = addSubtaskToTree(current.tasks, current.nextId, parentId, draft);
            return { tasks: next.tasks, nextId: next.nextId };
          },
        });
        return createdTask;
      },

      updateTask: (taskId, updates, options) => {
        const tasks = updateTaskInTree(get().tasks, taskId, updates);
        set({ tasks });
        schedulePersist({
          debounceMs: options?.debounce ? RAPID_EDIT_DEBOUNCE_MS : 0,
          collaborativeMutate: (current) => ({
            tasks: updateTaskInTree(current.tasks, taskId, updates),
            nextId: current.nextId,
          }),
        });
      },

      rescheduleTask: (taskId, nextStart, nextEnd, autoCascade = true) => {
        const previousTasks = get().tasks;
        const result = rescheduleTaskInTree(previousTasks, {
          taskId,
          nextStart,
          nextEnd,
          autoCascade,
        });
        if (result.movedTask) {
          set({ tasks: result.tasks });
          schedulePersist({
            collaborativeMutate: (current) => {
              const next = rescheduleTaskInTree(current.tasks, {
                taskId,
                nextStart,
                nextEnd,
                autoCascade,
              });
              return next.movedTask ? { tasks: next.tasks, nextId: current.nextId } : null;
            },
          });
        }
        return { ...result, previousTasks };
      },

      setTaskStatus: (taskId, status) => {
        const previousTasks = get().tasks;
        const result = setTaskStatusInTree(previousTasks, taskId, status);
        if (result.updatedTask) {
          set({ tasks: result.tasks });
          schedulePersist({
            collaborativeMutate: (current) => {
              const next = setTaskStatusInTree(current.tasks, taskId, status);
              return next.updatedTask ? { tasks: next.tasks, nextId: current.nextId } : null;
            },
          });
        }
        return { ...result, previousTasks };
      },

      restoreTasksSnapshot: (snapshot) => {
        const sanitized = sanitizeTaskTree(snapshot);
        set({ tasks: sanitized });
        schedulePersist();
      },

      toggleSubtaskDone: (taskId) => {
        const tasks = toggleSubtaskDoneInTree(get().tasks, taskId);
        set({ tasks });
        schedulePersist({
          collaborativeMutate: (current) => ({
            tasks: toggleSubtaskDoneInTree(current.tasks, taskId),
            nextId: current.nextId,
          }),
        });
      },

      toggleCollapse: (taskId) => {
        const tasks = toggleTaskCollapsedInTree(get().tasks, taskId);
        set({ tasks });
        // Debounced + never syncs UI collapse state to sharedCharts (saves Firestore writes!)
        schedulePersist({ debounceMs: RAPID_EDIT_DEBOUNCE_MS, skipShareSync: true });
      },

      setAllCollapsed: (collapsed) => {
        const tasks = setAllCollapsedInTree(get().tasks, collapsed);
        set({ tasks });
        schedulePersist({ debounceMs: RAPID_EDIT_DEBOUNCE_MS, skipShareSync: true });
      },

      deleteTask: (taskId) => {
        const tasks = deleteTaskFromTree(get().tasks, taskId);
        set({ tasks });
        schedulePersist({
          collaborativeMutate: (current) => ({
            tasks: deleteTaskFromTree(current.tasks, taskId),
            nextId: current.nextId,
          }),
        });
      },

      importTasksBatch: (inputs) => {
        const { tasks, nextId, importedCount } = prepareImportedTasks(
          get().tasks,
          get().nextId,
          inputs,
        );
        set({ tasks, nextId });
        schedulePersist({
          collaborativeMutate: (current) => {
            const next = prepareImportedTasks(current.tasks, current.nextId, inputs);
            return { tasks: next.tasks, nextId: next.nextId };
          },
        });
        return importedCount;
      },

      clearTasks: async () => {
        set({ tasks: [], nextId: 1 });
        await executePersistNow({
          collaborativeMutate: () => ({ tasks: [], nextId: 1 }),
        });
      },

      getAllTasks: () => flattenTasks(get().tasks),

      findTaskById: (id) => findTaskById(get().tasks, id),

      persistTasks: async (options) => {
        await executePersistNow(options);
      },
    };
  }),
);
