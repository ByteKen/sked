import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { doc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../config/firebase';

// Default preferences
const defaultPreferences = {
  useRoundedSubtasks: false, // false = diamond shape (default), true = rounded corners like parent
  theme: 'dark', // 'dark' or 'light'
  exportTheme: 'light', // Export always uses light theme for printing - saves ink/toner
  taskLabelPosition: 'inside', // 'inside', 'outside', or 'hidden'
  showDependencyLinesOnExport: false, // Hide dependency lines on export by default
  barHeight: 'compact', // 'compact' (like monday.com), 'normal', or 'large'
};

export const usePreferencesStore = create(
  subscribeWithSelector((set, get) => ({
    ...defaultPreferences,
    loading: false,
    unsubscribe: null,

    // Initialize preferences from Firestore (real-time listener)
    initPreferences: () => {
      const user = auth.currentUser;
      if (!user) {
        // Not logged in, use defaults
        set({ ...defaultPreferences, loading: false });
        return;
      }

      set({ loading: true });

      const userDocRef = doc(db, 'users', user.uid);
      
      const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const prefs = data.preferences || {};
          
          // Get current state
          const currentState = get();
          
          const newPrefs = {
            useRoundedSubtasks: prefs.useRoundedSubtasks ?? defaultPreferences.useRoundedSubtasks,
            theme: prefs.theme ?? defaultPreferences.theme,
            exportTheme: prefs.exportTheme ?? defaultPreferences.exportTheme,
            taskLabelPosition: prefs.taskLabelPosition ?? defaultPreferences.taskLabelPosition,
            showDependencyLinesOnExport: prefs.showDependencyLinesOnExport ?? defaultPreferences.showDependencyLinesOnExport,
            barHeight: prefs.barHeight ?? defaultPreferences.barHeight,
          };
          
          // Only update if preferences actually changed
          const prefsChanged = 
            currentState.useRoundedSubtasks !== newPrefs.useRoundedSubtasks ||
            currentState.theme !== newPrefs.theme ||
            currentState.exportTheme !== newPrefs.exportTheme ||
            currentState.taskLabelPosition !== newPrefs.taskLabelPosition ||
            currentState.showDependencyLinesOnExport !== newPrefs.showDependencyLinesOnExport ||
            currentState.barHeight !== newPrefs.barHeight ||
            currentState.loading !== false;
          
          if (prefsChanged) {
            set({
              ...newPrefs,
              loading: false,
            });
          }
        } else {
          // New user - use defaults
          set({ ...defaultPreferences, loading: false });
        }
      }, (error) => {
        console.error('Preferences listener error:', error);
        set({ loading: false });
      });

      set({ unsubscribe });
      return unsubscribe;
    },

    // Cleanup listener
    cleanup: () => {
      const { unsubscribe } = get();
      if (unsubscribe) {
        unsubscribe();
        set({ unsubscribe: null });
      }
    },

    // Toggle subtask shape preference
    toggleSubtaskShape: () => {
      set((state) => {
        const newValue = !state.useRoundedSubtasks;
        get().persistPreferences({ ...state, useRoundedSubtasks: newValue });
        return { useRoundedSubtasks: newValue };
      });
    },

    // Set subtask shape preference
    setUseRoundedSubtasks: (value) => {
      set((state) => {
        get().persistPreferences({ ...state, useRoundedSubtasks: value });
        return { useRoundedSubtasks: value };
      });
    },

    // Toggle theme between dark and light
    toggleTheme: () => {
      set((state) => {
        const newTheme = state.theme === 'dark' ? 'light' : 'dark';
        get().persistPreferences({ ...state, theme: newTheme });
        return { theme: newTheme };
      });
    },

    // Set theme explicitly
    setTheme: (theme) => {
      set((state) => {
        get().persistPreferences({ ...state, theme });
        return { theme };
      });
    },

    // Set export theme
    setExportTheme: (exportTheme) => {
      set((state) => {
        get().persistPreferences({ ...state, exportTheme });
        return { exportTheme };
      });
    },

    // Set task label position
    setTaskLabelPosition: (taskLabelPosition) => {
      set((state) => {
        get().persistPreferences({ ...state, taskLabelPosition });
        return { taskLabelPosition };
      });
    },

    // Toggle dependency lines on export
    toggleShowDependencyLinesOnExport: () => {
      set((state) => {
        const newValue = !state.showDependencyLinesOnExport;
        get().persistPreferences({ ...state, showDependencyLinesOnExport: newValue });
        return { showDependencyLinesOnExport: newValue };
      });
    },

    // Set bar height
    setBarHeight: (barHeight) => {
      set((state) => {
        get().persistPreferences({ ...state, barHeight });
        return { barHeight };
      });
    },

    // Persist preferences to Firestore
    persistPreferences: async (prefs) => {
      const user = auth.currentUser;
      if (!user) {
        console.log('No user logged in, skipping preferences persist');
        return;
      }

      try {
        const userDocRef = doc(db, 'users', user.uid);
        const toSave = {
          useRoundedSubtasks: prefs.useRoundedSubtasks,
          theme: prefs.theme,
          exportTheme: prefs.exportTheme,
          taskLabelPosition: prefs.taskLabelPosition,
          showDependencyLinesOnExport: prefs.showDependencyLinesOnExport,
          barHeight: prefs.barHeight,
        };
        
        await setDoc(userDocRef, {
          preferences: toSave,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      } catch (err) {
        console.error('Failed to persist preferences to Firestore:', err);
      }
    },

    // Reset to defaults
    resetPreferences: async () => {
      set(defaultPreferences);
      await get().persistPreferences(defaultPreferences);
    },
  }))
);
