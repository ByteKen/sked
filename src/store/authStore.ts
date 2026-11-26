import {
  deleteUser,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { auth, googleProvider } from '@/config/firebase';
import { disconnectTelegram } from '@/services/telegramService';
import { userDocumentSync } from '@/services/userDocumentSync';
import { deleteUserAccountData } from '@/services/userRepository';
import type { AuthUser } from '@/types';

export interface DeleteAccountResult {
  ok: boolean;
  cancelled?: boolean;
  error?: string;
}

interface AuthStoreState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  cancelled: boolean;
  initAuth: () => () => void;
  login: () => Promise<User | null>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<DeleteAccountResult>;
  clearError: () => void;
}

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
    error: null,
    cancelled: false,

    initAuth: () => {
      set({ loading: true });

      const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        if (firebaseUser) {
          set({
            user: mapFirebaseUser(firebaseUser),
            isAuthenticated: true,
            loading: false,
            error: null,
            cancelled: false,
          });
        } else {
          set({
            user: null,
            isAuthenticated: false,
            loading: false,
          });
        }
      });

      return unsubscribe;
    },

    login: async () => {
      set({ error: null, cancelled: false, loading: true });

      try {
        const result = await signInWithPopup(auth, googleProvider);
        return result.user;
      } catch (err: unknown) {
        const firebaseErr = err as { code?: string; message?: string };
        const isCancelled =
          firebaseErr.code === 'auth/popup-closed-by-user' ||
          firebaseErr.code === 'auth/cancelled-popup-request';

        if (isCancelled) {
          set({ cancelled: true, error: null, loading: false });
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

        set({ error: errorMessage, cancelled: false, loading: false });
        throw err;
      }
    },

    logout: async () => {
      try {
        await signOut(auth);
        set({ user: null, isAuthenticated: false, error: null, cancelled: false });
      } catch (err) {
        console.error('Logout error:', err);
        set({ error: 'Failed to sign out. Please try again.' });
      }
    },

    deleteAccount: async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        return { ok: false, error: 'You must be signed in to delete your account.' };
      }

      // Step 1: Always re-verify identity FIRST before modifying any Firestore data
      try {
        await reauthenticateWithPopup(currentUser, googleProvider);
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
        await disconnectTelegram().catch(() => {});
        await deleteUserAccountData(currentUser.uid);

        // Step 3: Delete Firebase Auth user record
        await deleteUser(currentUser);

        try {
          localStorage.removeItem('gantt_tree_pane_width');
        } catch {
          // Ignore storage restrictions
        }

        set({
          user: null,
          isAuthenticated: false,
          loading: false,
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
