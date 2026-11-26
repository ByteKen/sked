import {
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { sanitizeTaskTree } from '@/domain/taskTree';
import {
  DEFAULT_PREFERENCES,
  type SharedChart,
  type SharedChartViewPrefs,
  type Task,
  type UserPreferences,
  type Workspace,
} from '@/types';
import { updateWorkspaceInFirestore } from './userRepository';

const SHARE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const SHARE_ID_LENGTH = 16;

export function generateShareId(): string {
  const bytes = new Uint8Array(SHARE_ID_LENGTH);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  let id = '';
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i] ?? 0;
    id += SHARE_ALPHABET[byte % SHARE_ALPHABET.length];
  }
  return id;
}

export function buildShareUrl(shareId: string): string {
  if (typeof window === 'undefined') {
    return `/share/${shareId}`;
  }
  return `${window.location.origin}/share/${shareId}`;
}

export function extractSharedViewPrefs(prefs: Partial<UserPreferences>): SharedChartViewPrefs {
  return {
    useRoundedSubtasks: prefs.useRoundedSubtasks ?? DEFAULT_PREFERENCES.useRoundedSubtasks,
    taskLabelPosition: prefs.taskLabelPosition ?? DEFAULT_PREFERENCES.taskLabelPosition,
    subtaskLabelPosition: prefs.subtaskLabelPosition ?? DEFAULT_PREFERENCES.subtaskLabelPosition,
    barHeight: prefs.barHeight ?? DEFAULT_PREFERENCES.barHeight,
    showDependencyLines: prefs.showDependencyLines ?? DEFAULT_PREFERENCES.showDependencyLines,
    showSubtaskConnectors: prefs.showSubtaskConnectors ?? DEFAULT_PREFERENCES.showSubtaskConnectors,
    showTaskDescriptions: prefs.showTaskDescriptions ?? DEFAULT_PREFERENCES.showTaskDescriptions,
  };
}

export interface EnableShareParams {
  uid: string;
  ownerName: string;
  workspace: Workspace;
  tasks: readonly Task[];
  preferences: UserPreferences;
}

export async function enableWorkspaceShare(params: EnableShareParams): Promise<Workspace> {
  const { uid, ownerName, workspace, tasks, preferences } = params;
  const shareId = workspace.shareId || generateShareId();
  const now = new Date().toISOString();

  const sharedDoc: SharedChart = {
    shareId,
    ownerId: uid,
    ownerName,
    workspaceId: workspace.id,
    title: workspace.title,
    tasks: sanitizeTaskTree(tasks),
    preferences: extractSharedViewPrefs(preferences),
    createdAt: workspace.sharedAt || now,
    updatedAt: now,
  };

  await setDoc(doc(db, 'sharedCharts', shareId), sharedDoc);

  return updateWorkspaceInFirestore(uid, workspace, {
    shareId,
    isShared: true,
    sharedAt: sharedDoc.createdAt,
  });
}

export async function regenerateWorkspaceShare(params: EnableShareParams): Promise<Workspace> {
  const { uid, ownerName, workspace, tasks, preferences } = params;
  const previousShareId = workspace.shareId;
  const nextShareId = generateShareId();
  const now = new Date().toISOString();

  const sharedDoc: SharedChart = {
    shareId: nextShareId,
    ownerId: uid,
    ownerName,
    workspaceId: workspace.id,
    title: workspace.title,
    tasks: sanitizeTaskTree(tasks),
    preferences: extractSharedViewPrefs(preferences),
    createdAt: now,
    updatedAt: now,
  };

  // Write the new link first, update user metadata, then revoke the previous share doc
  await setDoc(doc(db, 'sharedCharts', nextShareId), sharedDoc);
  const updatedWorkspace = await updateWorkspaceInFirestore(uid, workspace, {
    shareId: nextShareId,
    isShared: true,
    sharedAt: now,
  });

  if (previousShareId && previousShareId !== nextShareId) {
    try {
      await deleteDoc(doc(db, 'sharedCharts', previousShareId));
    } catch (err) {
      console.warn('Could not delete previous share link document:', err);
    }
  }

  return updatedWorkspace;
}

export async function disableWorkspaceShare(
  uid: string,
  workspace: Workspace,
): Promise<Workspace> {
  const shareIdToDelete = workspace.shareId;
  const updatedWorkspace = await updateWorkspaceInFirestore(uid, workspace, {
    isShared: false,
    shareId: null,
    sharedAt: null,
  });

  if (shareIdToDelete) {
    try {
      await deleteDoc(doc(db, 'sharedCharts', shareIdToDelete));
    } catch (err) {
      console.warn('Could not delete disabled share document:', err);
    }
  }

  return updatedWorkspace;
}

export async function deleteOrphanedShareDoc(shareId: string | null | undefined): Promise<void> {
  if (!shareId) return;
  try {
    await deleteDoc(doc(db, 'sharedCharts', shareId));
  } catch (err) {
    console.warn('Failed to clean up shared chart document on workspace delete:', err);
  }
}

export interface SharedChartSyncPatch {
  title?: string;
  ownerName?: string;
  tasks?: readonly Task[];
  preferences?: SharedChartViewPrefs;
}

/**
 * Live-syncs owner edits into the public shared chart document.
 * Uses `updateDoc` so a disabled/deleted share document is never accidentally recreated.
 */
export async function syncSharedChart(
  shareId: string,
  patch: SharedChartSyncPatch,
): Promise<void> {
  const payload: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  if (patch.title !== undefined) {
    payload.title = patch.title;
  }
  if (patch.ownerName !== undefined) {
    payload.ownerName = patch.ownerName;
  }
  if (patch.tasks !== undefined) {
    payload.tasks = sanitizeTaskTree(patch.tasks);
  }
  if (patch.preferences !== undefined) {
    payload.preferences = patch.preferences;
  }

  try {
    await updateDoc(doc(db, 'sharedCharts', shareId), payload);
  } catch (err) {
    console.warn('Live share sync skipped:', err);
  }
}

/**
 * Propagates an updated owner display name across all active shared Gantt charts.
 */
export async function syncOwnerNameAcrossSharedCharts(
  shareIds: readonly string[],
  ownerName: string,
): Promise<void> {
  if (shareIds.length === 0) return;
  await Promise.allSettled(
    shareIds.map((shareId) => syncSharedChart(shareId, { ownerName })),
  );
}

export function subscribeToSharedChart(
  shareId: string,
  onData: (chart: SharedChart | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const shareRef = doc(db, 'sharedCharts', shareId);
  return onSnapshot(
    shareRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null);
        return;
      }
      const raw = snapshot.data() as Partial<SharedChart>;
      const chart: SharedChart = {
        shareId: raw.shareId || shareId,
        ownerId: raw.ownerId || '',
        ownerName: raw.ownerName || 'Workspace Owner',
        workspaceId: raw.workspaceId || '',
        title: raw.title || 'Shared Gantt Chart',
        tasks: Array.isArray(raw.tasks) ? sanitizeTaskTree(raw.tasks) : [],
        preferences: extractSharedViewPrefs(raw.preferences ?? {}),
        createdAt: raw.createdAt || new Date().toISOString(),
        updatedAt: raw.updatedAt || new Date().toISOString(),
      };
      onData(chart);
    },
    (error) => {
      console.error('Shared chart subscription error:', error);
      onError(error);
    },
  );
}
