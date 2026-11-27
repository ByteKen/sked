import { memo, useState } from 'react';
import {
  ArrowUpRight,
  CalendarBlank,
  CaretDown,
  CaretUp,
  Check,
  CheckCircle,
  Clock,
  Fire,
  FolderSimple,
  LockSimple,
  Path,
  PlayCircle,
  WarningCircle,
} from '@phosphor-icons/react';
import {
  type CrossWorkspaceFocusTask,
  type FocusBucket,
  type PortfolioFocusSummary,
} from '@/domain/projectHealth';
import { formatShortDate } from '@/domain/timeline';
import type { TaskStatus } from '@/types';
import { cn } from '@/utils/cn';

type FocusTab = 'all' | FocusBucket;

const INITIAL_VISIBLE_LIMIT = 5;

export interface FocusDashboardPanelProps {
  summary: PortfolioFocusSummary;
  onOpenTask: (workspaceId: string, taskId: number) => void;
  onUpdateTaskStatus: (workspaceId: string, taskId: number, status: TaskStatus) => void;
}

export const FocusDashboardPanel = memo(function FocusDashboardPanel({
  summary,
  onOpenTask,
  onUpdateTaskStatus,
}: FocusDashboardPanelProps) {
  const [activeTab, setActiveTab] = useState<FocusTab>('all');
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const { counts, buckets, prioritizedQueue } = summary;

  const activeItems: CrossWorkspaceFocusTask[] =
    activeTab === 'all' ? prioritizedQueue : buckets[activeTab];

  const visibleItems = expanded ? activeItems : activeItems.slice(0, INITIAL_VISIBLE_LIMIT);
  const hasMore = activeItems.length > INITIAL_VISIBLE_LIMIT;

  const kpiCards: Array<{
    id: FocusBucket;
    label: string;
    count: number;
    icon: typeof WarningCircle;
    iconClass: string;
    activeClass: string;
    valueClass: string;
  }> = [
    {
      id: 'overdue',
      label: 'Overdue',
      count: counts.overdue,
      icon: WarningCircle,
      iconClass: 'text-rose-500 dark:text-rose-400',
      activeClass: 'border-rose-400/90 bg-rose-50/70 dark:border-rose-500/50 dark:bg-rose-500/10',
      valueClass:
        counts.overdue > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white',
    },
    {
      id: 'today',
      label: 'Due Today',
      count: counts.today,
      icon: Fire,
      iconClass: 'text-amber-500 dark:text-amber-400',
      activeClass: 'border-amber-400/90 bg-amber-50/70 dark:border-amber-400/50 dark:bg-amber-500/10',
      valueClass:
        counts.today > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white',
    },
    {
      id: 'working',
      label: 'Working Now',
      count: counts.working,
      icon: PlayCircle,
      iconClass: 'text-brand-600 dark:text-brand-400',
      activeClass: 'border-brand-400/90 bg-brand-50/70 dark:border-brand-400/50 dark:bg-brand-500/10',
      valueClass:
        counts.working > 0
          ? 'text-brand-600 dark:text-brand-400'
          : 'text-slate-900 dark:text-white',
    },
    {
      id: 'upcoming',
      label: 'Next 7 Days',
      count: counts.upcoming,
      icon: CalendarBlank,
      iconClass: 'text-slate-500 dark:text-slate-400',
      activeClass: 'border-brand-400/80 bg-slate-100/80 dark:border-white/25 dark:bg-white/[0.06]',
      valueClass: 'text-slate-900 dark:text-white',
    },
  ];

  const handleSelectKpi = (bucket: FocusBucket) => {
    setCollapsed(false);
    setExpanded(false);
    setActiveTab((prev) => (prev === bucket ? 'all' : bucket));
  };

  const formatDuePill = (item: CrossWorkspaceFocusTask) => {
    if (item.daysUntilDue < 0) {
      return {
        label: `${Math.abs(item.daysUntilDue)}d overdue`,
        className:
          'bg-rose-100 text-rose-700 border-rose-200/80 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/30',
      };
    }
    if (item.daysUntilDue === 0) {
      return {
        label: 'Due today',
        className:
          'bg-amber-100 text-amber-800 border-amber-200/80 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-400/30',
      };
    }
    if (item.daysUntilDue <= 3) {
      return {
        label: `In ${item.daysUntilDue}d`,
        className:
          'bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-400/25',
      };
    }
    return {
      label: formatShortDate(item.end),
      className:
        'bg-slate-100 text-slate-600 border-slate-200/80 dark:bg-white/[0.07] dark:text-slate-300 dark:border-white/[0.08]',
    };
  };

  return (
    <section
      aria-label="My Focus Dashboard"
      className="mb-10 rounded-2xl border border-slate-200/90 dark:border-white/[0.08] bg-white/95 dark:bg-surface-dark/95 shadow-surface-sm overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 dark:border-white/[0.06] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            My Focus
          </span>
          {prioritizedQueue.length > 0 && (
            <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300 tabular-nums">
              {prioritizedQueue.length}
            </span>
          )}
          {counts.blocked > 0 && (
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 text-[11px] font-semibold">
              <LockSimple weight="duotone" className="w-3 h-3" />
              {counts.blocked} blocked
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer"
        >
          <span>{collapsed ? 'Show' : 'Hide'}</span>
          {collapsed ? (
            <CaretDown weight="bold" className="w-3.5 h-3.5" />
          ) : (
            <CaretUp weight="bold" className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {!collapsed && (
        <div className="p-4 sm:p-5 space-y-4">
          {/* Cross-Workspace KPI Strip (2 cols on phone, 4 cols on desktop) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            {kpiCards.map((card) => {
              const Icon = card.icon;
              const isSelected = activeTab === card.id;
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => handleSelectKpi(card.id)}
                  aria-pressed={isSelected}
                  className={cn(
                    'flex items-center justify-between gap-2 p-3 sm:px-4 sm:py-3 rounded-xl border text-left transition-all cursor-pointer',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                    isSelected
                      ? card.activeClass
                      : 'border-slate-200/80 dark:border-white/[0.07] bg-slate-50/75 dark:bg-white/[0.02] hover:border-slate-300 dark:hover:border-white/15',
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                      {card.label}
                    </p>
                    <p
                      className={cn(
                        'font-mono text-xl sm:text-2xl font-bold leading-tight mt-0.5 tabular-nums',
                        card.valueClass,
                      )}
                    >
                      {card.count}
                    </p>
                  </div>
                  <div className="w-9 h-9 rounded-xl bg-white dark:bg-surface-elevated border border-slate-200/80 dark:border-white/[0.08] flex items-center justify-center shrink-0 shadow-surface-sm">
                    <Icon weight="duotone" className={cn('w-4 h-4', card.iconClass)} />
                  </div>
                </button>
              );
            })}
          </div>

          {/* All Caught Up Calm State */}
          {prioritizedQueue.length === 0 ? (
            <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-emerald-200/80 dark:border-emerald-500/25 bg-emerald-50/60 dark:bg-emerald-500/10">
              <CheckCircle
                weight="duotone"
                className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0"
              />
              <p className="text-xs sm:text-[13px] font-medium text-emerald-900 dark:text-emerald-200">
                All caught up — no overdue or upcoming deadlines in the next 7 days across your
                workspaces.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Filter Tabs */}
              <div
                role="tablist"
                aria-label="Focus task queues"
                className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pb-0.5"
              >
                {(
                  [
                    { id: 'all', label: 'All Priority', count: prioritizedQueue.length },
                    { id: 'overdue', label: 'Overdue', count: counts.overdue },
                    { id: 'today', label: 'Today', count: counts.today },
                    { id: 'working', label: 'Working', count: counts.working },
                    { id: 'upcoming', label: 'Next 7 Days', count: counts.upcoming },
                  ] as const
                ).map((tab) => {
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => {
                        setActiveTab(tab.id);
                        setExpanded(false);
                      }}
                      className={cn(
                        'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer',
                        active
                          ? 'bg-brand-600 text-white dark:bg-brand-500 shadow-brand-glow-sm'
                          : 'bg-slate-100/90 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 dark:bg-white/[0.05] dark:text-slate-300 dark:hover:bg-white/[0.1]',
                      )}
                    >
                      <span>{tab.label}</span>
                      <span
                        className={cn(
                          'font-mono text-[10px] tabular-nums',
                          active ? 'text-white/85' : 'text-slate-400 dark:text-slate-500',
                        )}
                      >
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Focus Task Rows */}
              {visibleItems.length === 0 ? (
                <div className="px-4 py-6 rounded-xl border border-dashed border-slate-200 dark:border-white/[0.1] text-center">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Nothing in this bucket right now.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-white/[0.06] rounded-xl border border-slate-200/80 dark:border-white/[0.08] overflow-hidden bg-white dark:bg-surface-elevated/40">
                  {visibleItems.map((item) => {
                    const duePill = formatDuePill(item);
                    const isWorking = item.status === 'working';

                    return (
                      <div
                        key={`${item.workspaceId}-${item.taskId}`}
                        data-testid={`focus-item-${item.workspaceId}-${item.taskId}`}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 px-3.5 py-3 hover:bg-slate-50/90 dark:hover:bg-white/[0.03] transition-colors"
                      >
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateTaskStatus(item.workspaceId, item.taskId, 'completed')
                            }
                            aria-label={`Mark ${item.taskName} complete`}
                            title="Mark done"
                            className="mt-0.5 w-4 h-4 rounded-md border border-slate-300 dark:border-white/25 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/15 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                          >
                            <Check weight="bold" className="w-3 h-3 opacity-0 hover:opacity-100 text-emerald-600" />
                          </button>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <button
                                type="button"
                                onClick={() => onOpenTask(item.workspaceId, item.taskId)}
                                className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 hover:text-brand-600 dark:hover:text-brand-400 text-left truncate max-w-full cursor-pointer"
                              >
                                {item.taskName}
                              </button>
                              {item.isCritical && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-500/15 text-[10px] font-semibold text-rose-700 dark:text-rose-300">
                                  <Path weight="duotone" className="w-3 h-3" />
                                  Critical
                                </span>
                              )}
                              {item.blockedByIncompleteCount > 0 && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-500/15 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                                  <LockSimple weight="duotone" className="w-3 h-3" />
                                  Blocked
                                </span>
                              )}
                              {typeof item.slipDays === 'number' && item.slipDays > 0 && (
                                <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 tabular-nums">
                                  +{item.slipDays}d
                                </span>
                              )}
                            </div>

                            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 flex-wrap">
                              <span className="inline-flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300">
                                <FolderSimple
                                  weight="duotone"
                                  className="w-3 h-3 text-brand-500 shrink-0"
                                />
                                {item.workspaceTitle}
                              </span>
                              {item.parentName && (
                                <>
                                  <span className="opacity-50">/</span>
                                  <span className="truncate max-w-[180px]">{item.parentName}</span>
                                </>
                              )}
                              {item.progress > 0 && (
                                <>
                                  <span className="opacity-50">·</span>
                                  <span className="font-mono tabular-nums">{item.progress}%</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right Controls (compact & thumb-friendly on mobile too) */}
                        <div className="flex items-center justify-between sm:justify-end gap-2 pl-6 sm:pl-0 shrink-0">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 px-2 py-0.5 rounded-md border font-mono text-[11px] font-semibold tabular-nums',
                              duePill.className,
                            )}
                          >
                            <Clock weight="duotone" className="w-3 h-3" />
                            {duePill.label}
                          </span>

                          <div className="flex items-center gap-1">
                            {!isWorking && (
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateTaskStatus(item.workspaceId, item.taskId, 'working')
                                }
                                aria-label={`Start working on ${item.taskName}`}
                                title="Mark Working Now"
                                className="inline-flex items-center gap-1 h-7 px-2 rounded-lg text-[11px] font-semibold border border-slate-200/90 dark:border-white/[0.1] bg-white dark:bg-surface-elevated text-slate-600 hover:text-amber-700 hover:border-amber-300 hover:bg-amber-50/70 dark:text-slate-300 dark:hover:text-amber-300 dark:hover:bg-amber-500/15 transition-colors cursor-pointer"
                              >
                                <PlayCircle weight="duotone" className="w-3.5 h-3.5" />
                                <span>Start</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => onOpenTask(item.workspaceId, item.taskId)}
                              aria-label={`Open ${item.taskName} in ${item.workspaceTitle}`}
                              title="Open in workspace"
                              className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:text-brand-400 dark:hover:bg-brand-500/15 transition-colors cursor-pointer"
                            >
                              <ArrowUpRight weight="bold" className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {hasMore && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors cursor-pointer"
                  >
                    {expanded ? 'Show fewer' : `Show all ${activeItems.length} tasks`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
});
