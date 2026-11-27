import { memo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowsClockwise,
  ArrowsInLineVertical,
  ArrowsInSimple,
  ArrowsOutLineVertical,
  ArrowsOutSimple,
  CalendarBlank,
  Camera,
  CaretDown,
  CornersOut,
  Eye,
  EyeSlash,
  FlagBanner,
  LinkSimple,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  NoteBlank,
  Path,
  SlidersHorizontal,
  Trash,
  X,
} from '@phosphor-icons/react';
import { Switch } from '@/components/ui/Switch';
import type { TaskStats, TimelineGranularity, WorkspaceBaseline } from '@/types';
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
  showCriticalPath: boolean;
  onToggleCriticalPath: () => void;
  criticalTaskCount: number;
  autoCascade: boolean;
  onToggleAutoCascade?: () => void;
  baseline?: WorkspaceBaseline | null;
  showBaseline: boolean;
  onToggleShowBaseline: () => void;
  onSaveBaseline?: () => void;
  onClearBaseline?: () => void;
  readOnly?: boolean;
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
  showCriticalPath,
  onToggleCriticalPath,
  criticalTaskCount,
  autoCascade,
  onToggleAutoCascade,
  baseline,
  showBaseline,
  onToggleShowBaseline,
  onSaveBaseline,
  onClearBaseline,
  readOnly = false,
  isMobile,
}: GanttToolbarProps) {
  const [baselineMenuOpen, setBaselineMenuOpen] = useState(false);
  const [baselineMenuPos, setBaselineMenuPos] = useState<{ top: number; right: number }>({
    top: 0,
    right: 12,
  });
  const baselineRef = useRef<HTMLDivElement | null>(null);
  const baselineMenuRef = useRef<HTMLDivElement | null>(null);

  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [mobileToolsPos, setMobileToolsPos] = useState<{ top: number; right: number }>({
    top: 0,
    right: 12,
  });
  const mobileToolsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const mobileToolsMenuRef = useRef<HTMLDivElement | null>(null);

  // Close desktop baseline menu on pointerdown outside (works reliably on iOS Safari & desktop), Escape, or resize
  useEffect(() => {
    if (!baselineMenuOpen) return;
    const handlePointerOutside = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        baselineRef.current &&
        !baselineRef.current.contains(target) &&
        (!baselineMenuRef.current || !baselineMenuRef.current.contains(target))
      ) {
        setBaselineMenuOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBaselineMenuOpen(false);
    };
    const handleResize = () => setBaselineMenuOpen(false);
    document.addEventListener('pointerdown', handlePointerOutside);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('pointerdown', handlePointerOutside);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', handleResize);
    };
  }, [baselineMenuOpen]);

  // Close mobile Tools popover on pointerdown outside, Escape, or resize
  useEffect(() => {
    if (!mobileToolsOpen) return;
    const handlePointerOutside = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        mobileToolsTriggerRef.current &&
        !mobileToolsTriggerRef.current.contains(target) &&
        (!mobileToolsMenuRef.current || !mobileToolsMenuRef.current.contains(target))
      ) {
        setMobileToolsOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileToolsOpen(false);
    };
    const handleResize = () => setMobileToolsOpen(false);
    document.addEventListener('pointerdown', handlePointerOutside);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('pointerdown', handlePointerOutside);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', handleResize);
    };
  }, [mobileToolsOpen]);

  const hasBaseline = Boolean(baseline && Object.keys(baseline.entries).length > 0);
  const baselineSavedLabel = baseline?.savedAt
    ? new Date(baseline.savedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
    : null;

  const hasActiveMobileTool =
    showCriticalPath ||
    (hasBaseline && showBaseline) ||
    showTaskDescriptions ||
    statusFilter !== 'all';

  return (
    <div className="shrink-0 border-b border-slate-200/90 dark:border-white/[0.08] bg-[#FAFBFD] dark:bg-surface-dark">
      <div className="flex items-center justify-between gap-2 px-3 md:px-4 py-2 overflow-x-auto">
        {/* Left: Progress meter + Status filter chips + Collapse all */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Tactile completion meter */}
          <div className="inline-flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg bg-white dark:bg-surface-elevated border border-slate-200/90 dark:border-white/[0.08] shadow-surface-sm">
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

          {/* Quick Status Filter Pills (Desktop xl+, moved into Tools popover on mobile/compact screens) */}
          {!isMobile && (
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
          )}

          {!isMobile && hasCollapsibleParents && (
            <button
              type="button"
              onClick={onToggleCollapseAll}
              title={allCollapsed ? 'Expand all groups' : 'Collapse all groups'}
              aria-label={allCollapsed ? 'Expand all groups' : 'Collapse all groups'}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.07] transition-colors cursor-pointer"
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
                  'relative px-2 sm:px-2.5 md:px-3 py-1 text-xs font-semibold rounded-md transition-colors duration-150 cursor-pointer',
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

        {/* Right: Desktop 1-click controls OR Mobile thumb-friendly Tools popover + Today */}
        <div className="flex items-center gap-1.5 shrink-0">
          {!isMobile ? (
            <>
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
                onClick={onToggleCriticalPath}
                aria-pressed={showCriticalPath}
                aria-label={showCriticalPath ? 'Hide critical path' : 'Highlight critical path'}
                title={
                  showCriticalPath
                    ? `Critical Path active (${criticalTaskCount} tasks) — click to turn off`
                    : `Highlight Critical Path (${criticalTaskCount} finish-driving tasks)`
                }
                className={cn(
                  'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold border transition-transform duration-75 active:scale-[0.97] cursor-pointer shadow-surface-sm',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500',
                  showCriticalPath
                    ? 'bg-rose-600 text-white border-rose-500 shadow-sm dark:bg-rose-500 dark:border-rose-400'
                    : 'border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-surface-elevated text-slate-600 hover:text-rose-600 hover:bg-rose-50/60 dark:text-slate-300 dark:hover:text-rose-400 dark:hover:bg-rose-500/10',
                )}
              >
                <Path
                  weight="duotone"
                  className={cn(
                    'w-4 h-4',
                    showCriticalPath ? 'text-white' : 'text-rose-500 dark:text-rose-400',
                  )}
                />
                <span className="hidden xl:inline">Critical</span>
              </button>

              {/* Planned Baseline Snapshot Control */}
              {(hasBaseline || (!readOnly && onSaveBaseline)) && (
                <div ref={baselineRef} className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      if (!hasBaseline && onSaveBaseline) {
                        onSaveBaseline();
                        return;
                      }
                      if (readOnly) {
                        onToggleShowBaseline();
                        return;
                      }
                      setBaselineMenuOpen((prev) => {
                        if (!prev && baselineRef.current) {
                          const rect = baselineRef.current.getBoundingClientRect();
                          setBaselineMenuPos({
                            top: rect.bottom + 6,
                            right: Math.max(12, window.innerWidth - rect.right),
                          });
                        }
                        return !prev;
                      });
                    }}
                    aria-pressed={hasBaseline ? showBaseline : undefined}
                    aria-expanded={!readOnly && hasBaseline ? baselineMenuOpen : undefined}
                    aria-label={
                      !hasBaseline
                        ? 'Save schedule baseline'
                        : showBaseline
                          ? 'Baseline options (visible)'
                          : 'Baseline options (hidden)'
                    }
                    title={
                      !hasBaseline
                        ? 'Save current schedule as Planned Baseline'
                        : `Baseline saved ${baselineSavedLabel ?? ''} — compare Planned vs. Actual`
                    }
                    className={cn(
                      'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold border transition-transform duration-75 active:scale-[0.97] cursor-pointer shadow-surface-sm',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                      hasBaseline && showBaseline
                        ? 'bg-amber-500 text-white border-amber-500 shadow-sm dark:bg-amber-500 dark:border-amber-400'
                        : 'border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-surface-elevated text-slate-600 hover:text-amber-600 hover:bg-amber-50/70 dark:text-slate-300 dark:hover:text-amber-400 dark:hover:bg-amber-500/10',
                    )}
                  >
                    <FlagBanner
                      weight="duotone"
                      className={cn(
                        'w-4 h-4',
                        hasBaseline && showBaseline
                          ? 'text-white'
                          : 'text-amber-600 dark:text-amber-400',
                      )}
                    />
                    <span className="hidden xl:inline">
                      {hasBaseline ? 'Baseline' : 'Save Baseline'}
                    </span>
                    {hasBaseline && !readOnly && (
                      <CaretDown weight="bold" className="w-3 h-3 opacity-80" />
                    )}
                  </button>

                  {typeof document !== 'undefined' &&
                    createPortal(
                      <AnimatePresence>
                        {baselineMenuOpen && hasBaseline && !readOnly && (
                          <motion.div
                            ref={baselineMenuRef}
                            role="menu"
                            style={{
                              top: `${baselineMenuPos.top}px`,
                              right: `${baselineMenuPos.right}px`,
                            }}
                            initial={{ opacity: 0, y: 6, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 4, scale: 0.97 }}
                            transition={SPRING_SNAPPY}
                            className="fixed w-52 rounded-xl border border-slate-200/90 dark:border-white/[0.12] bg-white dark:bg-surface-elevated shadow-surface-lg dark:shadow-dark-lg p-1.5 z-[60]"
                          >
                            <div className="px-2.5 py-1.5 border-b border-slate-100 dark:border-white/[0.07] mb-1">
                              <p className="text-[11px] font-semibold text-slate-900 dark:text-slate-100">
                                Planned Baseline
                              </p>
                              {baselineSavedLabel && (
                                <p className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                                  Saved {baselineSavedLabel}
                                </p>
                              )}
                            </div>

                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                onToggleShowBaseline();
                                setBaselineMenuOpen(false);
                              }}
                              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.07] cursor-pointer"
                            >
                              {showBaseline ? (
                                <>
                                  <EyeSlash weight="duotone" className="w-4 h-4 text-slate-500" />
                                  <span>Hide Ghost Bars</span>
                                </>
                              ) : (
                                <>
                                  <Eye weight="duotone" className="w-4 h-4 text-amber-500" />
                                  <span>Show Ghost Bars</span>
                                </>
                              )}
                            </button>

                            {onSaveBaseline && (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  onSaveBaseline();
                                  setBaselineMenuOpen(false);
                                }}
                                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.07] cursor-pointer"
                              >
                                <ArrowsClockwise
                                  weight="duotone"
                                  className="w-4 h-4 text-brand-600 dark:text-brand-400"
                                />
                                <span>Update to Current Dates</span>
                              </button>
                            )}

                            {onClearBaseline && (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  onClearBaseline();
                                  setBaselineMenuOpen(false);
                                }}
                                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/15 cursor-pointer"
                              >
                                <Trash weight="duotone" className="w-4 h-4" />
                                <span>Clear Baseline</span>
                              </button>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>,
                      document.body,
                    )}
                </div>
              )}

              {/* Auto-Cascade Dependencies Toggle (editable workspaces, visible from tablet md+!) */}
              {!readOnly && onToggleAutoCascade && (
                <button
                  type="button"
                  onClick={onToggleAutoCascade}
                  aria-pressed={autoCascade}
                  aria-label={
                    autoCascade
                      ? 'Disable auto-cascade dependent tasks when dragging'
                      : 'Enable auto-cascade dependent tasks when dragging'
                  }
                  title={
                    autoCascade
                      ? 'Auto-Cascade ON: dragging a blocker shifts dependent tasks automatically'
                      : 'Auto-Cascade OFF: dragging moves only the selected task'
                  }
                  className={cn(
                    'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold border transition-transform duration-75 active:scale-[0.97] cursor-pointer shadow-surface-sm',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                    autoCascade
                      ? 'bg-brand-50 text-brand-700 border-brand-200/90 hover:bg-brand-100/80 dark:bg-brand-500/15 dark:text-brand-300 dark:border-brand-400/30'
                      : 'border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-surface-elevated text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
                  )}
                >
                  <LinkSimple
                    weight="duotone"
                    className={cn(
                      'w-4 h-4',
                      autoCascade ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400',
                    )}
                  />
                  <span className="hidden xl:inline">Cascade</span>
                </button>
              )}

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
                <span className="hidden 2xl:inline">Descriptions</span>
                <span className="hidden xl:inline 2xl:hidden">Notes</span>
              </button>

              <button
                type="button"
                onClick={onAutoFit}
                aria-label="Fit timeline to screen"
                title="Auto-fit all tasks"
                className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-surface-elevated text-slate-600 hover:text-brand-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:text-brand-400 dark:hover:bg-white/[0.06] transition-colors cursor-pointer shadow-surface-sm"
              >
                <CornersOut weight="duotone" className="w-4 h-4" />
              </button>
            </>
          ) : (
            /* Mobile (< 768px): Single clean Tools button opening a spacious touch portal popover */
            <>
              <button
                ref={mobileToolsTriggerRef}
                type="button"
                onClick={() => {
                  setMobileToolsOpen((prev) => {
                    if (!prev && mobileToolsTriggerRef.current) {
                      const rect = mobileToolsTriggerRef.current.getBoundingClientRect();
                      setMobileToolsPos({
                        top: rect.bottom + 8,
                        right: Math.max(12, window.innerWidth - rect.right),
                      });
                    }
                    return !prev;
                  });
                }}
                aria-expanded={mobileToolsOpen}
                aria-label="Timeline view tools"
                className={cn(
                  'relative inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer shadow-surface-sm',
                  mobileToolsOpen || hasActiveMobileTool
                    ? 'bg-brand-50 text-brand-700 border-brand-200/90 dark:bg-brand-500/15 dark:text-brand-300 dark:border-brand-400/30'
                    : 'border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-surface-elevated text-slate-700 dark:text-slate-200',
                )}
              >
                <SlidersHorizontal weight="duotone" className="w-4 h-4" />
                <span className="hidden xs:inline">Tools</span>
                {hasActiveMobileTool && (
                  <span
                    aria-hidden="true"
                    className="w-1.5 h-1.5 rounded-full bg-brand-600 dark:bg-brand-400"
                  />
                )}
              </button>

              {typeof document !== 'undefined' &&
                createPortal(
                  <AnimatePresence>
                    {mobileToolsOpen && (
                      <motion.div
                        ref={mobileToolsMenuRef}
                        role="dialog"
                        aria-label="Timeline view tools"
                        style={{
                          top: `${mobileToolsPos.top}px`,
                          right: `${mobileToolsPos.right}px`,
                        }}
                        initial={{ opacity: 0, y: 6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.97 }}
                        transition={SPRING_SNAPPY}
                        className="fixed w-72 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-slate-200/90 dark:border-white/[0.12] bg-white dark:bg-surface-elevated shadow-surface-lg dark:shadow-dark-lg p-3 z-[60] space-y-3"
                      >
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-white/[0.07]">
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                            Timeline Tools
                          </span>
                          <button
                            type="button"
                            onClick={() => setMobileToolsOpen(false)}
                            aria-label="Close timeline tools"
                            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                          >
                            <X weight="bold" className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Status filter */}
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                            Status Filter
                          </span>
                          <div
                            role="group"
                            aria-label="Filter tasks by status"
                            className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-white/[0.06]"
                          >
                            {STATUS_FILTER_OPTIONS.map((opt) => {
                              const active = statusFilter === opt.value;
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => onStatusFilterChange(opt.value)}
                                  className={cn(
                                    'py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer',
                                    active
                                      ? 'bg-white dark:bg-surface-dark text-slate-900 dark:text-white shadow-sm'
                                      : 'text-slate-600 dark:text-slate-400',
                                  )}
                                >
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Toggles */}
                        <div className="space-y-2.5 pt-1 border-t border-slate-100 dark:border-white/[0.07]">
                          <div className="flex items-center justify-between gap-3 min-h-[36px]">
                            <div className="flex items-center gap-2 min-w-0">
                              <Path weight="duotone" className="w-4 h-4 text-rose-500 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                                  Critical Path
                                </p>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                                  {criticalTaskCount} driving{' '}
                                  {criticalTaskCount === 1 ? 'task' : 'tasks'}
                                </p>
                              </div>
                            </div>
                            <Switch
                              checked={showCriticalPath}
                              onChange={onToggleCriticalPath}
                              ariaLabel={
                                showCriticalPath ? 'Hide critical path' : 'Highlight critical path'
                              }
                            />
                          </div>

                          {!readOnly && onToggleAutoCascade && (
                            <div className="flex items-center justify-between gap-3 min-h-[36px]">
                              <div className="flex items-center gap-2 min-w-0">
                                <LinkSimple
                                  weight="duotone"
                                  className="w-4 h-4 text-brand-600 dark:text-brand-400 shrink-0"
                                />
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                                    Auto-Cascade
                                  </p>
                                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                                    Shift dependent tasks on drag
                                  </p>
                                </div>
                              </div>
                              <Switch
                                checked={autoCascade}
                                onChange={onToggleAutoCascade}
                                ariaLabel={
                                  autoCascade
                                    ? 'Disable auto-cascade dependent tasks when dragging'
                                    : 'Enable auto-cascade dependent tasks when dragging'
                                }
                              />
                            </div>
                          )}

                          <div className="flex items-center justify-between gap-3 min-h-[36px]">
                            <div className="flex items-center gap-2 min-w-0">
                              <NoteBlank
                                weight="duotone"
                                className="w-4 h-4 text-brand-600 dark:text-brand-400 shrink-0"
                              />
                              <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                                Task Descriptions
                              </p>
                            </div>
                            <Switch
                              checked={showTaskDescriptions}
                              onChange={onToggleTaskDescriptions}
                              ariaLabel={
                                showTaskDescriptions
                                  ? 'Hide task descriptions on timeline'
                                  : 'Show task descriptions on timeline'
                              }
                            />
                          </div>
                        </div>

                        {/* Planned Baseline section */}
                        {(hasBaseline || (!readOnly && onSaveBaseline)) && (
                          <div className="pt-2 border-t border-slate-100 dark:border-white/[0.07] space-y-2">
                            {!hasBaseline ? (
                              <button
                                type="button"
                                onClick={() => {
                                  onSaveBaseline?.();
                                  setMobileToolsOpen(false);
                                }}
                                className="w-full flex items-center justify-center gap-2 h-9 rounded-lg border border-amber-300/80 dark:border-amber-400/30 bg-amber-50/80 dark:bg-amber-500/15 text-xs font-semibold text-amber-800 dark:text-amber-300 cursor-pointer"
                              >
                                <FlagBanner weight="duotone" className="w-4 h-4" />
                                Save Planned Baseline
                              </button>
                            ) : (
                              <>
                                <div className="flex items-center justify-between gap-3 min-h-[36px]">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <FlagBanner
                                      weight="duotone"
                                      className="w-4 h-4 text-amber-500 shrink-0"
                                    />
                                    <div className="min-w-0">
                                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                                        Baseline Ghost Bars
                                      </p>
                                      {baselineSavedLabel && (
                                        <p className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                                          Saved {baselineSavedLabel}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <Switch
                                    checked={showBaseline}
                                    onChange={onToggleShowBaseline}
                                    ariaLabel={
                                      showBaseline ? 'Hide baseline ghost bars' : 'Show baseline ghost bars'
                                    }
                                  />
                                </div>

                                {!readOnly && (onSaveBaseline || onClearBaseline) && (
                                  <div className="grid grid-cols-2 gap-1.5">
                                    {onSaveBaseline && (
                                      <button
                                        type="button"
                                        onClick={() => onSaveBaseline()}
                                        className="flex items-center justify-center gap-1.5 h-8 rounded-lg border border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-white/[0.04] text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                                      >
                                        <ArrowsClockwise weight="duotone" className="w-3.5 h-3.5" />
                                        Update
                                      </button>
                                    )}
                                    {onClearBaseline && (
                                      <button
                                        type="button"
                                        onClick={() => onClearBaseline()}
                                        className="flex items-center justify-center gap-1.5 h-8 rounded-lg border border-rose-200/80 dark:border-rose-500/25 bg-rose-50/70 dark:bg-rose-500/10 text-[11px] font-semibold text-rose-600 dark:text-rose-400 cursor-pointer"
                                      >
                                        <Trash weight="duotone" className="w-3.5 h-3.5" />
                                        Clear
                                      </button>
                                    )}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}

                        {/* Zoom & Fit controls */}
                        <div className="pt-2 border-t border-slate-100 dark:border-white/[0.07] flex items-center justify-between gap-2">
                          <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-white/[0.06] border border-slate-200/80 dark:border-white/[0.08]">
                            <button
                              type="button"
                              onClick={onZoomOut}
                              disabled={zoom <= 0.5}
                              aria-label="Zoom out"
                              className="p-1.5 rounded-md text-slate-600 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
                            >
                              <MagnifyingGlassMinus weight="duotone" className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={onResetZoom}
                              title="Reset zoom to 100%"
                              className="px-2 py-1 font-mono text-xs font-semibold text-slate-700 dark:text-slate-200 tabular-nums cursor-pointer"
                            >
                              {Math.round(zoom * 100)}%
                            </button>
                            <button
                              type="button"
                              onClick={onZoomIn}
                              disabled={zoom >= 3}
                              aria-label="Zoom in"
                              className="p-1.5 rounded-md text-slate-600 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
                            >
                              <MagnifyingGlassPlus weight="duotone" className="w-4 h-4" />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              onAutoFit();
                              setMobileToolsOpen(false);
                            }}
                            aria-label="Fit timeline to screen"
                            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-white/[0.04] text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                          >
                            <CornersOut weight="duotone" className="w-4 h-4" />
                            Fit
                          </button>
                        </div>

                        {!readOnly && (
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center">
                            Tip: Touch &amp; hold any bar to reschedule. Pinch to zoom.
                          </p>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>,
                  document.body,
                )}
            </>
          )}

          <button
            type="button"
            onClick={onScrollToToday}
            title="Jump to Today (T)"
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100/90 border border-brand-200/90 dark:text-brand-300 dark:bg-brand-500/15 dark:hover:bg-brand-500/25 dark:border-brand-400/25 transition-colors cursor-pointer"
          >
            <CalendarBlank weight="duotone" className="w-4 h-4 text-brand-600 dark:text-brand-400" />
            <span className="hidden sm:inline">Today</span>
          </button>

          {!isMobile && (
            <button
              type="button"
              onClick={onToggleExpandedView}
              aria-label={isExpandedView ? 'Exit full-height view' : 'Enter full-height view'}
              title={isExpandedView ? 'Exit full-height capture view' : 'Full-height capture view'}
              className={cn(
                'inline-flex items-center justify-center h-8 w-8 rounded-lg border transition-colors cursor-pointer shadow-surface-sm',
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
          )}
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
