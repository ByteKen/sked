import { useMemo, useState, type ComponentType } from 'react';
import { motion } from 'framer-motion';
import {
  BellRinging,
  FileCode,
  FileCsv,
  FilePdf,
  Image as ImageIcon,
  Keyboard,
  MoonStars,
  Printer,
  SlidersHorizontal,
  Sun,
  UserCircle,
  X,
  type IconProps,
} from '@phosphor-icons/react';
import { DeleteAccountModal } from '@/components/modals/DeleteAccountModal';
import { DisplaySettingsTab } from '@/components/settings/DisplaySettingsTab';
import { ProfileSettingsTab } from '@/components/settings/ProfileSettingsTab';
import { ShortcutsSettingsTab } from '@/components/settings/ShortcutsSettingsTab';
import { TelegramSettingsSection } from '@/components/settings/TelegramSettingsSection';
import { Modal } from '@/components/ui/Modal';
import { Switch } from '@/components/ui/Switch';
import { useAuthStore } from '@/store/authStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { cn } from '@/utils/cn';
import { SPRING_SNAPPY } from '@/utils/motion';

export type SettingsTabId = 'display' | 'export' | 'notifications' | 'shortcuts' | 'profile';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: SettingsTabId;
}

const EXPORT_FORMAT_GUIDE = [
  {
    icon: FilePdf,
    title: 'PDF Landscape',
    desc: 'Print-ready chart using your chosen theme',
  },
  {
    icon: ImageIcon,
    title: 'PNG Image (2×)',
    desc: 'High-res snapshot for slides & docs',
  },
  {
    icon: FileCsv,
    title: 'CSV Spreadsheet',
    desc: 'Hierarchy, dates, progress & blockers',
  },
  {
    icon: FileCode,
    title: 'JSON Backup',
    desc: 'Lossless archive ready to re-import',
  },
];

interface TabDefinition {
  id: SettingsTabId;
  label: string;
  subtitle: string;
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
    exportTheme,
    showDependencyLinesOnExport,
    telegram,
    setExportTheme,
    toggleShowDependencyLinesOnExport,
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
      ordered.push({
        id: 'profile',
        label: 'Profile',
        subtitle: 'Public identity, shared attribution, and account',
        icon: UserCircle,
      });
    }
    ordered.push(
      {
        id: 'display',
        label: 'Display',
        subtitle: 'Theme, motion, timeline layout, and alerts',
        icon: SlidersHorizontal,
      },
      {
        id: 'export',
        label: 'Export',
        subtitle: 'PDF & PNG styling and supported export formats',
        icon: Printer,
      },
    );
    if (user) {
      ordered.push({
        id: 'notifications',
        label: 'Bot & Alerts',
        subtitle: 'Telegram bot commands and deadline reminders',
        icon: BellRinging,
        badgeDot: telegramActive,
      });
    }
    ordered.push({
      id: 'shortcuts',
      label: 'Shortcuts',
      subtitle: 'Keyboard shortcuts and timeline gestures',
      icon: Keyboard,
    });
    return ordered;
  }, [user, telegramActive]);

  const activeTabMeta = tabs.find((t) => t.id === activeTab) ?? tabs[0];
  const resolvedTab: SettingsTabId = activeTabMeta?.id ?? 'display';

  const syncIfShared = () => {
    if (currentWorkspaceId) {
      void syncSharedPreferences(currentWorkspaceId, getPreferencesSnapshot());
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Settings"
      maxWidth="2xl"
      hideHeader
      panelClassName="h-[min(600px,86vh)]"
    >
      <div className="flex flex-col sm:flex-row flex-1 min-h-0">
        {/* Left Navigation Rail (Horizontal compact strip on mobile) */}
        <aside className="sm:w-[196px] shrink-0 bg-[#F8F9FC] dark:bg-white/[0.02] border-b sm:border-b-0 sm:border-r border-slate-200/75 dark:border-white/[0.07] flex flex-col">
          {/* Mobile top header inside rail */}
          <div className="flex sm:hidden items-center justify-between px-4 pt-3.5 pb-1.5">
            <span className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-slate-50">
              Settings
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close settings"
              className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 dark:hover:text-slate-200 dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" weight="bold" />
            </button>
          </div>

          <p className="hidden sm:block px-4 pt-5 pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
            Settings
          </p>

          <nav
            role="tablist"
            aria-label="Settings sections"
            className="flex sm:flex-col gap-1 px-2.5 py-2 sm:py-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                    'relative inline-flex items-center gap-2.5 h-9 px-3 rounded-xl text-[13px] transition-colors whitespace-nowrap shrink-0 cursor-pointer text-left',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                    active
                      ? 'text-slate-900 dark:text-white font-semibold'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 font-medium',
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="settings-modal-active-tab"
                      transition={SPRING_SNAPPY}
                      className="absolute inset-0 rounded-xl bg-white dark:bg-surface-elevated shadow-[0_1px_3px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/85 dark:ring-white/[0.09]"
                    />
                  )}
                  <span className="relative z-10 inline-flex items-center gap-2.5 w-full">
                    <Icon
                      weight={active ? 'duotone' : 'regular'}
                      className={cn(
                        'w-4 h-4 shrink-0',
                        active
                          ? 'text-brand-600 dark:text-brand-400'
                          : 'text-slate-400 dark:text-slate-500',
                      )}
                    />
                    <span className="truncate">{tab.label}</span>
                    {tab.badgeDot && (
                      <span
                        aria-label="Active"
                        className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"
                      />
                    )}
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="hidden sm:flex items-center gap-2 mt-auto px-4 py-3.5 border-t border-slate-200/60 dark:border-white/[0.06]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              Auto-synced to cloud
            </span>
          </div>
        </aside>

        {/* Right Clean Content Pane */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          {/* Active Section Header */}
          <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-white/[0.07] shrink-0">
            <div className="min-w-0">
              <h3 className="text-[16px] font-semibold tracking-tight text-slate-900 dark:text-slate-50 leading-snug">
                {activeTabMeta?.label}
              </h3>
              {activeTabMeta?.subtitle && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  {activeTabMeta.subtitle}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="hidden sm:inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-white/[0.08] transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <X className="w-4 h-4" weight="bold" />
            </button>
          </div>

          {/* Scrollable Panel Content */}
          <div
            role="tabpanel"
            id={`settings-panel-${resolvedTab}`}
            aria-labelledby={`settings-tab-${resolvedTab}`}
            className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-4"
          >
            {resolvedTab === 'display' && (
              <DisplaySettingsTab onSharedPrefsChanged={syncIfShared} />
            )}

            {resolvedTab === 'export' && (
              <div className="space-y-6">
                <section>
                  <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500 pb-1.5">
                    PDF &amp; Image Export Styling
                  </h4>

                  <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3.5">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-slate-900 dark:text-slate-100">
                          Export Theme
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Light palette is recommended when printing PDFs
                        </p>
                      </div>
                      <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-white/[0.06] border border-slate-200/70 dark:border-white/[0.06] self-start sm:self-center shrink-0">
                        {(
                          [
                            { value: 'light', label: 'Light', icon: Sun },
                            { value: 'dark', label: 'Dark', icon: MoonStars },
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
                                'relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer',
                                active
                                  ? 'text-slate-900 dark:text-white font-semibold'
                                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white',
                              )}
                            >
                              {active && (
                                <motion.span
                                  layoutId="settings-export-theme-pill"
                                  transition={SPRING_SNAPPY}
                                  className="absolute inset-0 rounded-md bg-white dark:bg-surface-elevated shadow-surface-sm ring-1 ring-slate-200/80 dark:ring-white/10"
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
                    </div>

                    <div className="flex items-center justify-between gap-4 py-3.5">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-slate-900 dark:text-slate-100">
                          Dependency Arrows in Exports
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Include blocker connector arrows in PDF and PNG exports
                        </p>
                      </div>
                      <Switch
                        checked={showDependencyLinesOnExport}
                        onChange={toggleShowDependencyLinesOnExport}
                        ariaLabel="Toggle dependency arrows on export"
                      />
                    </div>
                  </div>
                </section>

                <section className="space-y-2.5">
                  <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
                    Available Export Formats
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {EXPORT_FORMAT_GUIDE.map((fmt) => {
                      const Icon = fmt.icon;
                      return (
                        <div
                          key={fmt.title}
                          className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200/75 dark:border-white/[0.07] bg-slate-50/60 dark:bg-white/[0.02]"
                        >
                          <div className="w-7 h-7 rounded-lg bg-brand-50 dark:bg-brand-500/15 flex items-center justify-center shrink-0 mt-0.5">
                            <Icon
                              weight="duotone"
                              className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                              {fmt.title}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
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
        </div>
      </div>

      <DeleteAccountModal
        isOpen={deleteAccountOpen}
        onClose={() => setDeleteAccountOpen(false)}
        onDeleted={onClose}
      />
    </Modal>
  );
}
