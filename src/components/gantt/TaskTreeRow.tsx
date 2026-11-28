import { memo } from 'react';
import {
  CaretDown,
  CheckCircle,
  Circle,
  NoteBlank,
  PencilSimple,
  Plus,
  Trash,
} from '@phosphor-icons/react';
import { getTaskStatus, isTaskCompleted } from '@/domain/taskTree';
import { formatDateRange } from '@/domain/timeline';
import type { FlatTask } from '@/types';
import { cn } from '@/utils/cn';
import { STATUS_BAR_STYLES } from './ganttStyles';

export interface TaskTreeRowProps {
  task: FlatTask;
  rowIndex: number;
  rowHeight: number;
  isCollapsed: boolean;
  isSelected: boolean;
  readOnly: boolean;
  compact: boolean;
  showTaskDescriptions: boolean;
  showProgressPercentages?: boolean;
  onSelect: (taskId: number) => void;
  onHoverRowIndex: (rowIndex: number | null) => void;
  onToggleCollapse: (taskId: number) => void;
  onToggleSubtaskDone?: (taskId: number) => void;
  onEdit?: (task: FlatTask) => void;
  onAddSubtask?: (parentId: number) => void;
  onDelete?: (taskId: number) => void;
}

export const TaskTreeRow = memo(function TaskTreeRow({
  task,
  rowIndex,
  rowHeight,
  isCollapsed,
  isSelected,
  readOnly,
  compact,
  showTaskDescriptions,
  showProgressPercentages = true,
  onSelect,
  onHoverRowIndex,
  onToggleCollapse,
  onToggleSubtaskDone,
  onEdit,
  onAddSubtask,
  onDelete,
}: TaskTreeRowProps) {
  const completed = isTaskCompleted(task);
  const status = getTaskStatus(task);
  const statusStyle = STATUS_BAR_STYLES[status];
  const indentPx = (compact ? 8 : 12) + task.level * (compact ? 14 : 18);

  return (
    <div
      data-tree-row={rowIndex}
      style={{ height: rowHeight, paddingLeft: `${indentPx}px` }}
      onMouseEnter={() => onHoverRowIndex(rowIndex)}
      onMouseLeave={() => onHoverRowIndex(null)}
      onClick={() => onSelect(task.id)}
      onDoubleClick={() => {
        if (!readOnly) onEdit?.(task);
      }}
      className={cn(
        'group relative flex items-center gap-1.5 pr-2 border-b cursor-pointer select-none',
        'border-slate-200/75 dark:border-white/[0.055]',
        isSelected
          ? 'bg-brand-50/90 dark:bg-brand-500/15'
          : task.hasChildren
            ? 'bg-slate-50/85 dark:bg-white/[0.02] hover:bg-brand-50/50 dark:hover:bg-brand-500/10'
            : 'bg-transparent hover:bg-brand-50/40 dark:hover:bg-white/[0.035]',
      )}
    >
      {/* Left accent strip for phase headers or selected row */}
      {(isSelected || task.hasChildren) && (
        <span
          aria-hidden="true"
          className={cn(
            'absolute left-0 top-1 bottom-1 w-[3px] rounded-r',
            isSelected
              ? 'bg-brand-600 dark:bg-brand-400'
              : status === 'completed'
                ? 'bg-emerald-500/80'
                : status === 'working'
                  ? 'bg-amber-500/80'
                  : 'bg-brand-500/45 dark:bg-brand-400/50',
          )}
        />
      )}

      {/* Expand/Collapse chevron OR subtask completion check */}
      {task.hasChildren ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse(task.id);
          }}
          aria-label={isCollapsed ? `Expand ${task.name}` : `Collapse ${task.name}`}
          aria-expanded={!isCollapsed}
          className="p-1 rounded-md text-slate-500 hover:text-brand-600 hover:bg-slate-200/75 dark:text-slate-400 dark:hover:text-brand-300 dark:hover:bg-white/[0.08] transition-colors shrink-0 cursor-pointer"
        >
          <CaretDown
            weight="bold"
            className={cn(
              'w-3.5 h-3.5 transition-transform duration-150',
              isCollapsed && '-rotate-90',
            )}
          />
        </button>
      ) : task.isSubtask && !readOnly && onToggleSubtaskDone ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSubtaskDone(task.id);
          }}
          aria-label={completed ? `Mark ${task.name} incomplete` : `Mark ${task.name} complete`}
          title={completed ? 'Mark incomplete' : 'Mark done'}
          className={cn(
            'p-1 rounded-md transition-colors shrink-0 cursor-pointer',
            completed
              ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15'
              : 'text-slate-400 hover:text-brand-600 dark:text-slate-500 dark:hover:text-brand-400 hover:bg-slate-200/65 dark:hover:bg-white/[0.08]',
          )}
        >
          {completed ? (
            <CheckCircle weight="duotone" className="w-4 h-4" />
          ) : (
            <Circle weight="duotone" className="w-4 h-4" />
          )}
        </button>
      ) : (
        <span aria-hidden="true" className="w-5 flex items-center justify-center shrink-0">
          {status === 'working' ? (
            <span className="relative flex h-2 w-2" title="Currently working">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
          ) : (
            <span className={cn('w-2 h-2 rounded-full', statusStyle.dotClass)} />
          )}
        </span>
      )}

      {/* Task name & date metadata */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={cn(
              'text-xs sm:text-[13px] truncate',
              task.hasChildren ? 'font-display font-bold tracking-tight' : 'font-medium',
              completed
                ? 'text-slate-500 dark:text-slate-400 line-through decoration-emerald-500/45'
                : 'text-slate-800 dark:text-slate-100',
            )}
          >
            {task.name}
          </span>
          {task.description && (
            <span
              title={task.description}
              aria-label="Has description"
              className="inline-flex items-center text-brand-500/80 dark:text-brand-400/80 shrink-0"
            >
              <NoteBlank weight="duotone" className="w-3.5 h-3.5" />
            </span>
          )}
          {showProgressPercentages && task.hasChildren && (
            <span
              className={cn(
                'font-mono text-[10px] font-bold px-1.5 py-[1px] rounded-md shrink-0 tabular-nums',
                completed
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                  : task.progress > 0
                    ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300'
                    : 'bg-slate-200/80 text-slate-600 dark:bg-white/10 dark:text-slate-400',
              )}
            >
              {task.progress}%
            </span>
          )}
        </div>
        {!compact && (
          <p className="font-mono text-[10px] text-slate-500 dark:text-slate-400 truncate tabular-nums">
            {formatDateRange(task.start, task.end)}
          </p>
        )}
        {!compact && showTaskDescriptions && task.description && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate leading-tight mt-0.5">
            {task.description}
          </p>
        )}
      </div>

      {/* Inline quick actions */}
      {!readOnly && (
        <div
          className={cn(
            'flex items-center gap-0.5 shrink-0 transition-opacity duration-100',
            isSelected
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
          )}
        >
          {!task.isSubtask && onAddSubtask && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddSubtask(task.id);
              }}
              aria-label={`Add subtask to ${task.name}`}
              title="Add subtask"
              className="p-1 rounded-md text-slate-500 hover:text-brand-600 hover:bg-brand-100/70 dark:text-slate-400 dark:hover:text-brand-300 dark:hover:bg-brand-500/20 cursor-pointer"
            >
              <Plus weight="bold" className="w-3.5 h-3.5" />
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(task);
              }}
              aria-label={`Edit ${task.name}`}
              title="Edit task"
              className="p-1 rounded-md text-slate-500 hover:text-brand-600 hover:bg-slate-200/75 dark:text-slate-400 dark:hover:text-brand-300 dark:hover:bg-white/[0.08] cursor-pointer"
            >
              <PencilSimple weight="duotone" className="w-3.5 h-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(task.id);
              }}
              aria-label={`Delete ${task.name}`}
              title="Delete task"
              className="p-1 rounded-md text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:text-slate-400 dark:hover:text-rose-400 dark:hover:bg-rose-500/15 cursor-pointer"
            >
              <Trash weight="duotone" className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
});
