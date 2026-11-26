import { useMemo, useState, type ComponentType } from 'react';
import { motion } from 'framer-motion';
import {
  BellRinging,
  Circle,
  Diamond,
  FileCode,
  FileCsv,
  FilePdf,
  GitBranch,
  Image as ImageIcon,
  Keyboard,
  Lightbulb,
  MoonStars,
  NoteBlank,
  Printer,
  Rows,
  SlidersHorizontal,
  Sun,
  TextT,
  TreeStructure,
  UserCircle,
  type IconProps,
} from '@phosphor-icons/react';
import { DeleteAccountModal } from '@/components/modals/DeleteAccountModal';
import { ProfileSettingsTab } from '@/components/settings/ProfileSettingsTab';
import { ShortcutsSettingsTab } from '@/components/settings/ShortcutsSettingsTab';
import { TelegramSettingsSection } from '@/components/settings/TelegramSettingsSection';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Switch } from '@/components/ui/Switch';
import { useAuthStore } from '@/store/authStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { BarHeightMode, SubtaskLabelPosition, TaskLabelPosition } from '@/types';
import { cn } from '@/utils/cn';
import { SPRING_SNAPPY } from '@/utils/motion';

export type SettingsTabId = 'display' | 'export' | 'notifications' | 'shortcuts' | 'profile';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: SettingsTabId;
}

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

const EXPORT_FORMAT_GUIDE = [
  {
    icon: FilePdf,
    title: 'PDF Landscape',
    desc: 'Print-ready chart document using your selected export theme',
  },
  {
    icon: ImageIcon,
    title: 'PNG Image (2×)',
    desc: 'High-resolution snapshot for slides, docs, and status updates',
  },
  {
    icon: FileCsv,
    title: 'CSV Spreadsheet',
    desc: 'Full task hierarchy, dates, progress, dependencies & descriptions',
  },
  {
    icon: FileCode,
    title: 'JSON Backup',
    desc: 'Complete lossless backup ready for re-importing anytime',
  },
];

interface TabDefinition {
  id: SettingsTabId;
  label: string;
  icon: ComponentType<IconProps>;
  badgeDot?: boolean;
}

export function SettingsModal({ isOpen, onClose, initialTab = 'profile' }: SettingsModalProps) {
  if (!isOpen) return null;
  return <SettingsModalContent isOpen={isOpen} onClose={onClose} initialTab={initialTab} />;
}

function SettingsModalContent({
  isOpen,
  onClose,
  initialTab = 'profile',
}: SettingsModalProps) {
  const {
    useRoundedSubtasks,
    theme,
    exportTheme,
    taskLabelPosition,
    subtaskLabelPosition,
    showDependencyLinesOnExport,
    barHeight,
    showDependencyLines,
    showSubtaskConnectors,
    showTaskDescriptions,
    telegram,
    toggleSubtaskShape,
    toggleTheme,
    setExportTheme,
    setTaskLabelPosition,
    setSubtaskLabelPosition,
    toggleShowDependencyLinesOnExport,
    setBarHeight,
    toggleShowDependencyLines,
    toggleShowSubtaskConnectors,
    toggleShowTaskDescriptions,
    getPreferencesSnapshot,
  } = usePreferencesStore();

  const user = useAuthStore((s) => s.user);
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const syncSharedPreferences = useWorkspaceStore((s) => s.syncSharedPreferences);

  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);

  const telegramActive = Boolean(telegram?.connected && telegram.enabled);
  const tabs = useMemo<TabDefinition[]>(() => {
    const ordered: TabDefinition[] = [];
    if (user) {
      ordered.push({ id: 'profile', label: 'Profile', icon: UserCircle });
    }
    ordered.push(
      { id: 'display', label: 'Display', icon: SlidersHorizontal },
      { id: 'export', label: 'Export', icon: Printer },
    );
    if (user) {
      ordered.push({
        id: 'notifications',
        label: 'Alerts',
        icon: BellRinging,
        badgeDot: telegramActive,
      });
    }
    ordered.push({ id: 'shortcuts', label: 'Shortcuts', icon: Keyboard });
    return ordered;
  }, [user, telegramActive]);

  const resolvedTab = tabs.some((t) => t.id === activeTab) ? activeTab : 'display';

  const syncIfShared = () => {
    if (currentWorkspaceId) {
      void syncSharedPreferences(currentWorkspaceId, getPreferencesSnapshot());
    }
  };

  const tabBar = (
    <div
      role="tablist"
      aria-label="Settings sections"
      className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = resolvedTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`settings-tab-${tab.id}`}
            aria-selected={active}
            aria-controls={`settings-panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'relative inline-flex items-center gap-2 h-9 px-3.5 rounded-xl text-xs sm:text-[13px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
              active
                ? 'text-brand-700 dark:text-brand-300'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
            )}
          >
            {active && (
              <motion.span
                layoutId="settings-modal-active-tab"
                transition={SPRING_SNAPPY}
                className="absolute inset-0 rounded-xl bg-white dark:bg-surface-elevated border border-slate-200/90 dark:border-white/[0.1] shadow-surface-sm"
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-2">
              <Icon
                weight="duotone"
                className={cn(
                  'w-4 h-4 shrink-0',
                  active
                    ? 'text-brand-600 dark:text-brand-400'
                    : 'text-slate-400 dark:text-slate-500',
                )}
              />
              {tab.label}
              {tab.badgeDot && (
                <span
                  aria-label="Active"
                  className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"
                />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Settings"
      description="Customize your workspace display, exports, alerts, shortcuts, and profile"
      maxWidth="xl"
      icon={
        <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
          <SlidersHorizontal weight="duotone" className="w-5 h-5 text-brand-600 dark:text-brand-400" />
        </div>
      }
      subHeader={tabBar}
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Preferences automatically sync across your workspaces.
          </span>
          <Button variant="primary" size="md" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div
        role="tabpanel"
        id={`settings-panel-${resolvedTab}`}
        aria-labelledby={`settings-tab-${resolvedTab}`}
        className="p-6 sm:p-7 min-h-[380px]"
      >
        {resolvedTab === 'display' && (
          <div className="space-y-6">
            {/* Appearance & Milestones */}
            <section className="space-y-3">
              <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                Appearance &amp; Milestones
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-200/90 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.025]">
                  <div className="flex items-center gap-3 min-w-0">
                    {theme === 'dark' ? (
                      <MoonStars weight="duotone" className="w-5 h-5 text-brand-600 dark:text-brand-400 shrink-0" />
                    ) : (
                      <Sun weight="duotone" className="w-5 h-5 text-brand-600 dark:text-brand-400 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Studio Dark Mode
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {theme === 'dark'
                          ? 'Obsidian dark studio surface'
                          : 'Crisp alabaster daylight surface'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={theme === 'dark'}
                    onChange={toggleTheme}
                    ariaLabel="Toggle dark mode"
                  />
                </div>

                <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-200/90 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.025]">
                  <div className="flex items-center gap-3 min-w-0">
                    {useRoundedSubtasks ? (
                      <Circle weight="duotone" className="w-5 h-5 text-brand-600 dark:text-brand-400 shrink-0" />
                    ) : (
                      <Diamond weight="duotone" className="w-5 h-5 text-brand-600 dark:text-brand-400 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Rounded Deadline Bars
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {useRoundedSubtasks
                          ? 'Single-day deadlines as compact bars'
                          : 'Single-day deadlines as diamond markers'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={useRoundedSubtasks}
                    onChange={() => {
                      toggleSubtaskShape();
                      syncIfShared();
                    }}
                    ariaLabel="Toggle rounded deadline bars"
                  />
                </div>
              </div>
            </section>

            {/* Timeline Geometry */}
            <section className="space-y-3">
              <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                Timeline Geometry
              </h3>

              <div className="p-4 rounded-xl border border-slate-200/90 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.025] space-y-3">
                <div className="flex items-center gap-2.5">
                  <Rows weight="duotone" className="w-5 h-5 text-brand-600 dark:text-brand-400" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Bar Density
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Adjust task bar &amp; row vertical height across the timeline
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-200/60 dark:bg-white/[0.05] border border-slate-200/80 dark:border-white/[0.06]">
                  {BAR_HEIGHT_OPTIONS.map((opt) => {
                    const active = barHeight === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setBarHeight(opt.value);
                          syncIfShared();
                        }}
                        className={cn(
                          'relative py-2.5 rounded-lg text-xs sm:text-[13px] font-semibold transition-colors cursor-pointer',
                          active
                            ? 'text-white'
                            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white',
                        )}
                      >
                        {active && (
                          <motion.span
                            layoutId="settings-bar-density-pill"
                            transition={SPRING_SNAPPY}
                            className="absolute inset-0 rounded-lg bg-brand-600 dark:bg-brand-500 shadow-brand-glow-sm"
                          />
                        )}
                        <span className="relative z-10">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200/90 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.025] space-y-3">
                  <div className="flex items-center gap-2">
                    <TextT weight="duotone" className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Task Label Position
                    </p>
                  </div>
                  <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-200/60 dark:bg-white/[0.05] border border-slate-200/80 dark:border-white/[0.06]">
                    {TASK_LABEL_OPTIONS.map((opt) => {
                      const active = taskLabelPosition === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setTaskLabelPosition(opt.value);
                            syncIfShared();
                          }}
                          className={cn(
                            'relative py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer',
                            active
                              ? 'text-white'
                              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white',
                          )}
                        >
                          {active && (
                            <motion.span
                              layoutId="settings-task-label-pill"
                              transition={SPRING_SNAPPY}
                              className="absolute inset-0 rounded-lg bg-brand-600 dark:bg-brand-500 shadow-brand-glow-sm"
                            />
                          )}
                          <span className="relative z-10">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200/90 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.025] space-y-3">
                  <div className="flex items-center gap-2">
                    <TextT weight="duotone" className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Subtask Label Position
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-200/60 dark:bg-white/[0.05] border border-slate-200/80 dark:border-white/[0.06]">
                    {SUBTASK_LABEL_OPTIONS.map((opt) => {
                      const active = subtaskLabelPosition === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setSubtaskLabelPosition(opt.value);
                            syncIfShared();
                          }}
                          className={cn(
                            'relative py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer',
                            active
                              ? 'text-white'
                              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white',
                          )}
                        >
                          {active && (
                            <motion.span
                              layoutId="settings-subtask-label-pill"
                              transition={SPRING_SNAPPY}
                              className="absolute inset-0 rounded-lg bg-brand-600 dark:bg-brand-500 shadow-brand-glow-sm"
                            />
                          )}
                          <span className="relative z-10">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center justify-between gap-3 p-4 rounded-xl border border-slate-200/90 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.025]">
                  <div className="flex items-center gap-3 min-w-0">
                    <GitBranch weight="duotone" className="w-5 h-5 text-brand-600 dark:text-brand-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        Dependency Arrows
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        Visualize blocking task relationships
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={showDependencyLines}
                    onChange={() => {
                      toggleShowDependencyLines();
                      syncIfShared();
                    }}
                    ariaLabel="Toggle dependency arrows"
                  />
                </div>

                <div className="flex items-center justify-between gap-3 p-4 rounded-xl border border-slate-200/90 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.025]">
                  <div className="flex items-center gap-3 min-w-0">
                    <TreeStructure weight="duotone" className="w-5 h-5 text-brand-600 dark:text-brand-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        Subtask Lines
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        Connect parent phases to child subtasks
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={showSubtaskConnectors}
                    onChange={() => {
                      toggleShowSubtaskConnectors();
                      syncIfShared();
                    }}
                    ariaLabel="Toggle subtask connectors"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-200/90 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.025]">
                <div className="flex items-center gap-3 min-w-0">
                  <NoteBlank weight="duotone" className="w-5 h-5 text-brand-600 dark:text-brand-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Show Descriptions on Timeline
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Display task notes directly beneath bars on the timeline and in the task list
                    </p>
                  </div>
                </div>
                <Switch
                  checked={showTaskDescriptions}
                  onChange={() => {
                    toggleShowTaskDescriptions();
                    syncIfShared();
                  }}
                  ariaLabel="Toggle task descriptions on timeline"
                />
              </div>
            </section>
          </div>
        )}

        {resolvedTab === 'export' && (
          <div className="space-y-6">
            <section className="space-y-3">
              <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                PDF &amp; Image Export Styling
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                <div className="p-4 rounded-xl border border-slate-200/90 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.025] space-y-3">
                  <div className="flex items-center gap-2.5">
                    <Printer weight="duotone" className="w-5 h-5 text-brand-600 dark:text-brand-400" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Export Theme
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Palette used for PDF and PNG files
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-200/60 dark:bg-white/[0.05] border border-slate-200/80 dark:border-white/[0.06]">
                    {(
                      [
                        { value: 'light', label: 'Light (Print)', icon: Sun },
                        { value: 'dark', label: 'Dark Studio', icon: MoonStars },
                      ] as const
                    ).map((opt) => {
                      const active = exportTheme === opt.value;
                      const OptionIcon = opt.icon;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setExportTheme(opt.value)}
                          className={cn(
                            'relative flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer',
                            active
                              ? 'text-white'
                              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white',
                          )}
                        >
                          {active && (
                            <motion.span
                              layoutId="settings-export-theme-pill"
                              transition={SPRING_SNAPPY}
                              className="absolute inset-0 rounded-lg bg-brand-600 dark:bg-brand-500 shadow-brand-glow-sm"
                            />
                          )}
                          <span className="relative z-10 inline-flex items-center gap-1.5">
                            <OptionIcon weight="duotone" className="w-3.5 h-3.5" />
                            {opt.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <Lightbulb weight="duotone" className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400 shrink-0" />
                    Light theme is recommended when printing PDFs.
                  </p>
                </div>

                <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-200/90 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.025]">
                  <div className="flex items-center gap-3 min-w-0">
                    <GitBranch weight="duotone" className="w-5 h-5 text-brand-600 dark:text-brand-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Dependency Arrows in Exports
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Include task blocker arrows in generated PDF and PNG exports
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={showDependencyLinesOnExport}
                    onChange={toggleShowDependencyLinesOnExport}
                    ariaLabel="Toggle dependency arrows on export"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                Available Export Formats
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {EXPORT_FORMAT_GUIDE.map((fmt) => {
                  const Icon = fmt.icon;
                  return (
                    <div
                      key={fmt.title}
                      className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-white/[0.02]"
                    >
                      <div className="w-8 h-8 rounded-lg bg-brand-50 dark:bg-brand-500/15 border border-brand-200/70 dark:border-brand-400/20 flex items-center justify-center shrink-0">
                        <Icon weight="duotone" className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {fmt.title}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                          {fmt.desc}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {resolvedTab === 'notifications' && user && <TelegramSettingsSection embedded />}

        {resolvedTab === 'shortcuts' && <ShortcutsSettingsTab />}

        {resolvedTab === 'profile' && user && (
          <ProfileSettingsTab onRequestDeleteAccount={() => setDeleteAccountOpen(true)} />
        )}
      </div>

      <DeleteAccountModal
        isOpen={deleteAccountOpen}
        onClose={() => setDeleteAccountOpen(false)}
        onDeleted={onClose}
      />
    </Modal>
  );
}
