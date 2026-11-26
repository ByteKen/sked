import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockSignInWithPopup,
  mockSignOut,
  mockReauthenticateWithPopup,
  mockDeleteUser,
  mockUpdateProfile,
  mockDeleteUserAccountData,
  mockSaveDisplayNameInFirestore,
  mockSyncOwnerNameAcrossSharedCharts,
  mockStopSync,
  mockGetLatestSnapshot,
  mockUnsubscribe,
  mockAuth,
} = vi.hoisted(() => ({
  mockSignInWithPopup: vi.fn(),
  mockSignOut: vi.fn(),
  mockReauthenticateWithPopup: vi.fn(),
  mockDeleteUser: vi.fn(),
  mockUpdateProfile: vi.fn().mockResolvedValue(undefined),
  mockDeleteUserAccountData: vi.fn(),
  mockSaveDisplayNameInFirestore: vi.fn().mockResolvedValue(undefined),
  mockSyncOwnerNameAcrossSharedCharts: vi.fn().mockResolvedValue(undefined),
  mockStopSync: vi.fn(),
  mockGetLatestSnapshot: vi.fn<() => { data?: Record<string, unknown> } | null>(() => null),
  mockUnsubscribe: vi.fn(),
  mockAuth: { currentUser: null as unknown },
}));
let authCallback: ((user: unknown) => void) | null = null;

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => mockAuth),
  GoogleAuthProvider: vi.fn().mockImplementation(() => ({
    setCustomParameters: vi.fn(),
  })),
  signInWithPopup: (...args: unknown[]) => mockSignInWithPopup(...args),
  signOut: (...args: unknown[]) => mockSignOut(...args),
  reauthenticateWithPopup: (...args: unknown[]) => mockReauthenticateWithPopup(...args),
  deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
  updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
  onAuthStateChanged: (_auth: unknown, cb: (user: unknown) => void) => {
    authCallback = cb;
    return mockUnsubscribe;
  },
}));

vi.mock('@/config/firebase', () => ({
  auth: mockAuth,
  googleProvider: {},
  db: {},
}));

vi.mock('@/services/userRepository', () => ({
  deleteUserAccountData: (...args: unknown[]) => mockDeleteUserAccountData(...args),
  saveDisplayNameInFirestore: (...args: unknown[]) => mockSaveDisplayNameInFirestore(...args),
}));

vi.mock('@/services/shareRepository', () => ({
  syncOwnerNameAcrossSharedCharts: (...args: unknown[]) =>
    mockSyncOwnerNameAcrossSharedCharts(...args),
}));

vi.mock('@/services/userDocumentSync', () => ({
  userDocumentSync: {
    stop: (...args: unknown[]) => mockStopSync(...args),
    getLatestSnapshot: () => mockGetLatestSnapshot(),
  },
}));

vi.mock('@/services/telegramService', () => ({
  disconnectTelegram: vi.fn().mockResolvedValue({ ok: true }),
}));

import { useAuthStore } from '@/store/authStore';

describe('authStore (open access & safe account deletion)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authCallback = null;
    mockAuth.currentUser = null;
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      loading: true,
      error: null,
      cancelled: false,
    });
  });

  it.each([
    'alice@gmail.com',
    'bob@company.io',
    'student@phinmaed.com',
    'team@university.edu',
  ])('accepts sign-in from any email domain: %s', (email) => {
    const unsub = useAuthStore.getState().initAuth();
    expect(typeof unsub).toBe('function');

    authCallback?.({
      uid: `uid-${email}`,
      email,
      displayName: 'Test User',
      photoURL: null,
    });

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.email).toBe(email);
    expect(state.error).toBeNull();
    expect(mockSignOut).not.toHaveBeenCalled();

    unsub();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('handles popup cancellation gracefully without setting an error', async () => {
    mockSignInWithPopup.mockRejectedValueOnce({ code: 'auth/popup-closed-by-user' });
    const result = await useAuthStore.getState().login();

    expect(result).toBeNull();
    expect(useAuthStore.getState().cancelled).toBe(true);
    expect(useAuthStore.getState().error).toBeNull();
  });

  it('re-authenticates before purging Firestore data and deleting Firebase Auth user', async () => {
    const fakeUser = { uid: 'uid-delete-1', email: 'user@gmail.com' };
    mockAuth.currentUser = fakeUser;
    useAuthStore.setState({
      user: {
        id: 'uid-delete-1',
        email: 'user@gmail.com',
        name: 'Test User',
        photoURL: null,
        loginTime: new Date().toISOString(),
      },
      isAuthenticated: true,
      loading: false,
    });

    mockReauthenticateWithPopup.mockResolvedValueOnce({ user: fakeUser });
    mockDeleteUserAccountData.mockResolvedValueOnce(['share-1']);
    mockDeleteUser.mockResolvedValueOnce(undefined);

    const result = await useAuthStore.getState().deleteAccount();

    expect(result).toEqual({ ok: true });
    expect(mockReauthenticateWithPopup).toHaveBeenCalledWith(fakeUser, {});
    expect(mockStopSync).toHaveBeenCalledTimes(1);
    expect(mockDeleteUserAccountData).toHaveBeenCalledWith('uid-delete-1');
    expect(mockDeleteUser).toHaveBeenCalledWith(fakeUser);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('does NOT delete any Firestore data if the user cancels re-authentication', async () => {
    mockAuth.currentUser = { uid: 'uid-cancel', email: 'user@gmail.com' };
    mockReauthenticateWithPopup.mockRejectedValueOnce({ code: 'auth/popup-closed-by-user' });

    const result = await useAuthStore.getState().deleteAccount();

    expect(result).toEqual({ ok: false, cancelled: true });
    expect(mockDeleteUserAccountData).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('aborts safely with a clear error if re-authentication uses a mismatched Google account', async () => {
    mockAuth.currentUser = { uid: 'uid-mismatch', email: 'user@gmail.com' };
    mockReauthenticateWithPopup.mockRejectedValueOnce({ code: 'auth/user-mismatch' });

    const result = await useAuthStore.getState().deleteAccount();

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/same Google account/i);
    expect(mockDeleteUserAccountData).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('saves custom display name to Firestore and syncs ownerName across active shared charts', async () => {
    const fakeUser = { uid: 'uid-profile-1', email: 'ken@example.com' };
    mockAuth.currentUser = fakeUser;
    useAuthStore.setState({
      user: {
        id: 'uid-profile-1',
        email: 'ken@example.com',
        name: 'Old Name',
        photoURL: null,
        loginTime: new Date().toISOString(),
      },
      isAuthenticated: true,
      loading: false,
    });

    mockGetLatestSnapshot.mockReturnValueOnce({
      data: {
        workspaces: {
          ws_1: { id: 'ws_1', title: 'Roadmap', isShared: true, shareId: 'share_abc' },
          ws_2: { id: 'ws_2', title: 'Private', isShared: false, shareId: null },
        },
      },
    });

    const result = await useAuthStore.getState().updateDisplayName('  Plotwise Studio  ');

    expect(result).toEqual({ ok: true, name: 'Plotwise Studio', syncedSharesCount: 1 });
    expect(mockSaveDisplayNameInFirestore).toHaveBeenCalledWith('uid-profile-1', 'Plotwise Studio');
    expect(mockUpdateProfile).toHaveBeenCalledWith(fakeUser, { displayName: 'Plotwise Studio' });
    expect(mockSyncOwnerNameAcrossSharedCharts).toHaveBeenCalledWith(
      ['share_abc'],
      'Plotwise Studio',
    );
    expect(useAuthStore.getState().user?.name).toBe('Plotwise Studio');
  });

  it('rejects too-short display names before touching Firestore', async () => {
    mockAuth.currentUser = { uid: 'uid-profile-2', email: 'ken@example.com' };
    const result = await useAuthStore.getState().updateDisplayName('A');

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/at least 2 characters/i);
    expect(mockSaveDisplayNameInFirestore).not.toHaveBeenCalled();
  });
});
