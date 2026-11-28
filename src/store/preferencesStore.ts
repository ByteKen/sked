import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { auth } from '@/config/firebase';
import { userDocumentSync } from '@/services/userDocumentSync';
import { savePreferencesInFirestore } from '@/services/userRepository';
import { useAuthStore } from '@/store/authStore';
import {
  DEFAULT_PREFERENCES,
  type BarHeightMode,
  type SubtaskLabelPosition,
  type TaskLabelPosition,
  type TelegramNotificationConfig,
  type ThemeMode,
  type UserPreferences,
} from '@/types';
import {
  isReminderSoundEnabled,
  setReminderSoundEnabled as syncReminderSoundStorage,
} from '@/utils/reminderSound';

const THEME_STORAGE_KEY = 'gantt_theme';
const ANIMATIONS_STORAGE_KEY = 'gantt_animations';

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

function readInitialAnimations(): boolean {
  try {
    const saved = localStorage.getItem(ANIMATIONS_STORAGE_KEY);
    if (saved === 'false') return false;
    if (saved === 'true') return true;
  } catch {
    // Ignore storage access failures in private browsing
  }
  return DEFAULT_PREFERENCES.enableAnimations;
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

export function applyAnimationsToDocument(enableAnimations: boolean): void {
  if (typeof document !== 'undefined') {
    if (enableAnimations) {
      document.documentElement.removeAttribute('data-reduce-motion');
    } else {
      document.documentElement.setAttribute('data-reduce-motion', 'true');
    }
  }
  try {
    localStorage.setItem(ANIMATIONS_STORAGE_KEY, enableAnimations ? 'true' : 'false');
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
  toggleEnableAnimations: () => void;
  toggleShowBarTooltips: () => void;
  toggleShowProgressPercentages: () => void;
  toggleShowTodayLine: () => void;
  toggleHighlightWeekends: () => void;
  toggleShowCriticalPathByDefault: () => void;
  toggleAutoCascadeDependencies: () => void;
  toggleEnableInAppReminders: () => void;
  toggleReminderSoundEnabled: () => void;
  setReminderSoundEnabled: (enabled: boolean) => void;
  getPreferencesSnapshot: () => UserPreferences;
  resetPreferences: () => Promise<void>;
}

const initialTheme = readInitialTheme();
applyThemeToDocument(initialTheme);

const initialAnimations = readInitialAnimations();
applyAnimationsToDocument(initialAnimations);

const initialReminderSound = isReminderSoundEnabled();

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
    enableAnimations: state.enableAnimations,
    showBarTooltips: state.showBarTooltips,
    showProgressPercentages: state.showProgressPercentages,
    showTodayLine: state.showTodayLine,
    highlightWeekends: state.highlightWeekends,
    showCriticalPathByDefault: state.showCriticalPathByDefault,
    autoCascadeDependencies: state.autoCascadeDependencies,
    enableInAppReminders: state.enableInAppReminders,
    reminderSoundEnabled: state.reminderSoundEnabled,
  };
}

function arePreferencesEqual(a: UserPreferences, b: UserPreferences): boolean {
  return (
    a.useRoundedSubtasks === b.useRoundedSubtasks &&
    a.theme === b.theme &&
    a.exportTheme === b.exportTheme &&
    a.taskLabelPosition === b.taskLabelPosition &&
    a.subtaskLabelPosition === b.subtaskLabelPosition &&
    a.showDependencyLinesOnExport === b.showDependencyLinesOnExport &&
    a.barHeight === b.barHeight &&
    a.showDependencyLines === b.showDependencyLines &&
    a.showSubtaskConnectors === b.showSubtaskConnectors &&
    a.showTaskDescriptions === b.showTaskDescriptions &&
    a.enableAnimations === b.enableAnimations &&
    a.showBarTooltips === b.showBarTooltips &&
    a.showProgressPercentages === b.showProgressPercentages &&
    a.showTodayLine === b.showTodayLine &&
    a.highlightWeekends === b.highlightWeekends &&
    a.showCriticalPathByDefault === b.showCriticalPathByDefault &&
    a.autoCascadeDependencies === b.autoCascadeDependencies &&
    a.enableInAppReminders === b.enableInAppReminders &&
    a.reminderSoundEnabled === b.reminderSoundEnabled
  );
}

function persistIfAuthenticated(prefs: UserPreferences): void {
  const user = auth.currentUser;
  if (!user) return;
  void savePreferencesInFirestore(user.uid, prefs).catch((err) => {
    console.error('Failed to persist preferences:', err);
  });
}

export const usePreferencesStore = create<PreferencesStoreState>()(
  subscribeWithSelector((set, get) => {
    const updatePrefs = (patch: Partial<UserPreferences>): UserPreferences => {
      const next: UserPreferences = { ...extractPrefs(get()), ...patch };
      set(patch);
      persistIfAuthenticated(next);
      return next;
    };

    return {
      ...DEFAULT_PREFERENCES,
      theme: initialTheme,
      enableAnimations: initialAnimations,
      reminderSoundEnabled: initialReminderSound,
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
            const customDisplayName = (
              snapshot.data?.profile as { displayName?: string } | undefined
            )?.displayName?.trim();
            if (customDisplayName) {
              useAuthStore.getState().setDisplayNameLocally(customDisplayName);
            }

            const prev = get();
            const prefs = (snapshot.data?.preferences ?? {}) as Partial<UserPreferences>;
            const merged: UserPreferences = {
              useRoundedSubtasks: prefs.useRoundedSubtasks ?? DEFAULT_PREFERENCES.useRoundedSubtasks,
              theme: prefs.theme ?? prev.theme ?? DEFAULT_PREFERENCES.theme,
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
              enableAnimations: prefs.enableAnimations ?? prev.enableAnimations,
              showBarTooltips: prefs.showBarTooltips ?? DEFAULT_PREFERENCES.showBarTooltips,
              showProgressPercentages:
                prefs.showProgressPercentages ?? DEFAULT_PREFERENCES.showProgressPercentages,
              showTodayLine: prefs.showTodayLine ?? DEFAULT_PREFERENCES.showTodayLine,
              highlightWeekends: prefs.highlightWeekends ?? DEFAULT_PREFERENCES.highlightWeekends,
              showCriticalPathByDefault:
                prefs.showCriticalPathByDefault ?? DEFAULT_PREFERENCES.showCriticalPathByDefault,
              autoCascadeDependencies:
                prefs.autoCascadeDependencies ?? DEFAULT_PREFERENCES.autoCascadeDependencies,
              enableInAppReminders:
                prefs.enableInAppReminders ?? DEFAULT_PREFERENCES.enableInAppReminders,
              reminderSoundEnabled: prefs.reminderSoundEnabled ?? prev.reminderSoundEnabled,
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

            const telegramUnchanged =
              JSON.stringify(prev.telegram) === JSON.stringify(nextTelegram);
            const unchanged =
              !prev.loading && telegramUnchanged && arePreferencesEqual(prev, merged);

            if (unchanged) return;

            applyThemeToDocument(merged.theme);
            applyAnimationsToDocument(merged.enableAnimations);
            syncReminderSoundStorage(merged.reminderSoundEnabled);
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
        updatePrefs({ useRoundedSubtasks: !get().useRoundedSubtasks });
      },

      setUseRoundedSubtasks: (useRoundedSubtasks) => {
        updatePrefs({ useRoundedSubtasks });
      },

      toggleTheme: () => {
        const nextTheme: ThemeMode = get().theme === 'dark' ? 'light' : 'dark';
        applyThemeToDocument(nextTheme);
        updatePrefs({ theme: nextTheme });
      },

      setTheme: (theme) => {
        applyThemeToDocument(theme);
        updatePrefs({ theme });
      },

      setExportTheme: (exportTheme) => {
        updatePrefs({ exportTheme });
      },

      setTaskLabelPosition: (taskLabelPosition) => {
        updatePrefs({ taskLabelPosition });
      },

      setSubtaskLabelPosition: (subtaskLabelPosition) => {
        updatePrefs({ subtaskLabelPosition });
      },

      toggleShowDependencyLinesOnExport: () => {
        updatePrefs({ showDependencyLinesOnExport: !get().showDependencyLinesOnExport });
      },

      setBarHeight: (barHeight) => {
        updatePrefs({ barHeight });
      },

      toggleShowDependencyLines: () => {
        updatePrefs({ showDependencyLines: !get().showDependencyLines });
      },

      toggleShowSubtaskConnectors: () => {
        updatePrefs({ showSubtaskConnectors: !get().showSubtaskConnectors });
      },

      toggleShowTaskDescriptions: () => {
        updatePrefs({ showTaskDescriptions: !get().showTaskDescriptions });
      },

      toggleEnableAnimations: () => {
        const nextValue = !get().enableAnimations;
        applyAnimationsToDocument(nextValue);
        updatePrefs({ enableAnimations: nextValue });
      },

      toggleShowBarTooltips: () => {
        updatePrefs({ showBarTooltips: !get().showBarTooltips });
      },

      toggleShowProgressPercentages: () => {
        updatePrefs({ showProgressPercentages: !get().showProgressPercentages });
      },

      toggleShowTodayLine: () => {
        updatePrefs({ showTodayLine: !get().showTodayLine });
      },

      toggleHighlightWeekends: () => {
        updatePrefs({ highlightWeekends: !get().highlightWeekends });
      },

      toggleShowCriticalPathByDefault: () => {
        updatePrefs({ showCriticalPathByDefault: !get().showCriticalPathByDefault });
      },

      toggleAutoCascadeDependencies: () => {
        updatePrefs({ autoCascadeDependencies: !get().autoCascadeDependencies });
      },

      toggleEnableInAppReminders: () => {
        updatePrefs({ enableInAppReminders: !get().enableInAppReminders });
      },

      toggleReminderSoundEnabled: () => {
        const nextValue = !get().reminderSoundEnabled;
        syncReminderSoundStorage(nextValue);
        updatePrefs({ reminderSoundEnabled: nextValue });
      },

      setReminderSoundEnabled: (reminderSoundEnabled) => {
        syncReminderSoundStorage(reminderSoundEnabled);
        updatePrefs({ reminderSoundEnabled });
      },

      getPreferencesSnapshot: () => extractPrefs(get()),

      resetPreferences: async () => {
        applyThemeToDocument(DEFAULT_PREFERENCES.theme);
        applyAnimationsToDocument(DEFAULT_PREFERENCES.enableAnimations);
        syncReminderSoundStorage(DEFAULT_PREFERENCES.reminderSoundEnabled);
        set({ ...DEFAULT_PREFERENCES });
        const user = auth.currentUser;
        if (user) {
          await savePreferencesInFirestore(user.uid, DEFAULT_PREFERENCES);
        }
      },
    };
  }),
);
