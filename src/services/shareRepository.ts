import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  haveTasksChanged,
  normalizeEditorEmails,
  normalizeEmail,
} from '@/domain/collaboration';
import { getMaxTaskId, recalculateParentProgress, sanitizeTaskTree } from '@/domain/taskTree';
import {
  DEFAULT_PREFERENCES,
  type ChartEditorAttribution,
  type SharedChart,
  type SharedChartAccess,
  type SharedChartViewPrefs,
  type Task,
  type UserPreferences,
  type Workspace,
  type WorkspaceBaseline,
} from '@/types';
import { saveWorkspaceTasksInFirestore, updateWorkspaceInFirestore } from './userRepository';

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

function hydrateSharedChart(shareId: string, raw: Partial<SharedChart>): SharedChart {
  const tasks = Array.isArray(raw.tasks)
    ? recalculateParentProgress(sanitizeTaskTree(raw.tasks))
    : [];
  const legacyEditorEmails = normalizeEditorEmails(raw.editorEmails);
  const lastEditedBy =
    raw.lastEditedBy && typeof raw.lastEditedBy === 'object'
      ? {
          uid: raw.lastEditedBy.uid || '',
          name: raw.lastEditedBy.name || 'Collaborator',
          at: raw.lastEditedBy.at || '',
        }
      : null;

  return {
    shareId: raw.shareId || shareId,
    ownerId: raw.ownerId || '',
    ownerName: raw.ownerName || 'Workspace Owner',
    workspaceId: raw.workspaceId || '',
    title: raw.title || 'Shared Project',
    tasks,
    nextId:
      typeof raw.nextId === 'number' && Number.isFinite(raw.nextId)
        ? Math.max(raw.nextId, getMaxTaskId(tasks) + 1)
        : getMaxTaskId(tasks) + 1,
    version: typeof raw.version === 'number' && Number.isFinite(raw.version) ? raw.version : 1,
    hasEditors: Boolean(raw.hasEditors || legacyEditorEmails.length > 0),
    ...(legacyEditorEmails.length > 0 ? { editorEmails: legacyEditorEmails } : {}),
    lastEditedBy,
    preferences: extractSharedViewPrefs(raw.preferences ?? {}),
    baseline: raw.baseline ?? null,
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

function hydrateSharedChartAccess(
  shareId: string,
  raw: Partial<SharedChartAccess>,
): SharedChartAccess {
  return {
    shareId: raw.shareId || shareId,
    ownerId: raw.ownerId || '',
    ownerName: raw.ownerName || 'Workspace Owner',
    workspaceId: raw.workspaceId || '',
    title: raw.title || 'Shared Project',
    editorEmails: normalizeEditorEmails(raw.editorEmails),
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

function buildSharedChartAccessDoc(params: {
  shareId: string;
  ownerId: string;
  ownerName: string;
  workspaceId: string;
  title: string;
  editorEmails: string[];
  createdAt: string;
  updatedAt: string;
}): SharedChartAccess {
  return {
    shareId: params.shareId,
    ownerId: params.ownerId,
    ownerName: params.ownerName,
    workspaceId: params.workspaceId,
    title: params.title,
    editorEmails: params.editorEmails,
    createdAt: params.createdAt,
    updatedAt: params.updatedAt,
  };
}

async function deleteAccessDocQuietly(shareId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'sharedChartAccess', shareId));
  } catch {
    // Non-existent ACL doc or already cleaned up
  }
}

export interface EnableShareParams {
  uid: string;
  ownerName: string;
  workspace: Workspace;
  tasks: readonly Task[];
  preferences: UserPreferences;
  editorEmails?: readonly string[];
}

export async function enableWorkspaceShare(params: EnableShareParams): Promise<Workspace> {
  const { uid, ownerName, workspace, tasks, preferences } = params;
  const shareId = workspace.shareId || generateShareId();
  const now = new Date().toISOString();
  const sanitizedTasks = sanitizeTaskTree(tasks);
  const editorEmails = normalizeEditorEmails(params.editorEmails ?? workspace.editorEmails);

  const sharedDoc: SharedChart = {
    shareId,
    ownerId: uid,
    ownerName,
    workspaceId: workspace.id,
    title: workspace.title,
    tasks: sanitizedTasks,
    nextId: getMaxTaskId(sanitizedTasks) + 1,
    version: 1,
    hasEditors: editorEmails.length > 0,
    lastEditedBy: null,
    preferences: extractSharedViewPrefs(preferences),
    ...(workspace.baseline ? { baseline: workspace.baseline } : {}),
    createdAt: workspace.sharedAt || now,
    updatedAt: now,
  };

  await setDoc(doc(db, 'sharedCharts', shareId), sharedDoc);

  if (editorEmails.length > 0) {
    await setDoc(
      doc(db, 'sharedChartAccess', shareId),
      buildSharedChartAccessDoc({
        shareId,
        ownerId: uid,
        ownerName,
        workspaceId: workspace.id,
        title: workspace.title,
        editorEmails,
        createdAt: sharedDoc.createdAt,
        updatedAt: now,
      }),
    );
  }

  return updateWorkspaceInFirestore(uid, workspace, {
    shareId,
    isShared: true,
    sharedAt: sharedDoc.createdAt,
    editorEmails,
  });
}

export async function regenerateWorkspaceShare(params: EnableShareParams): Promise<Workspace> {
  const { uid, ownerName, workspace, tasks, preferences } = params;
  const previousShareId = workspace.shareId;
  const nextShareId = generateShareId();
  const now = new Date().toISOString();
  const sanitizedTasks = sanitizeTaskTree(tasks);
  const editorEmails = normalizeEditorEmails(params.editorEmails ?? workspace.editorEmails);

  const sharedDoc: SharedChart = {
    shareId: nextShareId,
    ownerId: uid,
    ownerName,
    workspaceId: workspace.id,
    title: workspace.title,
    tasks: sanitizedTasks,
    nextId: getMaxTaskId(sanitizedTasks) + 1,
    version: 1,
    hasEditors: editorEmails.length > 0,
    lastEditedBy: null,
    preferences: extractSharedViewPrefs(preferences),
    ...(workspace.baseline ? { baseline: workspace.baseline } : {}),
    createdAt: now,
    updatedAt: now,
  };

  // Write the new link and private ACL first, update user metadata, then revoke the previous share docs
  await setDoc(doc(db, 'sharedCharts', nextShareId), sharedDoc);
  if (editorEmails.length > 0) {
    await setDoc(
      doc(db, 'sharedChartAccess', nextShareId),
      buildSharedChartAccessDoc({
        shareId: nextShareId,
        ownerId: uid,
        ownerName,
        workspaceId: workspace.id,
        title: workspace.title,
        editorEmails,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  const updatedWorkspace = await updateWorkspaceInFirestore(uid, workspace, {
    shareId: nextShareId,
    isShared: true,
    sharedAt: now,
    editorEmails,
  });

  if (previousShareId && previousShareId !== nextShareId) {
    await Promise.allSettled([
      deleteDoc(doc(db, 'sharedCharts', previousShareId)).catch((err) => {
        console.warn('Could not delete previous share link document:', err);
      }),
      deleteAccessDocQuietly(previousShareId),
    ]);
  }

  return updatedWorkspace;
}

/**
 * Updates invited collaborator emails for a workspace.
 * Emails are stored exclusively in the private `sharedChartAccess/{shareId}` document (never on public `sharedCharts`).
 * Automatically enables sharing if the owner invites an editor before toggling the link on.
 */
export async function updateWorkspaceEditorEmails(
  params: EnableShareParams & { editorEmails: readonly string[] },
): Promise<Workspace> {
  const { uid, ownerName, workspace } = params;
  const normalized = normalizeEditorEmails(params.editorEmails);

  if (!workspace.isShared || !workspace.shareId) {
    if (normalized.length === 0) {
      return updateWorkspaceInFirestore(uid, workspace, { editorEmails: [] });
    }
    return enableWorkspaceShare({ ...params, editorEmails: normalized });
  }

  const now = new Date().toISOString();
  if (normalized.length > 0) {
    await setDoc(
      doc(db, 'sharedChartAccess', workspace.shareId),
      buildSharedChartAccessDoc({
        shareId: workspace.shareId,
        ownerId: uid,
        ownerName,
        workspaceId: workspace.id,
        title: workspace.title,
        editorEmails: normalized,
        createdAt: workspace.sharedAt || now,
        updatedAt: now,
      }),
    );
  } else {
    await deleteAccessDocQuietly(workspace.shareId);
  }

  // Scrub any legacy editorEmails array from the public chart doc and keep only a boolean flag
  await updateDoc(doc(db, 'sharedCharts', workspace.shareId), {
    hasEditors: normalized.length > 0,
    editorEmails: deleteField(),
    updatedAt: now,
  });

  return updateWorkspaceInFirestore(uid, workspace, { editorEmails: normalized });
}

export async function disableWorkspaceShare(
  uid: string,
  workspace: Workspace,
): Promise<{ workspace: Workspace; recoveredTasks: Task[] | null }> {
  const shareIdToDelete = workspace.shareId;
  let recoveredTasks: Task[] | null = null;

  // Preserve any collaborator edits into the owner's private doc BEFORE removing the shared doc
  if (shareIdToDelete && normalizeEditorEmails(workspace.editorEmails).length > 0) {
    try {
      const snap = await getDoc(doc(db, 'sharedCharts', shareIdToDelete));
      if (snap.exists()) {
        const hydrated = hydrateSharedChart(shareIdToDelete, snap.data() as Partial<SharedChart>);
        recoveredTasks = hydrated.tasks;
        await saveWorkspaceTasksInFirestore(
          uid,
          workspace.id,
          hydrated.tasks,
          hydrated.nextId ?? getMaxTaskId(hydrated.tasks) + 1,
        );
      }
    } catch (err) {
      console.warn('Could not snapshot collaborative tasks before disabling share:', err);
    }
  }

  const updatedWorkspace = await updateWorkspaceInFirestore(uid, workspace, {
    isShared: false,
    shareId: null,
    sharedAt: null,
    editorEmails: [],
  });

  if (shareIdToDelete) {
    await Promise.allSettled([
      deleteDoc(doc(db, 'sharedCharts', shareIdToDelete)).catch((err) => {
        console.warn('Could not delete disabled share document:', err);
      }),
      deleteAccessDocQuietly(shareIdToDelete),
    ]);
  }

  return { workspace: updatedWorkspace, recoveredTasks };
}

export async function deleteOrphanedShareDoc(shareId: string | null | undefined): Promise<void> {
  if (!shareId) return;
  await Promise.allSettled([
    deleteDoc(doc(db, 'sharedCharts', shareId)).catch((err) => {
      console.warn('Failed to clean up shared chart document on workspace delete:', err);
    }),
    deleteAccessDocQuietly(shareId),
  ]);
}

export interface SharedChartSyncPatch {
  title?: string;
  ownerName?: string;
  tasks?: readonly Task[];
  nextId?: number;
  preferences?: SharedChartViewPrefs;
  baseline?: WorkspaceBaseline | null;
}

/**
 * Live-syncs owner edits into the public shared chart document.
 * Uses `updateDoc` so a disabled/deleted share document is never accidentally recreated.
 */
export async function syncSharedChart(
  shareId: string,
  patch: SharedChartSyncPatch,
): Promise<void> {
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    updatedAt: now,
  };

  if (patch.title !== undefined) {
    payload.title = patch.title;
  }
  if (patch.ownerName !== undefined) {
    payload.ownerName = patch.ownerName;
  }
  if (patch.tasks !== undefined) {
    const clean = sanitizeTaskTree(patch.tasks);
    payload.tasks = clean;
    payload.nextId = patch.nextId ?? getMaxTaskId(clean) + 1;
  }
  if (patch.preferences !== undefined) {
    payload.preferences = patch.preferences;
  }
  if (patch.baseline !== undefined) {
    payload.baseline = patch.baseline;
  }

  try {
    await updateDoc(doc(db, 'sharedCharts', shareId), payload);
  } catch (err) {
    console.warn('Live share sync skipped:', err);
  }

  // Keep private ACL card metadata in sync when workspace title or owner name changes
  if (patch.title !== undefined || patch.ownerName !== undefined) {
    const accessPatch: Record<string, unknown> = { updatedAt: now };
    if (patch.title !== undefined) accessPatch.title = patch.title;
    if (patch.ownerName !== undefined) accessPatch.ownerName = patch.ownerName;
    await updateDoc(doc(db, 'sharedChartAccess', shareId), accessPatch).catch(() => {});
  }
}

export interface CollaborativeChartMutationResult {
  tasks: Task[];
  nextId: number;
  baseline?: WorkspaceBaseline | null;
}

/**
 * Conflict-safe, quota-efficient collaborative mutation on `sharedCharts/{shareId}`.
 * Runs inside a Firestore transaction (1 read + 1 write) against the latest server state so
 * concurrent editors mutating different tasks never overwrite each other's changes.
 */
export async function commitCollaborativeChartMutation(params: {
  shareId: string;
  editor: Omit<ChartEditorAttribution, 'at'>;
  mutate: (current: {
    tasks: Task[];
    nextId: number;
    baseline: WorkspaceBaseline | null;
  }) => CollaborativeChartMutationResult | null;
}): Promise<{ tasks: Task[]; nextId: number; version: number } | null> {
  const { shareId, editor, mutate } = params;
  const shareRef = doc(db, 'sharedCharts', shareId);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(shareRef);
    if (!snap.exists()) return null;

    const current = hydrateSharedChart(shareId, snap.data() as Partial<SharedChart>);
    const currentNextId = current.nextId ?? getMaxTaskId(current.tasks) + 1;
    const outcome = mutate({
      tasks: current.tasks,
      nextId: currentNextId,
      baseline: current.baseline ?? null,
    });
    if (!outcome) return null;

    const sanitizedTasks = sanitizeTaskTree(outcome.tasks);
    const nextBaseline =
      outcome.baseline !== undefined ? outcome.baseline : (current.baseline ?? null);
    const tasksChanged = haveTasksChanged(current.tasks, sanitizedTasks);
    const baselineChanged =
      outcome.baseline !== undefined &&
      JSON.stringify(current.baseline ?? null) !== JSON.stringify(nextBaseline);

    if (!tasksChanged && !baselineChanged) {
      return {
        tasks: current.tasks,
        nextId: currentNextId,
        version: current.version ?? 1,
      };
    }

    const now = new Date().toISOString();
    const nextVersion = (current.version ?? 1) + 1;
    const resolvedNextId = Math.max(outcome.nextId, getMaxTaskId(sanitizedTasks) + 1);
    const attribution: ChartEditorAttribution = {
      uid: editor.uid,
      name: editor.name,
      at: now,
    };

    const patch: Record<string, unknown> = {
      tasks: sanitizedTasks,
      nextId: resolvedNextId,
      version: nextVersion,
      lastEditedBy: attribution,
      updatedAt: now,
    };
    if (outcome.baseline !== undefined) {
      patch.baseline = nextBaseline;
    }

    tx.update(shareRef, patch);
    return {
      tasks: sanitizedTasks,
      nextId: resolvedNextId,
      version: nextVersion,
    };
  });
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
      onData(hydrateSharedChart(shareId, snapshot.data() as Partial<SharedChart>));
    },
    (error) => {
      console.error('Shared chart subscription error:', error);
      onError(error);
    },
  );
}

/**
 * Checks whether the signed-in user's email has editor access via the private
 * `sharedChartAccess/{shareId}` ACL document. Returns false gracefully if unauthorized.
 */
export async function checkSharedChartEditorAccess(
  shareId: string,
  userEmail: string,
): Promise<boolean> {
  const normalized = normalizeEmail(userEmail);
  if (!shareId || !normalized) return false;
  try {
    const snap = await getDoc(doc(db, 'sharedChartAccess', shareId));
    if (!snap.exists()) return false;
    const access = hydrateSharedChartAccess(shareId, snap.data() as Partial<SharedChartAccess>);
    return access.editorEmails.includes(normalized);
  } catch {
    return false;
  }
}

/**
 * Subscribes to all shared charts where the signed-in user's verified Google email is listed as
 * an editor inside the private `sharedChartAccess` collection (never exposed on public docs).
 */
export function subscribeToSharedWithMeCharts(
  userEmail: string,
  onData: (charts: SharedChartAccess[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const normalized = normalizeEmail(userEmail);
  if (!normalized) {
    onData([]);
    return () => {};
  }

  const q = query(
    collection(db, 'sharedChartAccess'),
    where('editorEmails', 'array-contains', normalized),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const charts: SharedChartAccess[] = [];
      snapshot.forEach((docSnap) => {
        charts.push(
          hydrateSharedChartAccess(docSnap.id, docSnap.data() as Partial<SharedChartAccess>),
        );
      });
      charts.sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt).getTime() -
          new Date(a.updatedAt || a.createdAt).getTime(),
      );
      onData(charts);
    },
    (error) => {
      console.warn('Shared-with-me subscription error:', error);
      onError?.(error);
    },
  );
}
