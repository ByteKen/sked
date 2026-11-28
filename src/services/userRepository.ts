import { deleteDoc, deleteField, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { cloneTasksForWorkspace, sanitizeTaskTree } from '@/domain/taskTree';
import type { SharedChart, Task, UserPreferences, Workspace, WorkspaceMap } from '@/types';
import { deleteOrphanedShareDoc } from './shareRepository';

function createWorkspaceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `ws_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }
  return `ws_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function buildUniqueCopyTitle(baseTitle: string, existingWorkspaces: WorkspaceMap): string {
  const existingTitles = new Set(
    Object.values(existingWorkspaces).map((w) => w.title.trim().toLowerCase()),
  );
  const candidate = `${baseTitle.trim()} (Copy)`;
  if (!existingTitles.has(candidate.toLowerCase())) {
    return candidate.slice(0, 50);
  }
  for (let i = 2; i < 100; i++) {
    const numbered = `${baseTitle.trim()} (Copy ${i})`;
    if (!existingTitles.has(numbered.toLowerCase())) {
      return numbered.slice(0, 50);
    }
  }
  return `${baseTitle.trim().slice(0, 38)} (${Date.now().toString().slice(-4)})`;
}

export async function createWorkspaceInFirestore(uid: string, title: string): Promise<Workspace> {
  const now = new Date().toISOString();
  const workspaceId = createWorkspaceId();
  const workspace: Workspace = {
    id: workspaceId,
    title: title.trim(),
    createdAt: now,
    updatedAt: now,
    isShared: false,
    shareId: null,
    sharedAt: null,
  };

  const userDocRef = doc(db, 'users', uid);
  await setDoc(
    userDocRef,
    {
      workspaces: {
        [workspaceId]: workspace,
      },
      lastWorkspaceId: workspaceId,
      [`tasks_${workspaceId}`]: [],
      [`nextId_${workspaceId}`]: 1,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return workspace;
}

export async function updateWorkspaceInFirestore(
  uid: string,
  workspace: Workspace,
  updates: Partial<Workspace>,
): Promise<Workspace> {
  const updatedWorkspace: Workspace = {
    ...workspace,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  const userDocRef = doc(db, 'users', uid);
  await setDoc(
    userDocRef,
    {
      workspaces: {
        [workspace.id]: updatedWorkspace,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return updatedWorkspace;
}

export async function setLastWorkspaceInFirestore(uid: string, workspaceId: string): Promise<void> {
  const userDocRef = doc(db, 'users', uid);
  await setDoc(
    userDocRef,
    {
      lastWorkspaceId: workspaceId,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function deleteWorkspaceInFirestore(
  uid: string,
  workspaceId: string,
  nextLastWorkspaceId: string | null,
): Promise<void> {
  const userDocRef = doc(db, 'users', uid);
  await setDoc(
    userDocRef,
    {
      workspaces: {
        [workspaceId]: deleteField(),
      },
      [`tasks_${workspaceId}`]: deleteField(),
      [`nextId_${workspaceId}`]: deleteField(),
      ...(nextLastWorkspaceId ? { lastWorkspaceId: nextLastWorkspaceId } : {}),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function saveWorkspaceTasksInFirestore(
  uid: string,
  workspaceId: string,
  tasks: readonly Task[],
  nextId: number,
): Promise<void> {
  const userDocRef = doc(db, 'users', uid);
  await setDoc(
    userDocRef,
    {
      [`tasks_${workspaceId}`]: sanitizeTaskTree(tasks),
      [`nextId_${workspaceId}`]: nextId,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function saveDisplayNameInFirestore(
  uid: string,
  displayName: string,
): Promise<void> {
  const userDocRef = doc(db, 'users', uid);
  await setDoc(
    userDocRef,
    {
      profile: {
        displayName: displayName.trim(),
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function savePreferencesInFirestore(
  uid: string,
  preferences: UserPreferences,
): Promise<void> {
  const userDocRef = doc(db, 'users', uid);
  await setDoc(
    userDocRef,
    {
      preferences: {
        useRoundedSubtasks: preferences.useRoundedSubtasks,
        theme: preferences.theme,
        exportTheme: preferences.exportTheme,
        taskLabelPosition: preferences.taskLabelPosition,
        subtaskLabelPosition: preferences.subtaskLabelPosition,
        showDependencyLinesOnExport: preferences.showDependencyLinesOnExport,
        barHeight: preferences.barHeight,
        showDependencyLines: preferences.showDependencyLines,
        showSubtaskConnectors: preferences.showSubtaskConnectors,
        showTaskDescriptions: preferences.showTaskDescriptions,
        enableAnimations: preferences.enableAnimations,
        showBarTooltips: preferences.showBarTooltips,
        showProgressPercentages: preferences.showProgressPercentages,
        showTodayLine: preferences.showTodayLine,
        highlightWeekends: preferences.highlightWeekends,
        showCriticalPathByDefault: preferences.showCriticalPathByDefault,
        autoCascadeDependencies: preferences.autoCascadeDependencies,
        enableInAppReminders: preferences.enableInAppReminders,
        reminderSoundEnabled: preferences.reminderSoundEnabled,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/**
 * Atomically duplicate a public shared Gantt chart into the signed-in user's workspaces.
 */
export async function duplicateSharedChartForUser(
  uid: string,
  sharedChart: SharedChart,
  existingWorkspaces: WorkspaceMap,
): Promise<Workspace> {
  const now = new Date().toISOString();
  const workspaceId = createWorkspaceId();
  const title = buildUniqueCopyTitle(sharedChart.title, existingWorkspaces);
  const { tasks, nextId } = cloneTasksForWorkspace(sharedChart.tasks);

  const workspace: Workspace = {
    id: workspaceId,
    title,
    createdAt: now,
    updatedAt: now,
    isShared: false,
    shareId: null,
    sharedAt: null,
  };

  const userDocRef = doc(db, 'users', uid);
  await setDoc(
    userDocRef,
    {
      workspaces: {
        [workspaceId]: workspace,
      },
      lastWorkspaceId: workspaceId,
      [`tasks_${workspaceId}`]: tasks,
      [`nextId_${workspaceId}`]: nextId,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return workspace;
}

/**
 * Permanently deletes all public share documents owned by the user and their private
 * `users/{uid}` Firestore document. Must be invoked while the user is still authenticated.
 */
export async function deleteUserAccountData(uid: string): Promise<string[]> {
  const userDocRef = doc(db, 'users', uid);
  const removedShareIds: string[] = [];

  try {
    const snap = await getDoc(userDocRef);
    if (snap.exists()) {
      const data = snap.data() as { workspaces?: WorkspaceMap };
      const workspaces = data.workspaces ?? {};
      for (const ws of Object.values(workspaces)) {
        if (ws?.shareId) {
          removedShareIds.push(ws.shareId);
        }
      }
    }
  } catch (err) {
    console.warn('Could not enumerate workspaces prior to account deletion:', err);
  }

  if (removedShareIds.length > 0) {
    await Promise.allSettled(removedShareIds.map((shareId) => deleteOrphanedShareDoc(shareId)));
  }

  await deleteDoc(userDocRef);
  return removedShareIds;
}
