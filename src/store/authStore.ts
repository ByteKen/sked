import {
  deleteUser,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { auth, googleProvider, popupRedirectResolver } from '@/config/firebase';
import { validateDisplayName } from '@/domain/validation';
import { syncOwnerNameAcrossSharedCharts } from '@/services/shareRepository';
import { disconnectTelegram } from '@/services/telegramService';
import { userDocumentSync } from '@/services/userDocumentSync';
import { deleteUserAccountData, saveDisplayNameInFirestore } from '@/services/userRepository';
import type { AuthUser, WorkspaceMap } from '@/types';

export interface DeleteAccountResult {
  ok: boolean;
  cancelled?: boolean;
  error?: string;
}

export interface UpdateDisplayNameResult {
  ok: boolean;
  name?: string;
  syncedSharesCount?: number;
  error?: string;
}

const SESSION_HINT_STORAGE_KEY = 'sked_session_hint';

function readSessionHint(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    if (localStorage.getItem(SESSION_HINT_STORAGE_KEY) === '1') {
      return true;
    }
    // Secondary fallback if Firebase persisted a user entry in browserLocalPersistence
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith('firebase:authUser:')) {
        const value = localStorage.getItem(key);
        if (value && value !== 'null' && value !== '{}') {
          return true;
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}

function writeSessionHint(hasSession: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (hasSession) {
      localStorage.setItem(SESSION_HINT_STORAGE_KEY, '1');
    } else {
      localStorage.removeItem(SESSION_HINT_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota or private-mode errors
  }
}

interface AuthStoreState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  signingIn: boolean;
  authChecked: boolean;
  hasSessionHint: boolean;
  error: string | null;
  cancelled: boolean;
  initAuth: () => () => void;
  login: () => Promise<User | null>;
  cancelSigningIn: () => void;
  logout: () => Promise<void>;
  setDisplayNameLocally: (name: string) => void;
  updateDisplayName: (rawName: string) => Promise<UpdateDisplayNameResult>;
  deleteAccount: () => Promise<DeleteAccountResult>;
  clearError: () => void;
}

let activeLoginAttemptId = 0;

function mapFirebaseUser(firebaseUser: User): AuthUser {
  const email = firebaseUser.email ?? '';
  return {
    id: firebaseUser.uid,
    email,
    name: firebaseUser.displayName || email.split('@')[0] || 'User',
    photoURL: firebaseUser.photoURL,
    loginTime: new Date().toISOString(),
  };
}

export const useAuthStore = create<AuthStoreState>()(
  subscribeWithSelector((set) => ({
    user: null,
    isAuthenticated: false,
    loading: true,
    signingIn: false,
    authChecked: false,
    hasSessionHint: readSessionHint(),
    error: null,
    cancelled: false,

    initAuth: () => {
      set((state) => ({
        loading: !state.authChecked,
      }));

      const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        if (firebaseUser) {
          writeSessionHint(true);
          // Start Firestore user document stream immediately before React schedules effects
          userDocumentSync.start(firebaseUser.uid);
          set({
            user: mapFirebaseUser(firebaseUser),
            isAuthenticated: true,
            loading: false,
            signingIn: false,
            authChecked: true,
            hasSessionHint: true,
            error: null,
            cancelled: false,
          });
        } else {
          writeSessionHint(false);
          set({
            user: null,
            isAuthenticated: false,
            loading: false,
            signingIn: false,
            authChecked: true,
            hasSessionHint: false,
          });
        }
      });

      return unsubscribe;
    },

    login: async () => {
      const attemptId = ++activeLoginAttemptId;
      set({ error: null, cancelled: false, signingIn: true });

      try {
        const result = await signInWithPopup(auth, googleProvider, popupRedirectResolver);
        if (attemptId === activeLoginAttemptId) {
          // Immediately transition out of LandingPage and start Firestore sync without
          // waiting for an extra asynchronous onAuthStateChanged + useEffect roundtrip.
          writeSessionHint(true);
          userDocumentSync.start(result.user.uid);
          set({
            user: mapFirebaseUser(result.user),
            isAuthenticated: true,
            loading: false,
            signingIn: false,
            authChecked: true,
            hasSessionHint: true,
            error: null,
            cancelled: false,
          });
        }
        return result.user;
      } catch (err: unknown) {
        if (attemptId !== activeLoginAttemptId) {
          return null;
        }
        const firebaseErr = err as { code?: string; message?: string };
        const isCancelled =
          firebaseErr.code === 'auth/popup-closed-by-user' ||
          firebaseErr.code === 'auth/cancelled-popup-request';

        if (isCancelled) {
          set({ cancelled: true, error: null, signingIn: false });
          return null;
        }

        let errorMessage = 'Failed to sign in. Please try again.';
        if (firebaseErr.code === 'auth/popup-blocked') {
          errorMessage = 'Pop-up was blocked by your browser. Please allow pop-ups and try again.';
        } else if (firebaseErr.code === 'auth/network-request-failed') {
          errorMessage = 'Network error. Please check your connection and try again.';
        } else if (firebaseErr.code === 'auth/unauthorized-domain') {
          errorMessage = 'This domain is not authorized in Firebase Authentication settings.';
        }

        set({ error: errorMessage, cancelled: false, signingIn: false });
        throw err;
      }
    },

    cancelSigningIn: () => {
      activeLoginAttemptId += 1;
      set({ signingIn: false, error: null });
    },

    logout: async () => {
      try {
        await signOut(auth);
        writeSessionHint(false);
        set({
          user: null,
          isAuthenticated: false,
          loading: false,
          signingIn: false,
          hasSessionHint: false,
          error: null,
          cancelled: false,
        });
      } catch (err) {
        console.error('Logout error:', err);
        set({ error: 'Failed to sign out. Please try again.' });
      }
    },

    setDisplayNameLocally: (name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      set((state) => {
        if (!state.user || state.user.name === trimmed) return state;
        return {
          user: {
            ...state.user,
            name: trimmed,
          },
        };
      });
    },

    updateDisplayName: async (rawName) => {
      const validationError = validateDisplayName(rawName);
      if (validationError) {
        return { ok: false, error: validationError };
      }

      const currentUser = auth.currentUser;
      if (!currentUser) {
        return { ok: false, error: 'You must be signed in to update your display name.' };
      }

      const trimmed = rawName.trim();
      try {
        await saveDisplayNameInFirestore(currentUser.uid, trimmed);
        await updateProfile(currentUser, { displayName: trimmed }).catch(() => { });

        const snap = userDocumentSync.getLatestSnapshot();
        const workspaces = (snap?.data?.workspaces ?? {}) as WorkspaceMap;
        const activeShareIds = Object.values(workspaces)
          .filter((ws): ws is WorkspaceMap[string] & { shareId: string } =>
            Boolean(ws?.isShared && ws.shareId),
          )
          .map((ws) => ws.shareId);

        if (activeShareIds.length > 0) {
          await syncOwnerNameAcrossSharedCharts(activeShareIds, trimmed);
        }

        set((state) =>
          state.user ? { user: { ...state.user, name: trimmed } } : state,
        );

        return { ok: true, name: trimmed, syncedSharesCount: activeShareIds.length };
      } catch (err) {
        console.error('Failed to update display name:', err);
        return { ok: false, error: 'Could not save your display name. Please try again.' };
      }
    },

    deleteAccount: async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        return { ok: false, error: 'You must be signed in to delete your account.' };
      }

      // Step 1: Always re-verify identity FIRST before modifying any Firestore data
      try {
        await reauthenticateWithPopup(currentUser, googleProvider, popupRedirectResolver);
      } catch (err: unknown) {
        const firebaseErr = err as { code?: string };
        if (
          firebaseErr.code === 'auth/popup-closed-by-user' ||
          firebaseErr.code === 'auth/cancelled-popup-request'
        ) {
          return { ok: false, cancelled: true };
        }
        if (firebaseErr.code === 'auth/user-mismatch') {
          return {
            ok: false,
            error: 'Please confirm using the same Google account you are currently signed in with.',
          };
        }
        if (firebaseErr.code === 'auth/popup-blocked') {
          return {
            ok: false,
            error: 'Pop-up was blocked by your browser. Please allow pop-ups and try again.',
          };
        }
        return {
          ok: false,
          error: 'Could not verify your Google account. No data was deleted.',
        };
      }

      // Step 2: Stop live listeners and permanently purge Telegram subscription, Firestore data & public shares
      try {
        userDocumentSync.stop();
        await disconnectTelegram().catch(() => { });
        await deleteUserAccountData(currentUser.uid);

        // Step 3: Delete Firebase Auth user record
        await deleteUser(currentUser);

        try {
          localStorage.removeItem('gantt_tree_pane_width');
        } catch {
          // Ignore storage restrictions
        }

        writeSessionHint(false);
        set({
          user: null,
          isAuthenticated: false,
          hasSessionHint: false,
          loading: false,
          signingIn: false,
          error: null,
          cancelled: false,
        });
        return { ok: true };
      } catch (err: unknown) {
        console.error('Account deletion failed:', err);
        const firebaseErr = err as { code?: string };
        if (firebaseErr.code === 'auth/requires-recent-login') {
          return {
            ok: false,
            error: 'Please sign in again to verify your session and retry account deletion.',
          };
        }
        return {
          ok: false,
          error: 'Failed to delete your account. Please try again or sign out and retry.',
        };
      }
    },

    clearError: () => set({ error: null, cancelled: false }),
  })),
);
