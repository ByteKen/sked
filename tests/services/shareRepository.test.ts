import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFERENCES, type Workspace } from '@/types';

const mockSetDoc = vi.fn();
const mockUpdateDoc = vi.fn();
const mockDeleteDoc = vi.fn();
const mockDoc = vi.fn((_db: unknown, collection: string, id: string) => ({ collection, id }));

vi.mock('firebase/firestore', () => ({
  doc: (db: unknown, collection: string, id: string) => mockDoc(db, collection, id),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
  onSnapshot: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
  deleteField: vi.fn(() => 'DELETE_FIELD'),
}));

vi.mock('@/config/firebase', () => ({
  db: {},
}));

import {
  disableWorkspaceShare,
  enableWorkspaceShare,
  generateShareId,
  regenerateWorkspaceShare,
  syncSharedChart,
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
  });

  it('regenerates share link and deletes the old public document', async () => {
    const sharedWorkspace: Workspace = {
      ...baseWorkspace,
      isShared: true,
      shareId: 'OldShareId123456',
    };

    const regenerated = await regenerateWorkspaceShare({
      uid: 'user-1',
      ownerName: 'Jane Doe',
      workspace: sharedWorkspace,
      tasks: [],
      preferences: DEFAULT_PREFERENCES,
    });

    expect(regenerated.shareId).not.toBe('OldShareId123456');
    expect(mockDeleteDoc).toHaveBeenCalledWith({ collection: 'sharedCharts', id: 'OldShareId123456' });
  });

  it('disables sharing and removes the public chart document', async () => {
    const sharedWorkspace: Workspace = {
      ...baseWorkspace,
      isShared: true,
      shareId: 'ActiveShare12345',
    };

    const disabled = await disableWorkspaceShare('user-1', sharedWorkspace);
    expect(disabled.isShared).toBe(false);
    expect(disabled.shareId).toBeNull();
    expect(mockDeleteDoc).toHaveBeenCalledWith({ collection: 'sharedCharts', id: 'ActiveShare12345' });
  });

  it('syncs live task updates using updateDoc so deleted shares are not recreated', async () => {
    await syncSharedChart('LiveShare1234567', {
      title: 'Renamed Plan',
      tasks: [{ id: 1, name: 'Milestone', start: '2026-02-01', end: '2026-02-01', progress: 100 }],
    });

    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    const [ref, payload] = mockUpdateDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(ref).toEqual({ collection: 'sharedCharts', id: 'LiveShare1234567' });
    expect(payload.title).toBe('Renamed Plan');
    expect(Array.isArray(payload.tasks)).toBe(true);
  });
});
