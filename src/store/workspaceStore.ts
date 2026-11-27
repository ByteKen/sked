import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { auth } from '@/config/firebase';
import { createWorkspaceBaseline } from '@/domain/scheduling';
import { computeTaskStats, getMaxTaskId, sanitizeTaskTree } from '@/domain/taskTree';
import { setTaskStatusInTree } from '@/domain/taskViews';
import {
  deleteOrphanedShareDoc,
  disableWorkspaceShare,
  enableWorkspaceShare,
  extractSharedViewPrefs,
  regenerateWorkspaceShare,
  syncSharedChart,
  updateWorkspaceEditorEmails,
} from '@/services/shareRepository';
import { userDocumentSync } from '@/services/userDocumentSync';
import {
  createWorkspaceInFirestore,
  deleteWorkspaceInFirestore,
  duplicateSharedChartForUser,
  saveWorkspaceTasksInFirestore,
  setLastWorkspaceInFirestore,
  updateWorkspaceInFirestore,
} from '@/services/userRepository';
import type {
  SharedChart,
  Task,
  TaskStats,
  TaskStatus,
  UserPreferences,
  Workspace,
  WorkspaceBaseline,
  WorkspaceMap,
} from '@/types';

interface WorkspaceStoreState {
  workspaces: WorkspaceMap;
  workspaceStats: Record<string, TaskStats>;
  workspaceTasks: Record<string, Task[]>;
  currentWorkspaceId: string | null;
  loading: boolean;
  isSwitching: boolean;
  unsubscribe: (() => void) | null;
  getCurrentWorkspace: () => Workspace | null;
  getWorkspaceList: () => Workspace[];
  initWorkspaces: () => () => void;
  cleanup: () => void;
  createWorkspace: (title: string) => Promise<Workspace | null>;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  updateWorkspace: (workspaceId: string, updates: Partial<Workspace>) => Promise<void>;
  updateTaskStatusInWorkspace: (
    workspaceId: string,
    taskId: number,
    status: TaskStatus,
  ) => Promise<{ updatedTask: Task | null; previousTasks: Task[] }>;
  restoreWorkspaceTasksSnapshot: (workspaceId: string, previousTasks: Task[]) => Promise<void>;
  saveBaseline: (workspaceId: string, tasks: readonly Task[]) => Promise<WorkspaceBaseline | null>;
  clearBaseline: (workspaceId: string) => Promise<void>;
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  enableSharing: (
    workspaceId: string,
    tasks: readonly Task[],
    preferences: UserPreferences,
    ownerName: string,
  ) => Promise<Workspace | null>;
  regenerateSharing: (
    workspaceId: string,
    tasks: readonly Task[],
    preferences: UserPreferences,
    ownerName: string,
  ) => Promise<Workspace | null>;
  updateWorkspaceEditors: (
    workspaceId: string,
    tasks: readonly Task[],
    preferences: UserPreferences,
    ownerName: string,
    editorEmails: readonly string[],
  ) => Promise<Workspace | null>;
  disableSharing: (workspaceId: string) => Promise<void>;
  syncSharedPreferences: (workspaceId: string, preferences: UserPreferences) => Promise<void>;
  duplicateSharedChart: (sharedChart: SharedChart) => Promise<Workspace | null>;
}

export const useWorkspaceStore = create<WorkspaceStoreState>()(
  subscribeWithSelector((set, get) => ({
    workspaces: {},
    workspaceStats: {},
    workspaceTasks: {},
    currentWorkspaceId: null,
    loading: true,
    isSwitching: false,
    unsubscribe: null,

    getCurrentWorkspace: () => {
      const { workspaces, currentWorkspaceId } = get();
      return currentWorkspaceId ? (workspaces[currentWorkspaceId] ?? null) : null;
    },

    getWorkspaceList: () => {
      const { workspaces } = get();
      return Object.values(workspaces).sort(
        (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime(),
      );
    },

    initWorkspaces: () => {
      const prevUnsub = get().unsubscribe;
      if (prevUnsub) prevUnsub();

      const user = auth.currentUser;
      if (!user) {
        set({
          workspaces: {},
          workspaceStats: {},
          workspaceTasks: {},
          currentWorkspaceId: null,
          loading: false,
          unsubscribe: null,
        });
        return () => {};
      }

      set({ loading: true });

      const unsubscribe = userDocumentSync.subscribe(
        (snapshot) => {
          if (!snapshot.exists || !snapshot.data) {
            set({
              workspaces: {},
              workspaceStats: {},
              workspaceTasks: {},
              currentWorkspaceId: null,
              loading: false,
            });
            return;
          }

          const rawData = snapshot.data;
          const nextWorkspaces = (rawData.workspaces ?? {}) as WorkspaceMap;
          const lastWorkspaceId = rawData.lastWorkspaceId as string | undefined;

          const nextStats: Record<string, TaskStats> = {};
          const nextTasksMap: Record<string, Task[]> = {};
          for (const wsId of Object.keys(nextWorkspaces)) {
            const wsTasks = sanitizeTaskTree((rawData[`tasks_${wsId}`] ?? []) as Task[]);
            nextTasksMap[wsId] = wsTasks;
            nextStats[wsId] = computeTaskStats(wsTasks);
          }

          const state = get();
          if (state.isSwitching) {
            set({
              workspaces: nextWorkspaces,
              workspaceStats: nextStats,
              workspaceTasks: nextTasksMap,
              loading: false,
            });
            return;
          }

          let nextCurrentId = state.currentWorkspaceId;
          if (!nextCurrentId || !nextWorkspaces[nextCurrentId]) {
            if (lastWorkspaceId && nextWorkspaces[lastWorkspaceId]) {
              nextCurrentId = lastWorkspaceId;
            } else {
              const ids = Object.keys(nextWorkspaces);
              nextCurrentId = ids[0] ?? null;
            }
          }

          set({
            workspaces: nextWorkspaces,
            workspaceStats: nextStats,
            workspaceTasks: nextTasksMap,
            currentWorkspaceId: nextCurrentId,
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
      set({
        unsubscribe: null,
        workspaces: {},
        workspaceStats: {},
        workspaceTasks: {},
        currentWorkspaceId: null,
        loading: false,
        isSwitching: false,
      });
    },

    createWorkspace: async (title) => {
      const user = auth.currentUser;
      if (!user) return null;

      try {
        const workspace = await createWorkspaceInFirestore(user.uid, title);
        set((state) => ({
          workspaces: { ...state.workspaces, [workspace.id]: workspace },
          workspaceStats: {
            ...state.workspaceStats,
            [workspace.id]: computeTaskStats([]),
          },
          workspaceTasks: {
            ...state.workspaceTasks,
            [workspace.id]: [],
          },
          currentWorkspaceId: workspace.id,
        }));
        return workspace;
      } catch (err) {
        console.error('Failed to create workspace:', err);
        return null;
      }
    },

    switchWorkspace: async (workspaceId) => {
      const user = auth.currentUser;
      if (!user) return;

      const { workspaces, currentWorkspaceId, isSwitching } = get();
      if (isSwitching || !workspaces[workspaceId] || currentWorkspaceId === workspaceId) {
        return;
      }

      set({ currentWorkspaceId: workspaceId, isSwitching: true });
      try {
        await setLastWorkspaceInFirestore(user.uid, workspaceId);
      } catch (err) {
        console.error('Failed to switch workspace:', err);
      } finally {
        set({ isSwitching: false });
      }
    },

    updateWorkspace: async (workspaceId, updates) => {
      const user = auth.currentUser;
      if (!user) return;

      const workspace = get().workspaces[workspaceId];
      if (!workspace) return;

      try {
        const updated = await updateWorkspaceInFirestore(user.uid, workspace, updates);
        set((state) => ({
          workspaces: { ...state.workspaces, [workspaceId]: updated },
        }));

        if (updates.title && updated.isShared && updated.shareId) {
          await syncSharedChart(updated.shareId, { title: updated.title });
        }
      } catch (err) {
        console.error('Failed to update workspace:', err);
        throw err;
      }
    },

    updateTaskStatusInWorkspace: async (workspaceId, taskId, status) => {
      const user = auth.currentUser;
      const workspace = get().workspaces[workspaceId];
      const previousTasks = get().workspaceTasks[workspaceId] ?? [];
      if (!user || !workspace) {
        return { updatedTask: null, previousTasks };
      }

      const result = setTaskStatusInTree(previousTasks, taskId, status);
      if (!result.updatedTask) {
        return { updatedTask: null, previousTasks };
      }

      const nextId = Math.max(
        getMaxTaskId(result.tasks) + 1,
        Number(userDocumentSync.getLatestSnapshot()?.data?.[`nextId_${workspaceId}`] ?? 1),
      );

      set((state) => ({
        workspaceTasks: { ...state.workspaceTasks, [workspaceId]: result.tasks },
        workspaceStats: { ...state.workspaceStats, [workspaceId]: computeTaskStats(result.tasks) },
      }));

      try {
        await saveWorkspaceTasksInFirestore(user.uid, workspaceId, result.tasks, nextId);
        if (workspace.isShared && workspace.shareId) {
          await syncSharedChart(workspace.shareId, { tasks: result.tasks });
        }
      } catch (err) {
        console.error('Failed to update task status from dashboard:', err);
        set((state) => ({
          workspaceTasks: { ...state.workspaceTasks, [workspaceId]: previousTasks },
          workspaceStats: {
            ...state.workspaceStats,
            [workspaceId]: computeTaskStats(previousTasks),
          },
        }));
        throw err;
      }

      return { updatedTask: result.updatedTask, previousTasks };
    },

    restoreWorkspaceTasksSnapshot: async (workspaceId, previousTasks) => {
      const user = auth.currentUser;
      const workspace = get().workspaces[workspaceId];
      if (!user || !workspace) return;

      const sanitized = sanitizeTaskTree(previousTasks);
      const nextId = Math.max(
        getMaxTaskId(sanitized) + 1,
        Number(userDocumentSync.getLatestSnapshot()?.data?.[`nextId_${workspaceId}`] ?? 1),
      );

      set((state) => ({
        workspaceTasks: { ...state.workspaceTasks, [workspaceId]: sanitized },
        workspaceStats: { ...state.workspaceStats, [workspaceId]: computeTaskStats(sanitized) },
      }));

      await saveWorkspaceTasksInFirestore(user.uid, workspaceId, sanitized, nextId);
      if (workspace.isShared && workspace.shareId) {
        await syncSharedChart(workspace.shareId, { tasks: sanitized });
      }
    },

    saveBaseline: async (workspaceId, tasks) => {
      const user = auth.currentUser;
      const workspace = get().workspaces[workspaceId];
      if (!user || !workspace) return null;

      const baseline = createWorkspaceBaseline(tasks);
      const updated = await updateWorkspaceInFirestore(user.uid, workspace, { baseline });
      set((state) => ({
        workspaces: { ...state.workspaces, [workspaceId]: updated },
      }));

      if (updated.isShared && updated.shareId) {
        await syncSharedChart(updated.shareId, { baseline });
      }
      return baseline;
    },

    clearBaseline: async (workspaceId) => {
      const user = auth.currentUser;
      const workspace = get().workspaces[workspaceId];
      if (!user || !workspace) return;

      const updated = await updateWorkspaceInFirestore(user.uid, workspace, { baseline: null });
      set((state) => ({
        workspaces: { ...state.workspaces, [workspaceId]: updated },
      }));

      if (updated.isShared && updated.shareId) {
        await syncSharedChart(updated.shareId, { baseline: null });
      }
    },

    deleteWorkspace: async (workspaceId) => {
      const user = auth.currentUser;
      if (!user) return;

      const { workspaces, currentWorkspaceId } = get();
      const target = workspaces[workspaceId];
      if (!target) return;

      const remainingIds = Object.keys(workspaces).filter((id) => id !== workspaceId);
      const nextCurrentId =
        currentWorkspaceId === workspaceId ? (remainingIds[0] ?? null) : currentWorkspaceId;

      try {
        await deleteWorkspaceInFirestore(user.uid, workspaceId, nextCurrentId);
        if (target.shareId) {
          await deleteOrphanedShareDoc(target.shareId);
        }

        const nextWorkspaces = { ...workspaces };
        delete nextWorkspaces[workspaceId];
        const nextTasks = { ...get().workspaceTasks };
        delete nextTasks[workspaceId];
        const nextStats = { ...get().workspaceStats };
        delete nextStats[workspaceId];
        set({
          workspaces: nextWorkspaces,
          workspaceTasks: nextTasks,
          workspaceStats: nextStats,
          currentWorkspaceId: nextCurrentId,
        });
      } catch (err) {
        console.error('Failed to delete workspace:', err);
        throw err;
      }
    },

    enableSharing: async (workspaceId, tasks, preferences, ownerName) => {
      const user = auth.currentUser;
      const workspace = get().workspaces[workspaceId];
      if (!user || !workspace) return null;

      const updated = await enableWorkspaceShare({
        uid: user.uid,
        ownerName,
        workspace,
        tasks,
        preferences,
      });

      set((state) => ({
        workspaces: { ...state.workspaces, [workspaceId]: updated },
      }));

      return updated;
    },

    regenerateSharing: async (workspaceId, tasks, preferences, ownerName) => {
      const user = auth.currentUser;
      const workspace = get().workspaces[workspaceId];
      if (!user || !workspace) return null;

      const updated = await regenerateWorkspaceShare({
        uid: user.uid,
        ownerName,
        workspace,
        tasks,
        preferences,
      });

      set((state) => ({
        workspaces: { ...state.workspaces, [workspaceId]: updated },
      }));

      return updated;
    },

    updateWorkspaceEditors: async (workspaceId, tasks, preferences, ownerName, editorEmails) => {
      const user = auth.currentUser;
      const workspace = get().workspaces[workspaceId];
      if (!user || !workspace) return null;

      const updated = await updateWorkspaceEditorEmails({
        uid: user.uid,
        ownerName,
        workspace,
        tasks,
        preferences,
        editorEmails,
      });

      set((state) => ({
        workspaces: { ...state.workspaces, [workspaceId]: updated },
      }));

      return updated;
    },

    disableSharing: async (workspaceId) => {
      const user = auth.currentUser;
      const workspace = get().workspaces[workspaceId];
      if (!user || !workspace) return;

      const { workspace: updated, recoveredTasks } = await disableWorkspaceShare(
        user.uid,
        workspace,
      );
      set((state) => ({
        workspaces: { ...state.workspaces, [workspaceId]: updated },
        ...(recoveredTasks
          ? {
              workspaceTasks: { ...state.workspaceTasks, [workspaceId]: recoveredTasks },
              workspaceStats: {
                ...state.workspaceStats,
                [workspaceId]: computeTaskStats(recoveredTasks),
              },
            }
          : {}),
      }));
    },

    syncSharedPreferences: async (workspaceId, preferences) => {
      const workspace = get().workspaces[workspaceId];
      if (!workspace?.isShared || !workspace.shareId) return;
      await syncSharedChart(workspace.shareId, {
        preferences: extractSharedViewPrefs(preferences),
      });
    },

    duplicateSharedChart: async (sharedChart) => {
      const user = auth.currentUser;
      if (!user) return null;

      const created = await duplicateSharedChartForUser(
        user.uid,
        sharedChart,
        get().workspaces,
      );

      set((state) => ({
        workspaces: { ...state.workspaces, [created.id]: created },
        workspaceStats: {
          ...state.workspaceStats,
          [created.id]: computeTaskStats(sharedChart.tasks),
        },
        workspaceTasks: {
          ...state.workspaceTasks,
          [created.id]: sanitizeTaskTree(sharedChart.tasks),
        },
        currentWorkspaceId: created.id,
      }));

      return created;
    },
  })),
);
