import { memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowsInLineVertical,
  ArrowsInSimple,
  ArrowsOutLineVertical,
  ArrowsOutSimple,
  CalendarBlank,
  Camera,
  CornersOut,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  NoteBlank,
} from '@phosphor-icons/react';
import type { TaskStats, TimelineGranularity } from '@/types';
import { cn } from '@/utils/cn';
import { SPRING_SNAPPY, STUDIO_EASE } from '@/utils/motion';

export type StatusFilter = 'all' | 'active' | 'done';

const GRANULARITY_OPTIONS: Array<{
  value: TimelineGranularity;
  label: string;
  shortLabel: string;
}> = [
  { value: 'days', label: 'Days', shortLabel: 'D' },
  { value: 'weeks', label: 'Weeks', shortLabel: 'W' },
  { value: 'months', label: 'Months', shortLabel: 'M' },
  { value: 'quarters', label: 'Quarters', shortLabel: 'Q' },
  { value: 'years', label: 'Years', shortLabel: 'Y' },
];

const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'done', label: 'Done' },
];

export interface GanttToolbarProps {
  stats: TaskStats;
  statusFilter: StatusFilter;
  onStatusFilterChange: (filter: StatusFilter) => void;
  granularity: TimelineGranularity;
  onGranularityChange: (granularity: TimelineGranularity) => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onAutoFit: () => void;
  onScrollToToday: () => void;
  isExpandedView: boolean;
  onToggleExpandedView: () => void;
  showTaskDescriptions: boolean;
  onToggleTaskDescriptions: () => void;
  hasCollapsibleParents: boolean;
  allCollapsed: boolean;
  onToggleCollapseAll: () => void;
  isMobile: boolean;
}

export const GanttToolbar = memo(function GanttToolbar({
  stats,
  statusFilter,
  onStatusFilterChange,
  granularity,
  onGranularityChange,
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onAutoFit,
  onScrollToToday,
  isExpandedView,
  onToggleExpandedView,
  showTaskDescriptions,
  onToggleTaskDescriptions,
  hasCollapsibleParents,
  allCollapsed,
  onToggleCollapseAll,
  isMobile,
}: GanttToolbarProps) {
  return (
    <div className="shrink-0 border-b border-slate-200/90 dark:border-white/[0.08] bg-[#FAFBFD] dark:bg-surface-dark">
      <div className="flex items-center justify-between gap-2 px-3 md:px-4 py-2 overflow-x-auto">
        {/* Left: Progress meter + Status filter chips + Collapse all */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Tactile completion meter */}
          <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-white dark:bg-surface-elevated border border-slate-200/90 dark:border-white/[0.08] shadow-surface-sm">
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
              {stats.total} {stats.total === 1 ? 'task' : 'tasks'}
            </span>
            {stats.total > 0 && (
              <>
                <div className="hidden sm:block w-14 h-1.5 rounded-full bg-slate-200/90 dark:bg-white/[0.08] overflow-hidden">
                  <motion.div
                    initial={false}
                    animate={{ width: `${stats.completionPercent}%` }}
                    transition={{ duration: 0.45, ease: STUDIO_EASE }}
                    className={cn(
                      'h-full rounded-full',
                      stats.completionPercent === 100
                        ? 'bg-emerald-500'
                        : 'bg-brand-500 dark:bg-brand-400',
                    )}
                  />
                </div>
                <span className="font-mono text-[11px] font-semibold text-brand-600 dark:text-brand-400 tabular-nums">
                  {stats.completionPercent}%
                </span>
              </>
            )}
          </div>

          {/* Quick Status Filter Pills with Framer Motion layoutId glide */}
          <div
            role="group"
            aria-label="Filter tasks by status"
            className="hidden xl:inline-flex items-center p-0.5 rounded-lg bg-slate-200/60 dark:bg-white/[0.05] border border-slate-200/80 dark:border-white/[0.08]"
          >
            {STATUS_FILTER_OPTIONS.map((opt) => {
              const active = statusFilter === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onStatusFilterChange(opt.value)}
                  className={cn(
                    'relative px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer',
                    active
                      ? 'text-slate-900 dark:text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="status-filter-active-pill"
                      transition={SPRING_SNAPPY}
                      className="absolute inset-0 rounded-md bg-white dark:bg-surface-elevated border border-slate-200/80 dark:border-white/10 shadow-surface-sm"
                    />
                  )}
                  <span className="relative z-10">{opt.label}</span>
                </button>
              );
            })}
          </div>

          {hasCollapsibleParents && (
            <button
              type="button"
              onClick={onToggleCollapseAll}
              title={allCollapsed ? 'Expand all groups' : 'Collapse all groups'}
              aria-label={allCollapsed ? 'Expand all groups' : 'Collapse all groups'}
              className="hidden sm:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.07] transition-colors cursor-pointer"
            >
              {allCollapsed ? (
                <>
                  <ArrowsOutLineVertical weight="duotone" className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                  <span className="hidden 2xl:inline">Expand all</span>
                </>
              ) : (
                <>
                  <ArrowsInLineVertical weight="duotone" className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                  <span className="hidden 2xl:inline">Collapse all</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Center: Granularity Segmented Control with Framer Motion glide */}
        <div
          role="tablist"
          aria-label="Timeline granularity"
          className="inline-flex items-center p-0.5 rounded-lg bg-slate-200/65 dark:bg-white/[0.05] border border-slate-200/90 dark:border-white/[0.08] shrink-0"
        >
          {GRANULARITY_OPTIONS.map((option) => {
            const active = granularity === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onGranularityChange(option.value)}
                className={cn(
                  'relative px-2.5 md:px-3 py-1 text-xs font-semibold rounded-md transition-colors duration-150 cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                  active
                    ? 'text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="granularity-active-pill"
                    transition={SPRING_SNAPPY}
                    className="absolute inset-0 rounded-md bg-brand-600 dark:bg-brand-500 shadow-brand-glow-sm"
                  />
                )}
                <span className="relative z-10">
                  {isMobile ? option.shortLabel : option.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right: Zoom + Fit + Today + Full-Height */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="inline-flex items-center p-0.5 rounded-lg bg-white dark:bg-surface-elevated border border-slate-200/90 dark:border-white/[0.08] shadow-surface-sm">
            <button
              type="button"
              onClick={onZoomOut}
              disabled={zoom <= 0.5}
              aria-label="Zoom out"
              title="Zoom out (- or Ctrl+Scroll)"
              className="p-1.5 rounded-md text-slate-600 hover:text-brand-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-brand-400 dark:hover:bg-white/[0.08] disabled:opacity-40 transition-colors cursor-pointer"
            >
              <MagnifyingGlassMinus weight="duotone" className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onResetZoom}
              title="Reset zoom to 100%"
              className="px-2 py-1 font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:text-brand-600 dark:hover:text-brand-400 tabular-nums cursor-pointer"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={onZoomIn}
              disabled={zoom >= 3}
              aria-label="Zoom in"
              title="Zoom in (+ or Ctrl+Scroll)"
              className="p-1.5 rounded-md text-slate-600 hover:text-brand-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-brand-400 dark:hover:bg-white/[0.08] disabled:opacity-40 transition-colors cursor-pointer"
            >
              <MagnifyingGlassPlus weight="duotone" className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={onToggleTaskDescriptions}
            aria-pressed={showTaskDescriptions}
            aria-label={
              showTaskDescriptions
                ? 'Hide task descriptions on timeline'
                : 'Show task descriptions on timeline'
            }
            title={
              showTaskDescriptions
                ? 'Hide task descriptions on timeline'
                : 'Show task descriptions on timeline'
            }
            className={cn(
              'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold border transition-transform duration-75 active:scale-[0.97] cursor-pointer shadow-surface-sm',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
              showTaskDescriptions
                ? 'bg-brand-600 text-white border-brand-500 shadow-brand-glow-sm dark:bg-brand-500 dark:border-brand-400'
                : 'border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-surface-elevated text-slate-600 hover:text-brand-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:text-brand-400 dark:hover:bg-white/[0.06]',
            )}
          >
            <NoteBlank
              weight="duotone"
              className={cn(
                'w-4 h-4',
                showTaskDescriptions ? 'text-white' : 'text-brand-600 dark:text-brand-400',
              )}
            />
            <span className="hidden xl:inline">Descriptions</span>
            <span className="hidden sm:inline xl:hidden">Notes</span>
          </button>

          <button
            type="button"
            onClick={onAutoFit}
            aria-label="Fit timeline to screen"
            title="Auto-fit all tasks"
            className="hidden md:inline-flex items-center justify-center h-8 w-8 rounded-lg border border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-surface-elevated text-slate-600 hover:text-brand-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:text-brand-400 dark:hover:bg-white/[0.06] transition-colors cursor-pointer shadow-surface-sm"
          >
            <CornersOut weight="duotone" className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onScrollToToday}
            title="Jump to Today (T)"
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100/90 border border-brand-200/90 dark:text-brand-300 dark:bg-brand-500/15 dark:hover:bg-brand-500/25 dark:border-brand-400/25 transition-colors cursor-pointer"
          >
            <CalendarBlank weight="duotone" className="w-4 h-4 text-brand-600 dark:text-brand-400" />
            <span className="hidden sm:inline">Today</span>
          </button>

          <button
            type="button"
            onClick={onToggleExpandedView}
            aria-label={isExpandedView ? 'Exit full-height view' : 'Enter full-height view'}
            title={isExpandedView ? 'Exit full-height capture view' : 'Full-height capture view'}
            className={cn(
              'hidden md:inline-flex items-center justify-center h-8 w-8 rounded-lg border transition-colors cursor-pointer shadow-surface-sm',
              isExpandedView
                ? 'bg-brand-600 text-white border-brand-500 shadow-brand-glow-sm'
                : 'border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-surface-elevated text-slate-600 hover:text-brand-600 dark:text-slate-300 dark:hover:text-brand-400',
            )}
          >
            {isExpandedView ? (
              <ArrowsInSimple weight="duotone" className="w-4 h-4" />
            ) : (
              <ArrowsOutSimple weight="duotone" className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Full-Height Capture Mode Banner */}
      <AnimatePresence initial={false}>
        {isExpandedView && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: STUDIO_EASE }}
            className="overflow-hidden border-t border-brand-200/80 dark:border-brand-400/20 bg-brand-50/75 dark:bg-brand-500/10"
          >
            <div className="flex items-center justify-between gap-3 px-4 py-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-brand-500/15 border border-brand-500/20 flex items-center justify-center shrink-0">
                  <Camera weight="duotone" className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Full-Height Capture Active
                  </p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                    All rows are unclipped for full-page screenshots, or use Export → PNG / PDF.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onToggleExpandedView}
                className="px-3 py-1 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 transition-colors cursor-pointer shrink-0"
              >
                Exit
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
