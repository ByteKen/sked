export type ThemeMode = 'dark' | 'light';
export type BarHeightMode = 'compact' | 'normal' | 'large';
export type TaskLabelPosition = 'inside' | 'outside' | 'top' | 'hidden';
export type SubtaskLabelPosition = 'outside' | 'top' | 'hidden';
export type TimelineGranularity = 'days' | 'weeks' | 'months' | 'quarters' | 'years';
export type ExportFormat = 'pdf' | 'png' | 'csv' | 'json';

export interface UserPreferences {
  useRoundedSubtasks: boolean;
  theme: ThemeMode;
  exportTheme: ThemeMode;
  taskLabelPosition: TaskLabelPosition;
  subtaskLabelPosition: SubtaskLabelPosition;
  showDependencyLinesOnExport: boolean;
  barHeight: BarHeightMode;
  showDependencyLines: boolean;
  showSubtaskConnectors: boolean;
  showTaskDescriptions: boolean;
}

export interface SharedChartViewPrefs {
  useRoundedSubtasks: boolean;
  taskLabelPosition: TaskLabelPosition;
  subtaskLabelPosition: SubtaskLabelPosition;
  barHeight: BarHeightMode;
  showDependencyLines: boolean;
  showSubtaskConnectors: boolean;
  showTaskDescriptions?: boolean;
}

export interface TelegramNotificationConfig {
  connected: boolean;
  username: string | null;
  firstName: string | null;
  enabled: boolean;
  timezone: string;
  reminderHour: number;
  reminderOffsets: number[];
  includeOverdue: boolean;
  linkedAt: string;
}

export const AVAILABLE_REMINDER_OFFSETS = [7, 5, 3, 2, 1, 0] as const;
export const DEFAULT_REMINDER_OFFSETS: number[] = [5, 3, 1, 0];

export const DEFAULT_PREFERENCES: UserPreferences = {
  useRoundedSubtasks: false,
  theme: 'dark',
  exportTheme: 'light',
  taskLabelPosition: 'inside',
  subtaskLabelPosition: 'outside',
  showDependencyLinesOnExport: false,
  barHeight: 'compact',
  showDependencyLines: true,
  showSubtaskConnectors: true,
  showTaskDescriptions: false,
};
