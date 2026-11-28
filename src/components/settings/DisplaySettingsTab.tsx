import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ArrowCounterClockwise } from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { usePreferencesStore } from '@/store/preferencesStore';
import { toast } from '@/store/toastStore';
import type { BarHeightMode, SubtaskLabelPosition, TaskLabelPosition } from '@/types';
import { cn } from '@/utils/cn';
import { SPRING_SNAPPY } from '@/utils/motion';
import { playReminderChime } from '@/utils/reminderSound';

const BAR_HEIGHT_OPTIONS: Array<{ value: BarHeightMode; label: string }> = [
  { value: 'compact', label: 'Compact' },
  { value: 'normal', label: 'Normal' },
  { value: 'large', label: 'Large' },
];

const TASK_LABEL_OPTIONS: Array<{ value: TaskLabelPosition; label: string }> = [
  { value: 'inside', label: 'Inside' },
  { value: 'outside', label: 'Outside' },
  { value: 'top', label: 'Top' },
  { value: 'hidden', label: 'Hidden' },
];

const SUBTASK_LABEL_OPTIONS: Array<{ value: SubtaskLabelPosition; label: string }> = [
  { value: 'outside', label: 'Outside' },
  { value: 'top', label: 'Top' },
  { value: 'hidden', label: 'Hidden' },
];

interface SettingToggleRowProps {
  title: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  ariaLabel: string;
  extraControl?: ReactNode;
}

function SettingToggleRow({
  title,
  description,
  checked,
  onChange,
  ariaLabel,
  extraControl,
}: SettingToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-slate-900 dark:text-slate-100 leading-snug">
          {title}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
          {description}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {extraControl}
        <Switch checked={checked} onChange={onChange} ariaLabel={ariaLabel} />
      </div>
    </div>
  );
}

interface SegmentedRowProps<T extends string> {
  title: string;
  description?: string;
  layoutId: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}

function SegmentedRow<T extends string>({
  title,
  description,
  layoutId,
  value,
  options,
  onChange,
}: SegmentedRowProps<T>) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 py-3">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-slate-900 dark:text-slate-100 leading-snug">
          {title}
        </p>
        {description && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
            {description}
          </p>
        )}
      </div>
      <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-white/[0.06] border border-slate-200/70 dark:border-white/[0.06] self-start sm:self-center shrink-0">
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                'relative px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer',
                active
                  ? 'text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white',
              )}
            >
              {active && (
                <motion.span
                  layoutId={layoutId}
                  transition={SPRING_SNAPPY}
                  className="absolute inset-0 rounded-md bg-white dark:bg-surface-elevated shadow-surface-sm ring-1 ring-slate-200/80 dark:ring-white/10"
                />
              )}
              <span className="relative z-10">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface DisplaySettingsTabProps {
  onSharedPrefsChanged: () => void;
}

export function DisplaySettingsTab({ onSharedPrefsChanged }: DisplaySettingsTabProps) {
  const {
    theme,
    enableAnimations,
    useRoundedSubtasks,
    showBarTooltips,
    barHeight,
    taskLabelPosition,
    subtaskLabelPosition,
    showDependencyLines,
    showSubtaskConnectors,
    showTaskDescriptions,
    showProgressPercentages,
    showTodayLine,
    highlightWeekends,
    showCriticalPathByDefault,
    autoCascadeDependencies,
    enableInAppReminders,
    reminderSoundEnabled,
    toggleTheme,
    toggleEnableAnimations,
    toggleSubtaskShape,
    toggleShowBarTooltips,
    setBarHeight,
    setTaskLabelPosition,
    setSubtaskLabelPosition,
    toggleShowDependencyLines,
    toggleShowSubtaskConnectors,
    toggleShowTaskDescriptions,
    toggleShowProgressPercentages,
    toggleShowTodayLine,
    toggleHighlightWeekends,
    toggleShowCriticalPathByDefault,
    toggleAutoCascadeDependencies,
    toggleEnableInAppReminders,
    toggleReminderSoundEnabled,
    resetPreferences,
  } = usePreferencesStore();

  const handleToggleSound = () => {
    const willEnable = !reminderSoundEnabled;
    toggleReminderSoundEnabled();
    if (willEnable) {
      playReminderChime({ force: true });
    }
  };

  const handleResetDefaults = async () => {
    try {
      await resetPreferences();
      onSharedPrefsChanged();
      toast.info(
        'Preferences reset',
        'All display and workspace preferences were restored to defaults.',
      );
    } catch {
      toast.error('Reset failed', 'Could not restore default preferences right now.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Appearance & Motion */}
      <section>
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500 pb-1">
          Appearance &amp; Motion
        </h4>
        <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
          <SettingToggleRow
            title="Dark Mode"
            description={
              theme === 'dark'
                ? 'Low-glare dark workspace surface'
                : 'Crisp daylight workspace surface'
            }
            checked={theme === 'dark'}
            onChange={toggleTheme}
            ariaLabel="Toggle dark mode"
          />

          <SettingToggleRow
            title="Animations & Motion"
            description={
              enableAnimations
                ? 'Smooth progress fills and subtle transitions'
                : 'Reduced motion for instant UI updates'
            }
            checked={enableAnimations}
            onChange={toggleEnableAnimations}
            ariaLabel="Toggle animations and motion"
          />

          <SettingToggleRow
            title="Rounded Deadline Bars"
            description={
              useRoundedSubtasks
                ? 'Single-day deadlines shown as compact bars'
                : 'Single-day deadlines shown as diamond markers'
            }
            checked={useRoundedSubtasks}
            onChange={() => {
              toggleSubtaskShape();
              onSharedPrefsChanged();
            }}
            ariaLabel="Toggle rounded deadline bars"
          />

          <SettingToggleRow
            title="Bar Hover Tooltips"
            description="Show dates, duration, and due countdown when hovering bars"
            checked={showBarTooltips}
            onChange={toggleShowBarTooltips}
            ariaLabel="Toggle bar hover tooltips"
          />
        </div>
      </section>

      {/* Timeline Layout */}
      <section>
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500 pb-1">
          Timeline Layout
        </h4>
        <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
          <SegmentedRow
            title="Bar Density"
            description="Vertical row height across the timeline"
            layoutId="settings-bar-density-pill"
            value={barHeight}
            options={BAR_HEIGHT_OPTIONS}
            onChange={(val) => {
              setBarHeight(val);
              onSharedPrefsChanged();
            }}
          />

          <SegmentedRow
            title="Task Label Position"
            layoutId="settings-task-label-pill"
            value={taskLabelPosition}
            options={TASK_LABEL_OPTIONS}
            onChange={(val) => {
              setTaskLabelPosition(val);
              onSharedPrefsChanged();
            }}
          />

          <SegmentedRow
            title="Subtask Label Position"
            layoutId="settings-subtask-label-pill"
            value={subtaskLabelPosition}
            options={SUBTASK_LABEL_OPTIONS}
            onChange={(val) => {
              setSubtaskLabelPosition(val);
              onSharedPrefsChanged();
            }}
          />
        </div>
      </section>

      {/* Timeline Overlays & Behavior */}
      <section>
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500 pb-1">
          Timeline Overlays &amp; Behavior
        </h4>
        <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
          <SettingToggleRow
            title="Dependency Arrows"
            description="Visualize blocking relationships between tasks"
            checked={showDependencyLines}
            onChange={() => {
              toggleShowDependencyLines();
              onSharedPrefsChanged();
            }}
            ariaLabel="Toggle dependency arrows"
          />

          <SettingToggleRow
            title="Subtask Lines"
            description="Connect parent phases to nested child subtasks"
            checked={showSubtaskConnectors}
            onChange={() => {
              toggleShowSubtaskConnectors();
              onSharedPrefsChanged();
            }}
            ariaLabel="Toggle subtask connectors"
          />

          <SettingToggleRow
            title="Task Descriptions"
            description="Show task notes beneath timeline bars and in task list"
            checked={showTaskDescriptions}
            onChange={() => {
              toggleShowTaskDescriptions();
              onSharedPrefsChanged();
            }}
            ariaLabel="Toggle task descriptions on timeline"
          />

          <SettingToggleRow
            title="Progress Percentages"
            description="Show % completion readouts on bars and phase rows"
            checked={showProgressPercentages}
            onChange={() => {
              toggleShowProgressPercentages();
              onSharedPrefsChanged();
            }}
            ariaLabel="Toggle progress percentages"
          />

          <SettingToggleRow
            title="Today Marker Line"
            description="Highlight today’s column with a vertical reference line"
            checked={showTodayLine}
            onChange={() => {
              toggleShowTodayLine();
              onSharedPrefsChanged();
            }}
            ariaLabel="Toggle today marker line"
          />

          <SettingToggleRow
            title="Weekend Shading"
            description="Subtly tint Saturday and Sunday columns on the grid"
            checked={highlightWeekends}
            onChange={() => {
              toggleHighlightWeekends();
              onSharedPrefsChanged();
            }}
            ariaLabel="Toggle weekend shading"
          />

          <SettingToggleRow
            title="Critical Path Highlight"
            description="Highlight finish-driving critical path tasks and arrows"
            checked={showCriticalPathByDefault}
            onChange={toggleShowCriticalPathByDefault}
            ariaLabel="Toggle critical path highlight"
          />

          <SettingToggleRow
            title="Auto-Cascade Dependencies"
            description="Automatically shift dependent tasks when dragging predecessors"
            checked={autoCascadeDependencies}
            onChange={toggleAutoCascadeDependencies}
            ariaLabel="Toggle auto-cascade dependencies"
          />
        </div>
      </section>

      {/* In-App Reminders & Sound */}
      <section>
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500 pb-1">
          In-App Reminders &amp; Sound
        </h4>
        <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
          <SettingToggleRow
            title="In-App Reminder Banners"
            description="Show floating alerts while Sked is open for due reminders"
            checked={enableInAppReminders}
            onChange={toggleEnableInAppReminders}
            ariaLabel="Toggle in-app reminder banners"
          />

          <SettingToggleRow
            title="Reminder Alert Chime"
            description="Play a gentle 2-note bell chime when an alert fires"
            checked={reminderSoundEnabled}
            onChange={handleToggleSound}
            ariaLabel="Toggle reminder alert chime"
            extraControl={
              <button
                type="button"
                onClick={() => playReminderChime({ force: true })}
                title="Preview chime sound"
                aria-label="Preview reminder chime"
                className="px-2 py-1 rounded-md text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-slate-100 dark:hover:bg-white/[0.06] border border-slate-200/80 dark:border-white/10 transition-colors cursor-pointer"
              >
                Test
              </button>
            }
          />
        </div>
      </section>

      {/* Restore defaults */}
      <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-white/[0.07]">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Restore all display preferences to defaults
        </p>
        <Button
          type="button"
          variant="secondary"
          size="xs"
          onClick={() => void handleResetDefaults()}
        >
          <ArrowCounterClockwise weight="bold" className="w-3.5 h-3.5" />
          Reset defaults
        </Button>
      </div>
    </div>
  );
}
