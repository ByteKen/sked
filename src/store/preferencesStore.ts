import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { auth } from '@/config/firebase';
import { userDocumentSync } from '@/services/userDocumentSync';
import { savePreferencesInFirestore } from '@/services/userRepository';
import {
  DEFAULT_PREFERENCES,
  type BarHeightMode,
  type SubtaskLabelPosition,
  type TaskLabelPosition,
  type TelegramNotificationConfig,
  type ThemeMode,
  type UserPreferences,
} from '@/types';

const THEME_STORAGE_KEY = 'gantt_theme';

function readInitialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
  } catch {
    // Ignore storage access failures in private browsing
  }
  return DEFAULT_PREFERENCES.theme;
}

export function applyThemeToDocument(theme: ThemeMode): void {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', theme === 'dark' ? '#090B10' : '#F6F7FB');
    }
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage quota errors
  }
}

interface PreferencesStoreState extends UserPreferences {
  telegram: TelegramNotificationConfig | null;
  loading: boolean;
  unsubscribe: (() => void) | null;
  initPreferences: () => () => void;
  cleanup: () => void;
  toggleSubtaskShape: () => void;
  setUseRoundedSubtasks: (value: boolean) => void;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
  setExportTheme: (exportTheme: ThemeMode) => void;
  setTaskLabelPosition: (pos: TaskLabelPosition) => void;
  setSubtaskLabelPosition: (pos: SubtaskLabelPosition) => void;
  toggleShowDependencyLinesOnExport: () => void;
  setBarHeight: (barHeight: BarHeightMode) => void;
  toggleShowDependencyLines: () => void;
  toggleShowSubtaskConnectors: () => void;
  toggleShowTaskDescriptions: () => void;
  getPreferencesSnapshot: () => UserPreferences;
  resetPreferences: () => Promise<void>;
}

const initialTheme = readInitialTheme();
applyThemeToDocument(initialTheme);

function extractPrefs(state: PreferencesStoreState): UserPreferences {
  return {
    useRoundedSubtasks: state.useRoundedSubtasks,
    theme: state.theme,
    exportTheme: state.exportTheme,
    taskLabelPosition: state.taskLabelPosition,
    subtaskLabelPosition: state.subtaskLabelPosition,
    showDependencyLinesOnExport: state.showDependencyLinesOnExport,
    barHeight: state.barHeight,
    showDependencyLines: state.showDependencyLines,
    showSubtaskConnectors: state.showSubtaskConnectors,
    showTaskDescriptions: state.showTaskDescriptions,
  };
}

function persistIfAuthenticated(prefs: UserPreferences): void {
  const user = auth.currentUser;
  if (!user) return;
  void savePreferencesInFirestore(user.uid, prefs).catch((err) => {
    console.error('Failed to persist preferences:', err);
  });
}

export const usePreferencesStore = create<PreferencesStoreState>()(
  subscribeWithSelector((set, get) => ({
    ...DEFAULT_PREFERENCES,
    theme: initialTheme,
    telegram: null,
    loading: false,
    unsubscribe: null,

    initPreferences: () => {
      const prevUnsub = get().unsubscribe;
      if (prevUnsub) prevUnsub();

      const user = auth.currentUser;
      if (!user) {
        set({ loading: false, unsubscribe: null });
        return () => {};
      }

      set({ loading: true });

      const unsubscribe = userDocumentSync.subscribe(
        (snapshot) => {
          const prefs = (snapshot.data?.preferences ?? {}) as Partial<UserPreferences>;
          const merged: UserPreferences = {
            useRoundedSubtasks: prefs.useRoundedSubtasks ?? DEFAULT_PREFERENCES.useRoundedSubtasks,
            theme: prefs.theme ?? get().theme ?? DEFAULT_PREFERENCES.theme,
            exportTheme: prefs.exportTheme ?? DEFAULT_PREFERENCES.exportTheme,
            taskLabelPosition: prefs.taskLabelPosition ?? DEFAULT_PREFERENCES.taskLabelPosition,
            subtaskLabelPosition:
              prefs.subtaskLabelPosition ?? DEFAULT_PREFERENCES.subtaskLabelPosition,
            showDependencyLinesOnExport:
              prefs.showDependencyLinesOnExport ?? DEFAULT_PREFERENCES.showDependencyLinesOnExport,
            barHeight: prefs.barHeight ?? DEFAULT_PREFERENCES.barHeight,
            showDependencyLines:
              prefs.showDependencyLines ?? DEFAULT_PREFERENCES.showDependencyLines,
            showSubtaskConnectors:
              prefs.showSubtaskConnectors ?? DEFAULT_PREFERENCES.showSubtaskConnectors,
            showTaskDescriptions:
              prefs.showTaskDescriptions ?? DEFAULT_PREFERENCES.showTaskDescriptions,
          };

          const rawTelegram = snapshot.data?.telegram as
            | Partial<TelegramNotificationConfig>
            | undefined;
          const nextTelegram: TelegramNotificationConfig | null =
            rawTelegram && rawTelegram.connected
              ? {
                  connected: true,
                  username: rawTelegram.username ?? null,
                  firstName: rawTelegram.firstName ?? null,
                  enabled: rawTelegram.enabled ?? true,
                  timezone: rawTelegram.timezone || 'UTC',
                  reminderHour:
                    typeof rawTelegram.reminderHour === 'number' ? rawTelegram.reminderHour : 9,
                  reminderOffsets: Array.isArray(rawTelegram.reminderOffsets)
                    ? rawTelegram.reminderOffsets
                    : [5, 3, 1, 0],
                  includeOverdue: rawTelegram.includeOverdue ?? true,
                  linkedAt: rawTelegram.linkedAt || '',
                }
              : null;

          const prev = get();
          const telegramUnchanged =
            JSON.stringify(prev.telegram) === JSON.stringify(nextTelegram);
          const unchanged =
            !prev.loading &&
            telegramUnchanged &&
            prev.useRoundedSubtasks === merged.useRoundedSubtasks &&
            prev.theme === merged.theme &&
            prev.exportTheme === merged.exportTheme &&
            prev.taskLabelPosition === merged.taskLabelPosition &&
            prev.subtaskLabelPosition === merged.subtaskLabelPosition &&
            prev.showDependencyLinesOnExport === merged.showDependencyLinesOnExport &&
            prev.barHeight === merged.barHeight &&
            prev.showDependencyLines === merged.showDependencyLines &&
            prev.showSubtaskConnectors === merged.showSubtaskConnectors &&
            prev.showTaskDescriptions === merged.showTaskDescriptions;

          if (unchanged) return;

          applyThemeToDocument(merged.theme);
          set({ ...merged, telegram: nextTelegram, loading: false });
        },
        () => {
          set({ loading: false });
        },
      );

      set({ unsubscribe });
      return unsubscribe;
    },

    cleanup: () => {
      const { unsubscribe } = get();
      if (unsubscribe) {
        unsubscribe();
        set({ unsubscribe: null, telegram: null, loading: false });
      }
    },

    toggleSubtaskShape: () => {
      const next = { ...extractPrefs(get()), useRoundedSubtasks: !get().useRoundedSubtasks };
      set({ useRoundedSubtasks: next.useRoundedSubtasks });
      persistIfAuthenticated(next);
    },

    setUseRoundedSubtasks: (value) => {
      const next = { ...extractPrefs(get()), useRoundedSubtasks: value };
      set({ useRoundedSubtasks: value });
      persistIfAuthenticated(next);
    },

    toggleTheme: () => {
      const nextTheme: ThemeMode = get().theme === 'dark' ? 'light' : 'dark';
      applyThemeToDocument(nextTheme);
      const next = { ...extractPrefs(get()), theme: nextTheme };
      set({ theme: nextTheme });
      persistIfAuthenticated(next);
    },

    setTheme: (theme) => {
      applyThemeToDocument(theme);
      const next = { ...extractPrefs(get()), theme };
      set({ theme });
      persistIfAuthenticated(next);
    },

    setExportTheme: (exportTheme) => {
      const next = { ...extractPrefs(get()), exportTheme };
      set({ exportTheme });
      persistIfAuthenticated(next);
    },

    setTaskLabelPosition: (taskLabelPosition) => {
      const next = { ...extractPrefs(get()), taskLabelPosition };
      set({ taskLabelPosition });
      persistIfAuthenticated(next);
    },

    setSubtaskLabelPosition: (subtaskLabelPosition) => {
      const next = { ...extractPrefs(get()), subtaskLabelPosition };
      set({ subtaskLabelPosition });
      persistIfAuthenticated(next);
    },

    toggleShowDependencyLinesOnExport: () => {
      const nextValue = !get().showDependencyLinesOnExport;
      const next = { ...extractPrefs(get()), showDependencyLinesOnExport: nextValue };
      set({ showDependencyLinesOnExport: nextValue });
      persistIfAuthenticated(next);
    },

    setBarHeight: (barHeight) => {
      const next = { ...extractPrefs(get()), barHeight };
      set({ barHeight });
      persistIfAuthenticated(next);
    },

    toggleShowDependencyLines: () => {
      const nextValue = !get().showDependencyLines;
      const next = { ...extractPrefs(get()), showDependencyLines: nextValue };
      set({ showDependencyLines: nextValue });
      persistIfAuthenticated(next);
    },

    toggleShowSubtaskConnectors: () => {
      const nextValue = !get().showSubtaskConnectors;
      const next = { ...extractPrefs(get()), showSubtaskConnectors: nextValue };
      set({ showSubtaskConnectors: nextValue });
      persistIfAuthenticated(next);
    },

    toggleShowTaskDescriptions: () => {
      const nextValue = !get().showTaskDescriptions;
      const next = { ...extractPrefs(get()), showTaskDescriptions: nextValue };
      set({ showTaskDescriptions: nextValue });
      persistIfAuthenticated(next);
    },

    getPreferencesSnapshot: () => extractPrefs(get()),

    resetPreferences: async () => {
      applyThemeToDocument(DEFAULT_PREFERENCES.theme);
      set({ ...DEFAULT_PREFERENCES });
      const user = auth.currentUser;
      if (user) {
        await savePreferencesInFirestore(user.uid, DEFAULT_PREFERENCES);
      }
    },
  })),
);
