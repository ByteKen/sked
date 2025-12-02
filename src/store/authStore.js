import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { auth, googleProvider, ALLOWED_DOMAIN } from '../config/firebase';

export const useAuthStore = create(
  subscribeWithSelector((set) => ({
    user: null,
    isAuthenticated: false,
    loading: true,
    error: null,
    cancelled: false, // Track if user cancelled login

    // Initialize auth - listen to Firebase auth state changes
    initAuth: () => {
      set({ loading: true });
      
      // Subscribe to Firebase auth state changes
      const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        if (firebaseUser) {
          // Verify domain restriction
          const email = firebaseUser.email || '';
          if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
            // User logged in with wrong domain - sign them out
            signOut(auth);
            set({ 
              user: null, 
              isAuthenticated: false, 
              loading: false,
              error: `Only @${ALLOWED_DOMAIN} accounts are allowed`
            });
            return;
          }

          // Valid user
          const user = {
            id: firebaseUser.uid,
            email: firebaseUser.email,
            name: firebaseUser.displayName || firebaseUser.email?.split('@')[0],
            photoURL: firebaseUser.photoURL,
            loginTime: new Date().toISOString(),
          };
          set({ user, isAuthenticated: true, loading: false, error: null });
        } else {
          // No user signed in
          set({ user: null, isAuthenticated: false, loading: false });
        }
      });

      // Return unsubscribe function for cleanup
      return unsubscribe;
    },

    // Google Sign-In
    login: async () => {
      set({ error: null, cancelled: false, loading: true });

      try {
        const result = await signInWithPopup(auth, googleProvider);
        const email = result.user.email || '';

        // Double-check domain (Google's hd parameter should already filter, but verify)
        if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
          await signOut(auth);
          const error = `Only @${ALLOWED_DOMAIN} accounts are allowed. Please sign in with your school email.`;
          set({ error, loading: false });
          throw new Error(error);
        }

        // User state will be set by onAuthStateChanged listener
        return result.user;
      } catch (err) {
        console.error('Login error:', err);
        
        // Check if user cancelled the login
        const isCancelled = err.code === 'auth/popup-closed-by-user' || 
                           err.code === 'auth/cancelled-popup-request';
        
        if (isCancelled) {
          // User cancelled - not an error, just show a friendly message
          set({ cancelled: true, error: null, loading: false });
          return; // Don't throw for cancellation
        }
        
        let errorMessage = 'Failed to sign in. Please try again.';
        
        if (err.code === 'auth/popup-blocked') {
          errorMessage = 'Pop-up blocked. Please allow pop-ups for this site.';
        } else if (err.message?.includes(ALLOWED_DOMAIN)) {
          errorMessage = err.message;
        }

        set({ error: errorMessage, cancelled: false, loading: false });
        throw err;
      }
    },

    // Sign out
    logout: async () => {
      try {
        await signOut(auth);
        set({ user: null, isAuthenticated: false, error: null });
      } catch (err) {
        console.error('Logout error:', err);
        set({ error: 'Failed to sign out. Please try again.' });
      }
    },

    clearError: () => set({ error: null, cancelled: false }),
  }))
);
