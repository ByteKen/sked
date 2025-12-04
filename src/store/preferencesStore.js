import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { doc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../config/firebase';

// Default preferences
const defaultPreferences = {
  useRoundedSubtasks: false, // false = diamond shape (default), true = rounded corners like parent
  theme: 'dark', // 'dark' or 'light'
  exportTheme: 'light', // Export always uses light theme for printing - saves ink/toner
  taskLabelPosition: 'inside', // 'inside', 'outside', 'top', or 'hidden'
  subtaskLabelPosition: 'outside', // 'outside', 'top', or 'hidden' (no 'inside' for subtasks)
  showDependencyLinesOnExport: false, // Hide dependency lines on export by default
  barHeight: 'compact', // 'compact' (like monday.com), 'normal', or 'large'
  showDependencyLines: true, // Show dependency arrows between tasks
  showSubtaskConnectors: true, // Show L-shaped connectors from parent to subtasks
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
            subtaskLabelPosition: prefs.subtaskLabelPosition ?? defaultPreferences.subtaskLabelPosition,
            showDependencyLinesOnExport: prefs.showDependencyLinesOnExport ?? defaultPreferences.showDependencyLinesOnExport,
            barHeight: prefs.barHeight ?? defaultPreferences.barHeight,
            showDependencyLines: prefs.showDependencyLines ?? defaultPreferences.showDependencyLines,
            showSubtaskConnectors: prefs.showSubtaskConnectors ?? defaultPreferences.showSubtaskConnectors,
          };
          
          // Only update if preferences actually changed
          const prefsChanged = 
            currentState.useRoundedSubtasks !== newPrefs.useRoundedSubtasks ||
            currentState.theme !== newPrefs.theme ||
            currentState.exportTheme !== newPrefs.exportTheme ||
            currentState.taskLabelPosition !== newPrefs.taskLabelPosition ||
            currentState.subtaskLabelPosition !== newPrefs.subtaskLabelPosition ||
            currentState.showDependencyLinesOnExport !== newPrefs.showDependencyLinesOnExport ||
            currentState.barHeight !== newPrefs.barHeight ||
            currentState.showDependencyLines !== newPrefs.showDependencyLines ||
            currentState.showSubtaskConnectors !== newPrefs.showSubtaskConnectors ||
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

    // Set subtask label position
    setSubtaskLabelPosition: (subtaskLabelPosition) => {
      set((state) => {
        get().persistPreferences({ ...state, subtaskLabelPosition });
        return { subtaskLabelPosition };
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

    // Toggle dependency lines visibility
    toggleShowDependencyLines: () => {
      set((state) => {
        const newValue = !state.showDependencyLines;
        get().persistPreferences({ ...state, showDependencyLines: newValue });
        return { showDependencyLines: newValue };
      });
    },

    // Toggle subtask connectors visibility
    toggleShowSubtaskConnectors: () => {
      set((state) => {
        const newValue = !state.showSubtaskConnectors;
        get().persistPreferences({ ...state, showSubtaskConnectors: newValue });
        return { showSubtaskConnectors: newValue };
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
          subtaskLabelPosition: prefs.subtaskLabelPosition,
          showDependencyLinesOnExport: prefs.showDependencyLinesOnExport,
          barHeight: prefs.barHeight,
          showDependencyLines: prefs.showDependencyLines,
          showSubtaskConnectors: prefs.showSubtaskConnectors,
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
