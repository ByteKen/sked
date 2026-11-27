import { memo, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowsInLineVertical,
  ArrowsOutLineVertical,
  CalendarBlank,
  CaretDown,
  CaretRight,
  Check,
  FolderSimple,
  LockSimple,
  Path,
  PencilSimple,
  Plus,
  Trash,
  WarningCircle,
} from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import type { StatusFilter } from '@/components/gantt/GanttToolbar';
import { clampDateISO, computeTaskDateBoundsMap } from '@/domain/scheduling';
import { computeTaskStats, flattenTasks, isTaskCompleted } from '@/domain/taskTree';
import {
  BOARD_COLUMN_ORDER,
  enrichTaskTreeForViews,
  extractPhaseFilterOptions,
  sortTaskItemsForList,
  TASK_STATUS_LABELS,
  type EnrichedTaskItem,
  type ListSortField,
  type SortDirection,
} from '@/domain/taskViews';
import { formatDateRange, formatISODate, getTodayLocal } from '@/domain/timeline';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { FlatTask, Task, TaskStatus, WorkspaceBaseline } from '@/types';
import { cn } from '@/utils/cn';
import { STUDIO_EASE } from '@/utils/motion';
import { getUrgencyBadge, VIEW_STATUS_STYLES } from './viewStyles';

const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'done', label: 'Done' },
];

const SORT_OPTIONS: Array<{ value: ListSortField; label: string }> = [
  { value: 'tree', label: 'Hierarchy Order' },
  { value: 'end', label: 'Due Date' },
  { value: 'start', label: 'Start Date' },
  { value: 'status', label: 'Status' },
  { value: 'progress', label: 'Progress' },
  { value: 'duration', label: 'Duration' },
  { value: 'name', label: 'Task Name' },
];

export interface TaskListViewProps {
  tasks: readonly Task[];
  selectedTaskId: number | null;
  onSelectTask: (taskId: number | null) => void;
  onTaskActivate: (task: FlatTask) => void;
  onStatusChange?: (taskId: number, status: TaskStatus) => void;
  onUpdateProgress?: (taskId: number, progress: number) => void;
  onRescheduleTask?: (taskId: number, nextStart: string, nextEnd: string, autoCascade: boolean) => void;
  onToggleCollapse?: (taskId: number) => void;
  onSetAllCollapsed?: (collapsed: boolean) => void;
  onAddSubtask?: (parentId: number) => void;
  onDeleteTask?: (taskId: number) => void;
  baseline?: WorkspaceBaseline | null;
  readOnly?: boolean;
}

export const TaskListView = memo(function TaskListView({
  tasks,
  selectedTaskId,
  onSelectTask,
  onTaskActivate,
  onStatusChange,
  onUpdateProgress,
  onRescheduleTask,
  onToggleCollapse,
  onSetAllCollapsed,
  onAddSubtask,
  onDeleteTask,
  baseline = null,
  readOnly = false,
}: TaskListViewProps) {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedPhaseId, setSelectedPhaseId] = useState<number | null>(null);
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [sortBy, setSortBy] = useState<ListSortField>('tree');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const [localCollapsed, setLocalCollapsed] = useState<Record<number, boolean>>({});
  const [editingDateTaskId, setEditingDateTaskId] = useState<number | null>(null);

  const todayISO = useMemo(() => formatISODate(getTodayLocal()), []);
  const stats = useMemo(() => computeTaskStats(tasks), [tasks]);
  const allFlatTasks = useMemo(() => flattenTasks(tasks), [tasks]);
  const taskDateBounds = useMemo(() => computeTaskDateBoundsMap(tasks), [tasks]);

  const parentIds = useMemo(
    () => allFlatTasks.filter((t) => t.hasChildren).map((t) => t.id),
    [allFlatTasks],
  );

  const allCollapsed = useMemo(() => {
    if (parentIds.length === 0) return false;
    return parentIds.every((id) => {
      if (readOnly) {
        return Object.prototype.hasOwnProperty.call(localCollapsed, id)
          ? Boolean(localCollapsed[id])
          : Boolean(allFlatTasks.find((t) => t.id === id)?.collapsed);
      }
      return Boolean(allFlatTasks.find((t) => t.id === id)?.collapsed);
    });
  }, [parentIds, readOnly, localCollapsed, allFlatTasks]);

  const isTreeOrder = sortBy === 'tree';

  const enrichedItems = useMemo(
    () =>
      enrichTaskTreeForViews(tasks, {
        todayISO,
        baseline,
        respectCollapsed: isTreeOrder,
        collapsedOverrides: readOnly ? localCollapsed : undefined,
      }),
    [tasks, todayISO, baseline, isTreeOrder, readOnly, localCollapsed],
  );

  const phaseOptions = useMemo(() => extractPhaseFilterOptions(enrichedItems), [enrichedItems]);
  const effectivePhaseId =
    selectedPhaseId !== null && phaseOptions.some((p) => p.id === selectedPhaseId)
      ? selectedPhaseId
      : null;

  const filteredItems = useMemo(() => {
    return enrichedItems.filter((item) => {
      if (statusFilter === 'done' && !isTaskCompleted(item.task)) return false;
      if (statusFilter === 'active' && isTaskCompleted(item.task)) return false;
      if (effectivePhaseId !== null && item.rootPhaseId !== effectivePhaseId) return false;
      if (onlyOverdue && item.dueUrgency !== 'overdue') return false;
      if (onlyCritical && !item.isCritical) return false;
      return true;
    });
  }, [enrichedItems, statusFilter, effectivePhaseId, onlyOverdue, onlyCritical]);

  const displayItems = useMemo(
    () => sortTaskItemsForList(filteredItems, sortBy, sortDir),
    [filteredItems, sortBy, sortDir],
  );

  const overdueCount = useMemo(
    () => enrichedItems.filter((i) => i.dueUrgency === 'overdue').length,
    [enrichedItems],
  );

  const handleToggleCollapse = (taskId: number) => {
    if (readOnly || !onToggleCollapse) {
      setLocalCollapsed((prev) => {
        const current = Object.prototype.hasOwnProperty.call(prev, taskId)
          ? Boolean(prev[taskId])
          : Boolean(allFlatTasks.find((t) => t.id === taskId)?.collapsed);
        return { ...prev, [taskId]: !current };
      });
    } else {
      onToggleCollapse(taskId);
    }
  };

  const handleToggleCollapseAll = () => {
    const next = !allCollapsed;
    if (readOnly || !onSetAllCollapsed) {
      const nextMap: Record<number, boolean> = {};
      parentIds.forEach((id) => {
        nextMap[id] = next;
      });
      setLocalCollapsed(nextMap);
    } else {
      onSetAllCollapsed(next);
    }
  };

  const handleHeaderSort = (field: ListSortField) => {
    if (sortBy === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
  };

  const isRowCollapsed = (task: FlatTask) => {
    if (readOnly && Object.prototype.hasOwnProperty.call(localCollapsed, task.id)) {
      return Boolean(localCollapsed[task.id]);
    }
    return Boolean(task.collapsed);
  };

  const renderSortIcon = (field: ListSortField) => {
    if (sortBy !== field) return null;
    return sortDir === 'asc' ? (
      <ArrowUp weight="bold" className="w-3 h-3 text-brand-600 dark:text-brand-400" />
    ) : (
      <ArrowDown weight="bold" className="w-3 h-3 text-brand-600 dark:text-brand-400" />
    );
  };

  const renderInlineDates = (item: EnrichedTaskItem) => {
    const { task, dueUrgency, daysUntilDue, slipDays } = item;
    const urgencyBadge = getUrgencyBadge(dueUrgency, daysUntilDue);
    const isEditing = !readOnly && Boolean(onRescheduleTask) && editingDateTaskId === task.id;

    if (isEditing && onRescheduleTask) {
      const bounds = taskDateBounds.get(task.id);
      const startMin = bounds?.minStart;
      const startMax =
        bounds?.maxResizeStart && (!bounds.maxEnd || bounds.maxResizeStart < bounds.maxEnd)
          ? bounds.maxResizeStart
          : bounds?.maxEnd;
      const endMin =
        bounds?.minResizeEnd && bounds.minResizeEnd > task.start
          ? bounds.minResizeEnd
          : task.start;
      const endMax = bounds?.maxEnd;

      return (
        <div
          className="flex items-center gap-1.5 flex-wrap"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="date"
            aria-label={`Start date for ${task.name}`}
            value={task.start}
            min={startMin}
            max={startMax}
            onChange={(e) => {
              const rawStart = e.target.value;
              if (!rawStart) return;
              const nextStart = clampDateISO(rawStart, startMin, startMax);
              const nextEnd = nextStart > task.end ? nextStart : task.end;
              onRescheduleTask(task.id, nextStart, nextEnd, true);
            }}
            className="h-7 py-0 px-2 rounded-md border border-brand-300 dark:border-brand-400/40 bg-white dark:bg-surface-elevated font-mono text-[11px] leading-none text-slate-800 dark:text-slate-100"
          />
          <span className="text-slate-400 text-xs">→</span>
          <input
            type="date"
            aria-label={`End date for ${task.name}`}
            value={task.end}
            min={endMin}
            max={endMax}
            onChange={(e) => {
              const rawEnd = e.target.value;
              if (!rawEnd) return;
              const nextEnd = clampDateISO(rawEnd, endMin, endMax);
              if (nextEnd < task.start) return;
              onRescheduleTask(task.id, task.start, nextEnd, true);
            }}
            className="h-7 py-0 px-2 rounded-md border border-brand-300 dark:border-brand-400/40 bg-white dark:bg-surface-elevated font-mono text-[11px] leading-none text-slate-800 dark:text-slate-100"
          />
          <button
            type="button"
            onClick={() => setEditingDateTaskId(null)}
            className="px-2 h-7 rounded-md text-[11px] font-semibold bg-brand-600 text-white cursor-pointer"
          >
            Done
          </button>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          disabled={readOnly || !onRescheduleTask}
          onClick={(e) => {
            if (readOnly || !onRescheduleTask) return;
            e.stopPropagation();
            setEditingDateTaskId(task.id);
          }}
          title={readOnly ? undefined : 'Click to edit schedule dates'}
          className={cn(
            'inline-flex items-center gap-1 font-mono text-[11px] text-slate-600 dark:text-slate-300 rounded-md px-1.5 py-0.5 -mx-1.5 transition-colors',
            !readOnly &&
              onRescheduleTask &&
              'hover:bg-slate-100 dark:hover:bg-white/[0.08] hover:text-brand-600 dark:hover:text-brand-400 cursor-pointer',
          )}
        >
          <CalendarBlank weight="duotone" className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>{formatDateRange(task.start, task.end)}</span>
        </button>

        {urgencyBadge && (
          <span
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border font-mono text-[10px] font-semibold tabular-nums',
              urgencyBadge.className,
            )}
          >
            {urgencyBadge.label}
          </span>
        )}

        {slipDays !== null && slipDays !== 0 && (
          <span
            className={cn(
              'font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-md tabular-nums',
              slipDays > 0
                ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
            )}
          >
            {slipDays > 0 ? `+${slipDays}d` : `${slipDays}d`}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="relative isolate flex flex-col h-full bg-white dark:bg-surface-dark border border-slate-300/80 dark:border-white/10 rounded-none md:rounded-2xl overflow-hidden shadow-surface-md dark:shadow-dark-md">
      {/* List Toolbar */}
      <div className="shrink-0 border-b border-slate-200/90 dark:border-white/[0.08] bg-[#FAFBFD] dark:bg-surface-dark px-3 md:px-4 py-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Completion Pill */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-surface-elevated border border-slate-200/90 dark:border-white/[0.08] shadow-surface-sm">
              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {displayItems.length} {displayItems.length === 1 ? 'task' : 'tasks'}
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

            {/* Status Filter Chips */}
            <div
              role="group"
              aria-label="Filter list by status"
              className="inline-flex items-center p-0.5 rounded-lg bg-slate-200/60 dark:bg-white/[0.05] border border-slate-200/80 dark:border-white/[0.08]"
            >
              {STATUS_FILTER_OPTIONS.map((opt) => {
                const active = statusFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStatusFilter(opt.value)}
                    className={cn(
                      'px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer',
                      active
                        ? 'bg-white dark:bg-surface-elevated text-slate-900 dark:text-white shadow-surface-sm'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {/* Phase Filter */}
            {phaseOptions.length > 1 && (
              <select
                aria-label="Filter list by phase"
                value={effectivePhaseId ?? ''}
                onChange={(e) => setSelectedPhaseId(e.target.value ? Number(e.target.value) : null)}
                className="h-8 py-0 pl-2.5 pr-8 bg-[right_0.4rem_center] rounded-lg border border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-surface-elevated text-xs font-semibold leading-none text-slate-700 dark:text-slate-200 shadow-surface-sm focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer max-w-[165px]"
              >
                <option value="">All Phases</option>
                {phaseOptions.map((phase) => (
                  <option key={phase.id} value={phase.id}>
                    {phase.name}
                  </option>
                ))}
              </select>
            )}

            {overdueCount > 0 && (
              <button
                type="button"
                onClick={() => setOnlyOverdue((v) => !v)}
                aria-pressed={onlyOverdue}
                className={cn(
                  'inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer shadow-surface-sm',
                  onlyOverdue
                    ? 'bg-rose-600 text-white border-rose-500'
                    : 'border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-surface-elevated text-slate-600 hover:text-rose-600 dark:text-slate-300',
                )}
              >
                <WarningCircle weight="duotone" className="w-3.5 h-3.5" />
                <span>Overdue</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setOnlyCritical((v) => !v)}
              aria-pressed={onlyCritical}
              className={cn(
                'inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer shadow-surface-sm',
                onlyCritical
                  ? 'bg-rose-600 text-white border-rose-500'
                  : 'border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-surface-elevated text-slate-600 hover:text-rose-600 dark:text-slate-300',
              )}
            >
              <Path weight="duotone" className="w-3.5 h-3.5" />
              <span>Critical</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {isTreeOrder && parentIds.length > 0 && (
              <button
                type="button"
                onClick={handleToggleCollapseAll}
                aria-label={allCollapsed ? 'Expand all groups' : 'Collapse all groups'}
                className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold border border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-surface-elevated text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer shadow-surface-sm"
              >
                {allCollapsed ? (
                  <>
                    <ArrowsOutLineVertical weight="duotone" className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                    <span className="hidden sm:inline">Expand all</span>
                  </>
                ) : (
                  <>
                    <ArrowsInLineVertical weight="duotone" className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                    <span className="hidden sm:inline">Collapse all</span>
                  </>
                )}
              </button>
            )}

            <select
              aria-label="Sort tasks by"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as ListSortField)}
              className="h-8 py-0 pl-2.5 pr-8 bg-[right_0.4rem_center] rounded-lg border border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-surface-elevated text-xs font-semibold leading-none text-slate-700 dark:text-slate-200 shadow-surface-sm focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  Sort: {opt.label}
                </option>
              ))}
            </select>

            {sortBy !== 'tree' && (
              <button
                type="button"
                onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                aria-label={`Sort direction: ${sortDir === 'asc' ? 'ascending' : 'descending'}`}
                title={sortDir === 'asc' ? 'Ascending — click to reverse' : 'Descending — click to reverse'}
                className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-surface-elevated text-slate-600 dark:text-slate-300 hover:text-brand-600 cursor-pointer shadow-surface-sm"
              >
                {sortDir === 'asc' ? (
                  <ArrowUp weight="bold" className="w-3.5 h-3.5" />
                ) : (
                  <ArrowDown weight="bold" className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Empty Filter State */}
      {displayItems.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-8 text-center">
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              No tasks match the active filters
            </p>
            <button
              type="button"
              onClick={() => {
                setStatusFilter('all');
                setSelectedPhaseId(null);
                setOnlyOverdue(false);
                setOnlyCritical(false);
              }}
              className="mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-300 cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        </div>
      ) : isMobile ? (
        /* Mobile Responsive Card List (< 768px) — zero horizontal scroll */
        <div className="flex-1 min-h-0 overflow-y-auto p-3 pb-24 space-y-2.5">
          {displayItems.map((item) => {
            const { task, status, parentName, durationDays, isCritical } = item;
            const isCompleted = status === 'completed';
            const collapsed = isRowCollapsed(task);

            return (
              <div
                key={task.id}
                data-testid={`list-row-${task.id}`}
                onClick={() => {
                  onSelectTask(task.id);
                  onTaskActivate(task);
                }}
                style={{
                  marginLeft: isTreeOrder && task.level > 0 ? `${Math.min(task.level, 3) * 14}px` : undefined,
                }}
                className={cn(
                  'rounded-xl border p-3.5 bg-white dark:bg-surface-elevated transition-colors cursor-pointer',
                  isTreeOrder && task.level > 0 && 'border-l-2 border-l-brand-400/60',
                  selectedTaskId === task.id
                    ? 'border-brand-400 dark:border-brand-400/60'
                    : 'border-slate-200/90 dark:border-white/[0.08] shadow-surface-sm',
                )}
              >
                <div className="flex items-start gap-2.5">
                  {isTreeOrder && task.hasChildren && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleCollapse(task.id);
                      }}
                      aria-label={collapsed ? `Expand ${task.name}` : `Collapse ${task.name}`}
                      className="mt-0.5 p-0.5 rounded text-slate-500 dark:text-slate-400 cursor-pointer"
                    >
                      {collapsed ? (
                        <CaretRight weight="bold" className="w-4 h-4" />
                      ) : (
                        <CaretDown weight="bold" className="w-4 h-4" />
                      )}
                    </button>
                  )}

                  {!readOnly && onStatusChange && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onStatusChange(task.id, isCompleted ? 'not-started' : 'completed');
                      }}
                      aria-label={isCompleted ? `Reopen ${task.name}` : `Mark ${task.name} complete`}
                      className={cn(
                        'mt-0.5 w-4 h-4 rounded-md border flex items-center justify-center shrink-0 cursor-pointer',
                        isCompleted
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'border-slate-300 dark:border-white/25',
                      )}
                    >
                      {isCompleted && <Check weight="bold" className="w-3 h-3" />}
                    </button>
                  )}

                  <div className="flex-1 min-w-0">
                    {!isTreeOrder && parentName && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500 mb-0.5">
                        <FolderSimple weight="duotone" className="w-3 h-3 text-brand-500" />
                        {parentName}
                      </span>
                    )}
                    <p
                      className={cn(
                        'text-[13px] font-semibold leading-snug',
                        isCompleted
                          ? 'line-through text-slate-400 dark:text-slate-500'
                          : 'text-slate-900 dark:text-slate-100',
                      )}
                    >
                      {task.name}
                    </p>
                  </div>

                  {isCritical && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-rose-50 dark:bg-rose-500/15 text-[10px] font-semibold text-rose-700 dark:text-rose-300 shrink-0">
                      <Path weight="duotone" className="w-3 h-3" />
                      Critical
                    </span>
                  )}
                </div>

                {/* Dates + duration */}
                <div className="mt-2.5 flex items-center justify-between gap-2 flex-wrap">
                  {renderInlineDates(item)}
                  <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                    {durationDays}d · {task.progress}%
                  </span>
                </div>

                {/* Progress bar */}
                <div className="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-white/[0.08] overflow-hidden">
                  <div
                    style={{ width: `${task.progress}%` }}
                    className={cn('h-full rounded-full', VIEW_STATUS_STYLES[status].progressBar)}
                  />
                </div>

                {/* Inline status select + quick actions */}
                <div
                  className="mt-2.5 pt-2 border-t border-slate-100 dark:border-white/[0.06] flex items-center justify-between gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  {!readOnly && onStatusChange ? (
                    <select
                      aria-label={`Status for ${task.name}`}
                      value={status}
                      onChange={(e) => onStatusChange(task.id, e.target.value as TaskStatus)}
                      className={cn(
                        'h-7 py-0 pl-2.5 pr-7 bg-[right_0.35rem_center] rounded-lg border text-[11px] font-semibold leading-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500',
                        VIEW_STATUS_STYLES[status].selectBg,
                      )}
                    >
                      {BOARD_COLUMN_ORDER.map((colStatus) => (
                        <option
                          key={colStatus}
                          value={colStatus}
                          className="bg-white text-slate-900 dark:bg-surface-elevated dark:text-slate-100"
                        >
                          {TASK_STATUS_LABELS[colStatus]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-semibold',
                        VIEW_STATUS_STYLES[status].pill,
                      )}
                    >
                      <span className={cn('w-1.5 h-1.5 rounded-full', VIEW_STATUS_STYLES[status].dot)} />
                      {TASK_STATUS_LABELS[status]}
                    </span>
                  )}

                  {!readOnly && (
                    <div className="flex items-center gap-1">
                      {onAddSubtask && (
                        <button
                          type="button"
                          onClick={() => onAddSubtask(task.id)}
                          aria-label={`Add subtask to ${task.name}`}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-brand-600 hover:bg-slate-100 dark:hover:bg-white/[0.08] cursor-pointer"
                        >
                          <Plus weight="bold" className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onTaskActivate(task)}
                        aria-label={`Edit ${task.name}`}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-brand-600 hover:bg-slate-100 dark:hover:bg-white/[0.08] cursor-pointer"
                      >
                        <PencilSimple weight="duotone" className="w-3.5 h-3.5" />
                      </button>
                      {onDeleteTask && (
                        <button
                          type="button"
                          onClick={() => onDeleteTask(task.id)}
                          aria-label={`Delete ${task.name}`}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/15 cursor-pointer"
                        >
                          <Trash weight="duotone" className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Desktop & Tablet Sticky-Header Studio Table */
        <div className="flex-1 min-h-0 overflow-auto pb-24">
          <table className="w-full border-collapse text-left min-w-[740px]">
            <thead className="sticky top-0 z-20 bg-[#FAFBFD]/95 dark:bg-surface-dark/95 backdrop-blur-sm border-b border-slate-200/90 dark:border-white/[0.08]">
              <tr className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                <th className="py-2.5 pl-4 pr-3 w-[38%]">
                  <button
                    type="button"
                    onClick={() => handleHeaderSort('name')}
                    className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  >
                    Task {renderSortIcon('name')}
                  </button>
                </th>
                <th className="py-2.5 px-3 w-[15%]">
                  <button
                    type="button"
                    onClick={() => handleHeaderSort('status')}
                    className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  >
                    Status {renderSortIcon('status')}
                  </button>
                </th>
                <th className="py-2.5 px-3 w-[23%]">
                  <button
                    type="button"
                    onClick={() => handleHeaderSort('end')}
                    className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  >
                    Schedule {renderSortIcon('end')}
                  </button>
                </th>
                <th className="py-2.5 px-3 w-[8%]">
                  <button
                    type="button"
                    onClick={() => handleHeaderSort('duration')}
                    className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  >
                    Days {renderSortIcon('duration')}
                  </button>
                </th>
                <th className="py-2.5 px-3 w-[11%]">
                  <button
                    type="button"
                    onClick={() => handleHeaderSort('progress')}
                    className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  >
                    Progress {renderSortIcon('progress')}
                  </button>
                </th>
                {!readOnly && <th className="py-2.5 pl-2 pr-4 w-[5%] text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
              {displayItems.map((item) => {
                const { task, status, parentName, durationDays, isCritical } = item;
                const isCompleted = status === 'completed';
                const collapsed = isRowCollapsed(task);
                const isSelected = selectedTaskId === task.id;

                return (
                  <tr
                    key={task.id}
                    data-testid={`list-row-${task.id}`}
                    onClick={() => {
                      onSelectTask(task.id);
                      onTaskActivate(task);
                    }}
                    className={cn(
                      'group transition-colors cursor-pointer',
                      isSelected
                        ? 'bg-brand-50/70 dark:bg-brand-500/10'
                        : 'hover:bg-slate-50/90 dark:hover:bg-white/[0.03]',
                    )}
                  >
                    {/* Task Column */}
                    <td className="py-2.5 pl-4 pr-3">
                      <div
                        className="flex items-center gap-2 min-w-0"
                        style={{
                          paddingLeft: isTreeOrder ? `${Math.min(task.level, 4) * 20}px` : undefined,
                        }}
                      >
                        {isTreeOrder && task.hasChildren ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleCollapse(task.id);
                            }}
                            aria-label={collapsed ? `Expand ${task.name}` : `Collapse ${task.name}`}
                            className="p-0.5 rounded text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer shrink-0"
                          >
                            {collapsed ? (
                              <CaretRight weight="bold" className="w-3.5 h-3.5" />
                            ) : (
                              <CaretDown weight="bold" className="w-3.5 h-3.5" />
                            )}
                          </button>
                        ) : isTreeOrder ? (
                          <span className="w-4 shrink-0" />
                        ) : null}

                        {!readOnly && onStatusChange && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onStatusChange(task.id, isCompleted ? 'not-started' : 'completed');
                            }}
                            aria-label={
                              isCompleted ? `Reopen ${task.name}` : `Mark ${task.name} complete`
                            }
                            className={cn(
                              'w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors cursor-pointer',
                              isCompleted
                                ? 'bg-emerald-500 border-emerald-500 text-white'
                                : 'border-slate-300 dark:border-white/25 hover:border-brand-500',
                            )}
                          >
                            {isCompleted && <Check weight="bold" className="w-3 h-3" />}
                          </button>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className={cn(
                                'text-[13px] truncate',
                                task.hasChildren ? 'font-bold' : 'font-semibold',
                                isCompleted
                                  ? 'line-through text-slate-400 dark:text-slate-500'
                                  : 'text-slate-900 dark:text-slate-100',
                              )}
                            >
                              {task.name}
                            </span>
                            {isCritical && (
                              <span
                                title="Critical Path task"
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-500/15 text-[10px] font-semibold text-rose-700 dark:text-rose-300 shrink-0"
                              >
                                <Path weight="duotone" className="w-3 h-3" />
                                Critical
                              </span>
                            )}
                            {item.blockedByIncompleteCount > 0 && !isCompleted && (
                              <span
                                title={`Waiting on ${item.blockedByIncompleteCount} incomplete dependencies`}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-500/15 text-[10px] font-semibold text-amber-700 dark:text-amber-300 shrink-0"
                              >
                                <LockSimple weight="duotone" className="w-3 h-3" />
                                Blocked
                              </span>
                            )}
                          </div>
                          {!isTreeOrder && parentName && (
                            <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                              {parentName}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Status Column */}
                    <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                      {!readOnly && onStatusChange ? (
                        <select
                          aria-label={`Status for ${task.name}`}
                          value={status}
                          onChange={(e) => onStatusChange(task.id, e.target.value as TaskStatus)}
                          className={cn(
                            'h-7 py-0 pl-2.5 pr-7 bg-[right_0.35rem_center] rounded-lg border text-[11px] font-semibold leading-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500',
                            VIEW_STATUS_STYLES[status].selectBg,
                          )}
                        >
                          {BOARD_COLUMN_ORDER.map((colStatus) => (
                            <option
                              key={colStatus}
                              value={colStatus}
                              className="bg-white text-slate-900 dark:bg-surface-elevated dark:text-slate-100"
                            >
                              {TASK_STATUS_LABELS[colStatus]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap',
                            VIEW_STATUS_STYLES[status].pill,
                          )}
                        >
                          <span className={cn('w-1.5 h-1.5 rounded-full', VIEW_STATUS_STYLES[status].dot)} />
                          {TASK_STATUS_LABELS[status]}
                        </span>
                      )}
                    </td>

                    {/* Schedule Column */}
                    <td className="py-2.5 px-3">{renderInlineDates(item)}</td>

                    {/* Duration Column */}
                    <td className="py-2.5 px-3 font-mono text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                      {durationDays}d
                    </td>

                    {/* Progress Column */}
                    <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        {!readOnly && onUpdateProgress && !task.hasChildren ? (
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            aria-label={`Progress for ${task.name}`}
                            value={task.progress}
                            onChange={(e) => onUpdateProgress(task.id, Number(e.target.value))}
                            className="w-16 accent-brand-600 dark:accent-brand-500 cursor-pointer"
                          />
                        ) : (
                          <div className="w-16 h-1.5 rounded-full bg-slate-200/80 dark:bg-white/10 overflow-hidden">
                            <div
                              style={{ width: `${task.progress}%` }}
                              className={cn('h-full rounded-full', VIEW_STATUS_STYLES[status].progressBar)}
                            />
                          </div>
                        )}
                        <span className="font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-200 tabular-nums w-8 text-right">
                          {task.progress}%
                        </span>
                      </div>
                    </td>

                    {/* Quick Actions */}
                    {!readOnly && (
                      <td className="py-2.5 pl-2 pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center justify-end gap-0.5 opacity-80 group-hover:opacity-100">
                          {onAddSubtask && (
                            <button
                              type="button"
                              onClick={() => onAddSubtask(task.id)}
                              aria-label={`Add subtask to ${task.name}`}
                              title="Add subtask"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-slate-100 dark:hover:text-brand-400 dark:hover:bg-white/[0.08] cursor-pointer"
                            >
                              <Plus weight="bold" className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onTaskActivate(task)}
                            aria-label={`Edit ${task.name}`}
                            title="Edit task"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-slate-100 dark:hover:text-brand-400 dark:hover:bg-white/[0.08] cursor-pointer"
                          >
                            <PencilSimple weight="duotone" className="w-3.5 h-3.5" />
                          </button>
                          {onDeleteTask && (
                            <button
                              type="button"
                              onClick={() => onDeleteTask(task.id)}
                              aria-label={`Delete ${task.name}`}
                              title="Delete task"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-500/15 cursor-pointer"
                            >
                              <Trash weight="duotone" className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});
