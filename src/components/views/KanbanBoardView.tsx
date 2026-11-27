import { memo, useMemo, useState } from 'react';
import {
  CalendarBlank,
  Check,
  Clock,
  DotsSixVertical,
  FolderSimple,
  LockSimple,
  Path,
  PencilSimple,
  Plus,
  Trash,
  WarningCircle,
} from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { computeTaskStats } from '@/domain/taskTree';
import {
  BOARD_COLUMN_ORDER,
  enrichTaskTreeForViews,
  extractPhaseFilterOptions,
  groupTasksForBoard,
  TASK_STATUS_LABELS,
  TASK_STATUS_SHORT_LABELS,
  type EnrichedTaskItem,
} from '@/domain/taskViews';
import { formatDateRange, formatISODate, getTodayLocal } from '@/domain/timeline';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { FlatTask, Task, TaskStatus, WorkspaceBaseline } from '@/types';
import { cn } from '@/utils/cn';
import { STUDIO_EASE } from '@/utils/motion';
import { getUrgencyBadge, VIEW_STATUS_STYLES } from './viewStyles';

export interface KanbanBoardViewProps {
  tasks: readonly Task[];
  selectedTaskId: number | null;
  onSelectTask: (taskId: number | null) => void;
  onTaskActivate: (task: FlatTask) => void;
  onStatusChange?: (taskId: number, status: TaskStatus) => void;
  onAddTaskWithStatus?: (status: TaskStatus) => void;
  onDeleteTask?: (taskId: number) => void;
  baseline?: WorkspaceBaseline | null;
  readOnly?: boolean;
}

export const KanbanBoardView = memo(function KanbanBoardView({
  tasks,
  selectedTaskId,
  onSelectTask,
  onTaskActivate,
  onStatusChange,
  onAddTaskWithStatus,
  onDeleteTask,
  baseline = null,
  readOnly = false,
}: KanbanBoardViewProps) {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [selectedPhaseId, setSelectedPhaseId] = useState<number | null>(null);
  const [includePhases, setIncludePhases] = useState(false);
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [mobileActiveColumn, setMobileActiveColumn] = useState<TaskStatus>('working');
  const [draggingTaskId, setDraggingTaskId] = useState<number | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);

  const todayISO = useMemo(() => formatISODate(getTodayLocal()), []);
  const stats = useMemo(() => computeTaskStats(tasks), [tasks]);

  const allEnriched = useMemo(
    () => enrichTaskTreeForViews(tasks, { todayISO, baseline }),
    [tasks, todayISO, baseline],
  );

  const hasAnyPhases = useMemo(
    () => allEnriched.some((item) => item.task.hasChildren),
    [allEnriched],
  );

  const phaseOptions = useMemo(() => extractPhaseFilterOptions(allEnriched), [allEnriched]);

  const effectivePhaseId =
    selectedPhaseId !== null && phaseOptions.some((p) => p.id === selectedPhaseId)
      ? selectedPhaseId
      : null;

  const filteredItems = useMemo(() => {
    return allEnriched.filter((item) => {
      if (onlyOverdue && item.dueUrgency !== 'overdue') return false;
      if (onlyCritical && !item.isCritical) return false;
      return true;
    });
  }, [allEnriched, onlyOverdue, onlyCritical]);

  const columns = useMemo(
    () =>
      groupTasksForBoard(filteredItems, {
        includePhases,
        phaseId: effectivePhaseId,
      }),
    [filteredItems, includePhases, effectivePhaseId],
  );

  const overdueCount = useMemo(
    () =>
      allEnriched.filter((i) => (!includePhases ? !i.task.hasChildren : true) && i.dueUrgency === 'overdue')
        .length,
    [allEnriched, includePhases],
  );

  const criticalCount = useMemo(
    () =>
      allEnriched.filter((i) => (!includePhases ? !i.task.hasChildren : true) && i.isCritical).length,
    [allEnriched, includePhases],
  );

  const totalBoardCards = useMemo(
    () => BOARD_COLUMN_ORDER.reduce((sum, col) => sum + columns[col].length, 0),
    [columns],
  );

  const canMutate = !readOnly && Boolean(onStatusChange);

  const handleDropOnColumn = (targetColumn: TaskStatus, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverColumn(null);
    if (!canMutate || !onStatusChange) return;

    const rawId = e.dataTransfer.getData('text/plain');
    const taskId = draggingTaskId ?? (rawId ? Number(rawId) : NaN);
    setDraggingTaskId(null);

    if (!Number.isFinite(taskId)) return;
    const item = allEnriched.find((i) => i.task.id === taskId);
    if (!item || item.status === targetColumn) return;
    onStatusChange(taskId, targetColumn);
  };

  const renderCard = (item: EnrichedTaskItem) => {
    const { task, status, parentName, durationDays, dueUrgency, daysUntilDue, isCritical, slipDays } =
      item;
    const urgencyBadge = getUrgencyBadge(dueUrgency, daysUntilDue);
    const isSelected = selectedTaskId === task.id;
    const isDragging = draggingTaskId === task.id;
    const isCompleted = status === 'completed';

    return (
      <div
        key={task.id}
        data-testid={`board-card-${task.id}`}
        draggable={canMutate}
        onDragStart={(e) => {
          if (!canMutate) return;
          setDraggingTaskId(task.id);
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(task.id));
        }}
        onDragEnd={() => {
          setDraggingTaskId(null);
          setDragOverColumn(null);
        }}
        onClick={() => {
          onSelectTask(task.id);
          onTaskActivate(task);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectTask(task.id);
            onTaskActivate(task);
          }
        }}
        className={cn(
          'group rounded-xl border p-3.5 bg-white dark:bg-surface-elevated transition-all duration-150 text-left cursor-pointer',
          'hover:border-brand-300/90 dark:hover:border-brand-400/35 hover:shadow-surface-md',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
          isSelected
            ? 'border-brand-400 dark:border-brand-400/60 ring-2 ring-brand-500/20'
            : 'border-slate-200/90 dark:border-white/[0.08] shadow-surface-sm',
          isDragging && 'opacity-50 scale-[0.98]',
          isCompleted && 'opacity-85',
        )}
      >
        {/* Top meta badges */}
        {(parentName || task.hasChildren || isCritical || item.blockedByIncompleteCount > 0 || (slipDays !== null && slipDays !== 0)) && (
          <div className="flex items-center flex-wrap gap-1.5 mb-2">
            {parentName && (
              <span className="inline-flex items-center gap-1 max-w-[165px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/[0.07] text-[10px] font-semibold text-slate-600 dark:text-slate-300 truncate">
                <FolderSimple weight="duotone" className="w-3 h-3 text-brand-500 shrink-0" />
                <span className="truncate">{parentName}</span>
              </span>
            )}
            {task.hasChildren && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 dark:bg-brand-500/15 text-[10px] font-semibold text-brand-700 dark:text-brand-300">
                Phase · {task.children?.length ?? 0}
              </span>
            )}
            {isCritical && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-50 dark:bg-rose-500/15 text-[10px] font-semibold text-rose-700 dark:text-rose-300">
                <Path weight="duotone" className="w-3 h-3" />
                Critical
              </span>
            )}
            {item.blockedByIncompleteCount > 0 && !isCompleted && (
              <span
                title={`Waiting on ${item.blockedByIncompleteCount} incomplete ${item.blockedByIncompleteCount === 1 ? 'dependency' : 'dependencies'}`}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-500/15 text-[10px] font-semibold text-amber-700 dark:text-amber-300"
              >
                <LockSimple weight="duotone" className="w-3 h-3" />
                Blocked
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
        )}

        {/* Title row with 1-tap complete checkbox + drag grip */}
        <div className="flex items-start gap-2.5">
          {canMutate && onStatusChange && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStatusChange(task.id, isCompleted ? 'not-started' : 'completed');
              }}
              aria-label={isCompleted ? `Reopen ${task.name}` : `Mark ${task.name} complete`}
              className={cn(
                'mt-0.5 w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors cursor-pointer',
                isCompleted
                  ? 'bg-emerald-500 border-emerald-500 text-white'
                  : 'border-slate-300 dark:border-white/25 hover:border-brand-500',
              )}
            >
              {isCompleted && <Check weight="bold" className="w-3 h-3" />}
            </button>
          )}

          <p
            className={cn(
              'flex-1 text-[13px] font-semibold leading-snug line-clamp-2',
              isCompleted
                ? 'line-through text-slate-400 dark:text-slate-500'
                : 'text-slate-900 dark:text-slate-100',
            )}
          >
            {task.name}
          </p>

          {canMutate && !isMobile && (
            <DotsSixVertical
              weight="bold"
              aria-hidden="true"
              className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-400 shrink-0 mt-0.5 cursor-grab"
            />
          )}
        </div>

        {/* Optional description snippet */}
        {task.description && (
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
            {task.description}
          </p>
        )}

        {/* Progress bar for partially completed tasks */}
        {task.progress > 0 && task.progress < 100 && (
          <div className="mt-2.5 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-white/[0.08] overflow-hidden">
              <div
                style={{ width: `${task.progress}%` }}
                className={cn('h-full rounded-full', VIEW_STATUS_STYLES[status].progressBar)}
              />
            </div>
            <span className="font-mono text-[10px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
              {task.progress}%
            </span>
          </div>
        )}

        {/* Schedule + Urgency row */}
        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-white/[0.06] flex items-center justify-between gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
            <CalendarBlank weight="duotone" className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>{formatDateRange(task.start, task.end)}</span>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <span className="inline-flex items-center gap-0.5 tabular-nums">
              <Clock weight="duotone" className="w-3 h-3" />
              {durationDays}d
            </span>
          </div>

          {urgencyBadge && (
            <span
              className={cn(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border font-mono text-[10px] font-semibold tabular-nums',
                urgencyBadge.className,
              )}
            >
              {dueUrgency === 'overdue' && <WarningCircle weight="fill" className="w-3 h-3" />}
              {urgencyBadge.label}
            </span>
          )}
        </div>

        {/* Cross-platform status move dropdown + quick actions (ensures full touch/mobile/keyboard parity!) */}
        {canMutate && onStatusChange && (
          <div
            className="mt-2.5 flex items-center justify-between gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <select
              aria-label={`Move ${task.name} to status`}
              value={status}
              onChange={(e) => onStatusChange(task.id, e.target.value as TaskStatus)}
              className={cn(
                'h-7 py-0 pl-2.5 pr-7 bg-[right_0.35rem_center] rounded-lg border text-[11px] font-semibold leading-none transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500',
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

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onTaskActivate(task)}
                aria-label={`Edit ${task.name}`}
                title="Edit task"
                className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-slate-100 dark:hover:text-brand-400 dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
              >
                <PencilSimple weight="duotone" className="w-3.5 h-3.5" />
              </button>
              {onDeleteTask && (
                <button
                  type="button"
                  onClick={() => onDeleteTask(task.id)}
                  aria-label={`Delete ${task.name}`}
                  title="Delete task"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-500/15 transition-colors cursor-pointer"
                >
                  <Trash weight="duotone" className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderColumn = (colStatus: TaskStatus) => {
    const colItems = columns[colStatus];
    const styles = VIEW_STATUS_STYLES[colStatus];
    const isDropTarget = dragOverColumn === colStatus;

    return (
      <section
        key={colStatus}
        aria-label={`${TASK_STATUS_LABELS[colStatus]} column`}
        data-testid={`board-column-${colStatus}`}
        onDragOver={(e) => {
          if (!canMutate) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (dragOverColumn !== colStatus) setDragOverColumn(colStatus);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setDragOverColumn((prev) => (prev === colStatus ? null : prev));
          }
        }}
        onDrop={(e) => handleDropOnColumn(colStatus, e)}
        className={cn(
          'flex flex-col rounded-2xl border border-slate-200/85 dark:border-white/[0.08] transition-all duration-150 min-h-0',
          styles.columnTint,
          isDropTarget && styles.columnDropRing,
        )}
      >
        {/* Column Header */}
        <div className="shrink-0 flex items-center justify-between gap-2 px-3.5 py-3 border-b border-slate-200/70 dark:border-white/[0.06]">
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', styles.dot)} />
            <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
              {TASK_STATUS_LABELS[colStatus]}
            </h2>
          </div>
          <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/90 dark:bg-white/[0.07] text-slate-600 dark:text-slate-300 border border-slate-200/70 dark:border-white/[0.08] tabular-nums">
            {colItems.length}
          </span>
        </div>

        {/* Column Cards */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
          {colItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300/80 dark:border-white/[0.1] px-4 py-8 text-center">
              <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
                {canMutate ? 'Drop a card here or add a task' : 'No tasks in this column'}
              </p>
            </div>
          ) : (
            colItems.map(renderCard)
          )}

          {!readOnly && onAddTaskWithStatus && (
            <button
              type="button"
              onClick={() => onAddTaskWithStatus(colStatus)}
              className="w-full flex items-center justify-center gap-1.5 h-9 rounded-xl border border-dashed border-slate-300/90 dark:border-white/[0.12] text-xs font-semibold text-slate-500 hover:text-brand-600 hover:border-brand-400 hover:bg-white/80 dark:text-slate-400 dark:hover:text-brand-400 dark:hover:bg-white/[0.04] transition-colors cursor-pointer"
            >
              <Plus weight="bold" className="w-3.5 h-3.5" />
              Add task
            </button>
          )}
        </div>
      </section>
    );
  };

  return (
    <div className="relative isolate flex flex-col h-full bg-white dark:bg-surface-dark border border-slate-300/80 dark:border-white/10 rounded-none md:rounded-2xl overflow-hidden shadow-surface-md dark:shadow-dark-md">
      {/* Board Toolbar */}
      <div className="shrink-0 border-b border-slate-200/90 dark:border-white/[0.08] bg-[#FAFBFD] dark:bg-surface-dark px-3 md:px-4 py-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Completion Pill */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-surface-elevated border border-slate-200/90 dark:border-white/[0.08] shadow-surface-sm">
              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {totalBoardCards} {totalBoardCards === 1 ? 'card' : 'cards'}
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

            {/* Phase Filter */}
            {phaseOptions.length > 1 && (
              <select
                aria-label="Filter board by phase"
                value={effectivePhaseId ?? ''}
                onChange={(e) => setSelectedPhaseId(e.target.value ? Number(e.target.value) : null)}
                className="h-8 py-0 pl-2.5 pr-8 bg-[right_0.4rem_center] rounded-lg border border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-surface-elevated text-xs font-semibold leading-none text-slate-700 dark:text-slate-200 shadow-surface-sm focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer max-w-[175px]"
              >
                <option value="">All Phases</option>
                {phaseOptions.map((phase) => (
                  <option key={phase.id} value={phase.id}>
                    {phase.name}
                  </option>
                ))}
              </select>
            )}

            {/* Quick Overdue Filter */}
            {overdueCount > 0 && (
              <button
                type="button"
                onClick={() => setOnlyOverdue((v) => !v)}
                aria-pressed={onlyOverdue}
                className={cn(
                  'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer shadow-surface-sm',
                  onlyOverdue
                    ? 'bg-rose-600 text-white border-rose-500'
                    : 'border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-surface-elevated text-slate-600 hover:text-rose-600 dark:text-slate-300 dark:hover:text-rose-400',
                )}
              >
                <WarningCircle weight="duotone" className="w-3.5 h-3.5" />
                <span>Overdue ({overdueCount})</span>
              </button>
            )}

            {/* Quick Critical Path Filter */}
            {criticalCount > 0 && (
              <button
                type="button"
                onClick={() => setOnlyCritical((v) => !v)}
                aria-pressed={onlyCritical}
                className={cn(
                  'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer shadow-surface-sm',
                  onlyCritical
                    ? 'bg-rose-600 text-white border-rose-500'
                    : 'border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-surface-elevated text-slate-600 hover:text-rose-600 dark:text-slate-300 dark:hover:text-rose-400',
                )}
              >
                <Path weight="duotone" className="w-3.5 h-3.5" />
                <span>Critical ({criticalCount})</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {hasAnyPhases && (
              <button
                type="button"
                onClick={() => setIncludePhases((v) => !v)}
                aria-pressed={includePhases}
                className={cn(
                  'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer shadow-surface-sm',
                  includePhases
                    ? 'bg-brand-50 text-brand-700 border-brand-200/90 dark:bg-brand-500/15 dark:text-brand-300 dark:border-brand-400/30'
                    : 'border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-surface-elevated text-slate-600 dark:text-slate-300',
                )}
              >
                <FolderSimple weight="duotone" className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Include Phases</span>
                <span className="sm:hidden">Phases</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Focused Column Switcher (< 768px) */}
      {isMobile && (
        <div
          role="tablist"
          aria-label="Kanban board columns"
          className="shrink-0 grid grid-cols-4 gap-1 p-2 border-b border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-surface-dark"
        >
          {BOARD_COLUMN_ORDER.map((colStatus) => {
            const active = mobileActiveColumn === colStatus;
            const styles = VIEW_STATUS_STYLES[colStatus];
            return (
              <button
                key={colStatus}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMobileActiveColumn(colStatus)}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded-xl text-[11px] font-semibold border transition-colors cursor-pointer',
                  active
                    ? 'bg-brand-50 text-brand-700 border-brand-200/90 dark:bg-brand-500/15 dark:text-brand-300 dark:border-brand-400/30'
                    : 'bg-slate-50/70 text-slate-600 border-transparent dark:bg-white/[0.03] dark:text-slate-400',
                )}
              >
                <span className="inline-flex items-center gap-1 max-w-full">
                  <span className={cn('w-2 h-2 rounded-full shrink-0', styles.dot)} />
                  <span className="truncate">{TASK_STATUS_SHORT_LABELS[colStatus]}</span>
                </span>
                <span className="font-mono text-[10px] opacity-75 tabular-nums">
                  {columns[colStatus].length}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Board Body */}
      {isMobile ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-3 pb-24">
          {renderColumn(mobileActiveColumn)}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto xl:overflow-hidden p-3.5 md:p-4 pb-24">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5 xl:h-full">
            {BOARD_COLUMN_ORDER.map(renderColumn)}
          </div>
        </div>
      )}
    </div>
  );
});
