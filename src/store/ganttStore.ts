import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { auth } from '@/config/firebase';
import {
  addSubtaskToTree,
  addTaskToTree,
  deleteTaskFromTree,
  findTaskById,
  flattenTasks,
  prepareImportedTasks,
  sanitizeTaskTree,
  setAllCollapsedInTree,
  toggleSubtaskDoneInTree,
  toggleTaskCollapsedInTree,
  updateTaskInTree,
} from '@/domain/taskTree';
import { syncSharedChart } from '@/services/shareRepository';
import { userDocumentSync } from '@/services/userDocumentSync';
import { saveWorkspaceTasksInFirestore } from '@/services/userRepository';
import type { FlatTask, ImportTaskInput, Task, TaskDraft } from '@/types';
import { useWorkspaceStore } from './workspaceStore';

interface GanttStoreState {
  tasks: Task[];
  nextId: number;
  loading: boolean;
  currentWorkspaceId: string | null;
  unsubscribe: (() => void) | null;
  initTasks: (workspaceId: string) => () => void;
  cleanup: () => void;
  addTask: (draft: TaskDraft) => Task;
  addSubtask: (parentId: number, draft: TaskDraft) => Task;
  updateTask: (taskId: number, updates: Partial<Task>) => void;
  toggleSubtaskDone: (taskId: number) => void;
  toggleCollapse: (taskId: number) => void;
  setAllCollapsed: (collapsed: boolean) => void;
  deleteTask: (taskId: number) => void;
  importTasksBatch: (inputs: readonly ImportTaskInput[]) => number;
  clearTasks: () => Promise<void>;
  getAllTasks: () => FlatTask[];
  findTaskById: (id: number) => Task | null;
  persistTasks: () => Promise<void>;
}

export const useGanttStore = create<GanttStoreState>()(
  subscribeWithSelector((set, get) => ({
    tasks: [],
    nextId: 1,
    loading: false,
    currentWorkspaceId: null,
    unsubscribe: null,

    initTasks: (workspaceId) => {
      const prevUnsub = get().unsubscribe;
      if (prevUnsub) prevUnsub();

      const user = auth.currentUser;
      if (!user || !workspaceId) {
        set({ tasks: [], nextId: 1, loading: false, currentWorkspaceId: null, unsubscribe: null });
        return () => {};
      }

      set({ loading: true, currentWorkspaceId: workspaceId });

      const unsubscribe = userDocumentSync.subscribe(
        (snapshot) => {
          if (!snapshot.exists || !snapshot.data) {
            set({ tasks: [], nextId: 1, loading: false });
            return;
          }

          const rawTasks = (snapshot.data[`tasks_${workspaceId}`] ?? []) as Task[];
          const rawNextId = (snapshot.data[`nextId_${workspaceId}`] ?? 1) as number;
          const sanitized = sanitizeTaskTree(rawTasks);

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

      set({ unsubscribe });
      return unsubscribe;
    },

    cleanup: () => {
      const { unsubscribe } = get();
      if (unsubscribe) {
        unsubscribe();
      }
      set({ unsubscribe: null, tasks: [], nextId: 1, currentWorkspaceId: null, loading: false });
    },

    addTask: (draft) => {
      const { tasks, nextId, createdTask } = addTaskToTree(get().tasks, get().nextId, draft);
      set({ tasks, nextId });
      void get().persistTasks();
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
      void get().persistTasks();
      return createdTask;
    },

    updateTask: (taskId, updates) => {
      const tasks = updateTaskInTree(get().tasks, taskId, updates);
      set({ tasks });
      void get().persistTasks();
    },

    toggleSubtaskDone: (taskId) => {
      const tasks = toggleSubtaskDoneInTree(get().tasks, taskId);
      set({ tasks });
      void get().persistTasks();
    },

    toggleCollapse: (taskId) => {
      const tasks = toggleTaskCollapsedInTree(get().tasks, taskId);
      set({ tasks });
      void get().persistTasks();
    },

    setAllCollapsed: (collapsed) => {
      const tasks = setAllCollapsedInTree(get().tasks, collapsed);
      set({ tasks });
      void get().persistTasks();
    },

    deleteTask: (taskId) => {
      const tasks = deleteTaskFromTree(get().tasks, taskId);
      set({ tasks });
      void get().persistTasks();
    },

    importTasksBatch: (inputs) => {
      const { tasks, nextId, importedCount } = prepareImportedTasks(
        get().tasks,
        get().nextId,
        inputs,
      );
      set({ tasks, nextId });
      void get().persistTasks();
      return importedCount;
    },

    clearTasks: async () => {
      set({ tasks: [], nextId: 1 });
      await get().persistTasks();
    },

    getAllTasks: () => flattenTasks(get().tasks),

    findTaskById: (id) => findTaskById(get().tasks, id),

    persistTasks: async () => {
      const user = auth.currentUser;
      const { currentWorkspaceId, tasks, nextId } = get();
      if (!user || !currentWorkspaceId) return;

      try {
        await saveWorkspaceTasksInFirestore(user.uid, currentWorkspaceId, tasks, nextId);

        const activeWorkspace = useWorkspaceStore.getState().workspaces[currentWorkspaceId];
        if (activeWorkspace?.isShared && activeWorkspace.shareId) {
          await syncSharedChart(activeWorkspace.shareId, { tasks });
        }
      } catch (err) {
        console.error('Failed to persist tasks:', err);
      }
    },
  })),
);
