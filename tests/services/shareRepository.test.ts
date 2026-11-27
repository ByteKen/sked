import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFERENCES, type Workspace } from '@/types';

const mockSetDoc = vi.fn();
const mockUpdateDoc = vi.fn();
const mockDeleteDoc = vi.fn();
const mockGetDoc = vi.fn();
const mockRunTransaction = vi.fn();
const mockDoc = vi.fn((_db: unknown, collection: string, id: string) => ({ collection, id }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ collection: name })),
  doc: (db: unknown, collection: string, id: string) => mockDoc(db, collection, id),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
  runTransaction: (...args: unknown[]) => mockRunTransaction(...args),
  query: vi.fn((...args: unknown[]) => ({ query: args })),
  where: vi.fn((...args: unknown[]) => ({ where: args })),
  onSnapshot: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
  deleteField: vi.fn(() => 'DELETE_FIELD'),
}));

vi.mock('@/config/firebase', () => ({
  db: {},
}));

import {
  checkSharedChartEditorAccess,
  commitCollaborativeChartMutation,
  disableWorkspaceShare,
  enableWorkspaceShare,
  generateShareId,
  regenerateWorkspaceShare,
  syncSharedChart,
  updateWorkspaceEditorEmails,
} from '@/services/shareRepository';

const baseWorkspace: Workspace = {
  id: 'ws_1',
  title: 'Product Launch',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('shareRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetDoc.mockResolvedValue(undefined);
    mockUpdateDoc.mockResolvedValue(undefined);
    mockDeleteDoc.mockResolvedValue(undefined);
    mockGetDoc.mockResolvedValue({ exists: () => false });
  });

  it('generates URL-safe 16-char share IDs', () => {
    const id1 = generateShareId();
    const id2 = generateShareId();
    expect(id1).toMatch(/^[A-Za-z0-9]{16}$/);
    expect(id1).not.toBe(id2);
  });

  it('enables sharing by writing sharedCharts/{shareId} and updating user workspace metadata', async () => {
    const updated = await enableWorkspaceShare({
      uid: 'user-1',
      ownerName: 'Jane Doe',
      workspace: baseWorkspace,
      tasks: [{ id: 1, name: 'Kickoff', start: '2026-01-05', end: '2026-01-10', progress: 50 }],
      preferences: DEFAULT_PREFERENCES,
    });

    expect(updated.isShared).toBe(true);
    expect(updated.shareId).toMatch(/^[A-Za-z0-9]{16}$/);
    expect(mockSetDoc).toHaveBeenCalledTimes(2);
    expect(mockDoc).toHaveBeenCalledWith({}, 'sharedCharts', updated.shareId);
    // Public sharedCharts document must never expose an editorEmails array
    const [, publicPayload] = mockSetDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(publicPayload.hasEditors).toBe(false);
    expect(publicPayload).not.toHaveProperty('editorEmails');
  });

  it('regenerates share link, isolates editorEmails in sharedChartAccess, and deletes old docs', async () => {
    const sharedWorkspace: Workspace = {
      ...baseWorkspace,
      isShared: true,
      shareId: 'OldShareId123456',
      editorEmails: ['maya@gmail.com'],
    };

    const regenerated = await regenerateWorkspaceShare({
      uid: 'user-1',
      ownerName: 'Jane Doe',
      workspace: sharedWorkspace,
      tasks: [],
      preferences: DEFAULT_PREFERENCES,
    });

    expect(regenerated.shareId).not.toBe('OldShareId123456');
    expect(regenerated.editorEmails).toEqual(['maya@gmail.com']);
    const publicWrite = mockSetDoc.mock.calls.find(
      (call) => (call[0] as { collection?: string }).collection === 'sharedCharts',
    );
    const accessWrite = mockSetDoc.mock.calls.find(
      (call) => (call[0] as { collection?: string }).collection === 'sharedChartAccess',
    );
    expect((publicWrite?.[1] as Record<string, unknown>).hasEditors).toBe(true);
    expect(publicWrite?.[1]).not.toHaveProperty('editorEmails');
    expect((accessWrite?.[1] as Record<string, unknown>).editorEmails).toEqual(['maya@gmail.com']);
    expect(mockDeleteDoc).toHaveBeenCalledWith({
      collection: 'sharedCharts',
      id: 'OldShareId123456',
    });
    expect(mockDeleteDoc).toHaveBeenCalledWith({
      collection: 'sharedChartAccess',
      id: 'OldShareId123456',
    });
  });

  it('disables sharing, snapshots collaborator edits back to owner doc first, and deletes the public doc', async () => {
    const sharedWorkspace: Workspace = {
      ...baseWorkspace,
      isShared: true,
      shareId: 'ActiveShare12345',
      editorEmails: ['maya@gmail.com'],
    };

    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        shareId: 'ActiveShare12345',
        ownerId: 'user-1',
        tasks: [{ id: 1, name: 'Collaborator Edit', start: '2026-01-05', end: '2026-01-09', progress: 80 }],
        nextId: 2,
      }),
    });

    const { workspace: disabled, recoveredTasks } = await disableWorkspaceShare(
      'user-1',
      sharedWorkspace,
    );

    expect(disabled.isShared).toBe(false);
    expect(disabled.shareId).toBeNull();
    expect(disabled.editorEmails).toEqual([]);
    expect(recoveredTasks?.[0]?.name).toBe('Collaborator Edit');
    expect(mockDeleteDoc).toHaveBeenCalledWith({
      collection: 'sharedCharts',
      id: 'ActiveShare12345',
    });
  });

  it('syncs live task updates using updateDoc and mirrors title updates to private sharedChartAccess', async () => {
    await syncSharedChart('LiveShare1234567', {
      title: 'Renamed Plan',
      tasks: [{ id: 1, name: 'Milestone', start: '2026-02-01', end: '2026-02-01', progress: 100 }],
    });

    expect(mockUpdateDoc).toHaveBeenCalledTimes(2);
    const [ref, payload] = mockUpdateDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(ref).toEqual({ collection: 'sharedCharts', id: 'LiveShare1234567' });
    expect(payload.title).toBe('Renamed Plan');
    expect(Array.isArray(payload.tasks)).toBe(true);

    const [accessRef, accessPayload] = mockUpdateDoc.mock.calls[1] as [
      unknown,
      Record<string, unknown>,
    ];
    expect(accessRef).toEqual({ collection: 'sharedChartAccess', id: 'LiveShare1234567' });
    expect(accessPayload.title).toBe('Renamed Plan');

    // Task-only live sync writes ONCE (sharedCharts only, zero extra write to sharedChartAccess)
    mockUpdateDoc.mockClear();
    await syncSharedChart('LiveShare1234567', {
      tasks: [{ id: 1, name: 'Milestone', start: '2026-02-01', end: '2026-02-02', progress: 100 }],
    });
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    expect(mockUpdateDoc.mock.calls[0]?.[0]).toEqual({
      collection: 'sharedCharts',
      id: 'LiveShare1234567',
    });
  });

  it('auto-enables sharing when inviting the first editor email and normalizes addresses', async () => {
    const updated = await updateWorkspaceEditorEmails({
      uid: 'user-1',
      ownerName: 'Jane Doe',
      workspace: baseWorkspace,
      tasks: [],
      preferences: DEFAULT_PREFERENCES,
      editorEmails: ['  Maya@Example.COM  '],
    });

    expect(updated.isShared).toBe(true);
    expect(updated.editorEmails).toEqual(['maya@example.com']);
    const accessWrite = mockSetDoc.mock.calls.find(
      (call) => (call[0] as { collection?: string }).collection === 'sharedChartAccess',
    );
    expect((accessWrite?.[1] as Record<string, unknown>).editorEmails).toEqual(['maya@example.com']);
  });

  it('checks private sharedChartAccess permissions and fails closed on denial', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        shareId: 'Share123',
        ownerId: 'owner-1',
        editorEmails: ['maya@example.com'],
      }),
    });
    await expect(checkSharedChartEditorAccess('Share123', 'MAYA@example.com')).resolves.toBe(true);

    mockGetDoc.mockRejectedValueOnce(new Error('Missing or insufficient permissions.'));
    await expect(checkSharedChartEditorAccess('Share123', 'stranger@example.com')).resolves.toBe(
      false,
    );
  });

  it('commits collaborative updates inside a single Firestore transaction without leaking editor email', async () => {
    const txUpdate = vi.fn();
    mockRunTransaction.mockImplementation(
      async (_db: unknown, runner: (tx: unknown) => Promise<unknown>) =>
        runner({
          get: async () => ({
            exists: () => true,
            data: () => ({
              shareId: 'Collab1234567890',
              ownerId: 'owner-1',
              version: 3,
              nextId: 2,
              tasks: [
                { id: 1, name: 'API', start: '2026-03-01', end: '2026-03-05', progress: 20 },
              ],
            }),
          }),
          update: txUpdate,
        }),
    );

    // 1. No-op mutation skips tx.update completely (0 Firestore writes!)
    await commitCollaborativeChartMutation({
      shareId: 'Collab1234567890',
      editor: { uid: 'ed-1', name: 'Maya' },
      mutate: (curr) => ({ tasks: curr.tasks, nextId: curr.nextId }),
    });
    expect(txUpdate).not.toHaveBeenCalled();

    // 2. Real mutation bumps version and stamps lastEditedBy (uid, name, at only — zero email PII)
    const res = await commitCollaborativeChartMutation({
      shareId: 'Collab1234567890',
      editor: { uid: 'ed-1', name: 'Maya' },
      mutate: (curr) => ({
        tasks: curr.tasks.map((t) => ({ ...t, progress: 100, isDone: true })),
        nextId: curr.nextId,
      }),
    });

    expect(res?.version).toBe(4);
    expect(txUpdate).toHaveBeenCalledTimes(1);
    const [, patch] = txUpdate.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(patch.version).toBe(4);
    expect(patch.lastEditedBy).toMatchObject({ uid: 'ed-1', name: 'Maya' });
    expect(patch.lastEditedBy).not.toHaveProperty('email');
  });
});
