import { memo } from 'react';
import { Check } from '@phosphor-icons/react';
import { getTaskStatus, isTaskCompleted, isTaskDeadline } from '@/domain/taskTree';
import { formatDateRange, type TaskBarGeometry } from '@/domain/timeline';
import type {
  BarHeightMode,
  FlatTask,
  SubtaskLabelPosition,
  TaskLabelPosition,
} from '@/types';
import { cn } from '@/utils/cn';
import { BAR_HEIGHT_PX, getBarCenterY, STATUS_BAR_STYLES } from './ganttStyles';

export interface TimelineBarsProps {
  visibleTasks: readonly FlatTask[];
  barGeometries: ReadonlyMap<number, TaskBarGeometry>;
  rowHeight: number;
  barHeight: BarHeightMode;
  useRoundedSubtasks: boolean;
  taskLabelPosition: TaskLabelPosition;
  subtaskLabelPosition: SubtaskLabelPosition;
  showTaskDescriptions: boolean;
  selectedTaskId: number | null;
  onSelectTask: (taskId: number) => void;
  onTaskActivate: (task: FlatTask) => void;
  onBarHover: (task: FlatTask, durationDays: number, rect: DOMRect, rowIndex: number) => void;
  onBarLeave: () => void;
}

/**
 * Renders all task bars strictly at z-10 (below the opaque z-30 TimelineHeader),
 * preventing any scrolled bar or top label from ever painting over date headers.
 */
export const TimelineBars = memo(function TimelineBars({
  visibleTasks,
  barGeometries,
  rowHeight,
  barHeight,
  useRoundedSubtasks,
  taskLabelPosition,
  subtaskLabelPosition,
  showTaskDescriptions,
  selectedTaskId,
  onSelectTask,
  onTaskActivate,
  onBarHover,
  onBarLeave,
}: TimelineBarsProps) {
  const barHeightPx = BAR_HEIGHT_PX[barHeight];

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {visibleTasks.map((task, rowIndex) => {
        const geom = barGeometries.get(task.id);
        if (!geom) return null;

        const status = getTaskStatus(task);
        const statusStyle = STATUS_BAR_STYLES[status];
        const completed = isTaskCompleted(task);
        const deadline = isTaskDeadline(task);
        const isPhase = task.hasChildren;
        const isSelected = selectedTaskId === task.id;

        const labelPos = task.isSubtask || deadline ? subtaskLabelPosition : taskLabelPosition;
        const isTopLabel = labelPos === 'top';
        const showDiamond = deadline && !useRoundedSubtasks;
        const diamondSize = Math.max(14, barHeightPx - 6);
        const barCenterY = getBarCenterY(rowHeight, barHeightPx, isTopLabel, showTaskDescriptions);

        return (
          <div
            key={task.id}
            style={{ top: rowIndex * rowHeight, height: rowHeight }}
            className="pointer-events-none absolute left-0 right-0"
          >
            {/* Top label (strictly inside row bounds & below header z-30) */}
            {labelPos === 'top' && (
              <div
                style={{ left: `${geom.left}px`, top: '3px', maxWidth: '240px' }}
                className="pointer-events-none absolute truncate text-[11px] font-semibold text-slate-700 dark:text-slate-300 leading-none"
              >
                {task.name}
                {task.progress > 0 && !deadline ? (
                  <span className="ml-1 font-mono text-[10px] text-slate-500 dark:text-slate-400">
                    · {task.progress}%
                  </span>
                ) : null}
              </div>
            )}

            {/* Bar or Diamond */}
            {showDiamond ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectTask(task.id);
                  onTaskActivate(task);
                }}
                onMouseEnter={(e) =>
                  onBarHover(task, geom.durationDays, e.currentTarget.getBoundingClientRect(), rowIndex)
                }
                onMouseLeave={onBarLeave}
                aria-label={`${task.name} deadline on ${formatDateRange(task.start, task.end)}`}
                style={{
                  left: `${geom.left + Math.min(geom.width, 28) / 2 - diamondSize / 2}px`,
                  top: `${barCenterY - diamondSize / 2}px`,
                  width: `${diamondSize}px`,
                  height: `${diamondSize}px`,
                }}
                className={cn(
                  'pointer-events-auto absolute flex items-center justify-center cursor-pointer transition-transform duration-150 hover:scale-110',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
                  isSelected && 'scale-110',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'block w-full h-full rotate-45 rounded-[3px] shadow-sm',
                    statusStyle.diamondClass,
                  )}
                />
                <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
                  {completed ? (
                    <Check weight="bold" className="w-2.5 h-2.5 text-white" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  )}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectTask(task.id);
                  onTaskActivate(task);
                }}
                onMouseEnter={(e) =>
                  onBarHover(task, geom.durationDays, e.currentTarget.getBoundingClientRect(), rowIndex)
                }
                onMouseLeave={onBarLeave}
                aria-label={`${task.name}: ${formatDateRange(task.start, task.end)}, ${task.progress}% complete`}
                style={{
                  left: `${geom.left}px`,
                  top: `${barCenterY - barHeightPx / 2}px`,
                  width: `${geom.width}px`,
                  height: `${barHeightPx}px`,
                }}
                className={cn(
                  'pointer-events-auto absolute overflow-hidden transition-[filter,box-shadow] duration-150 cursor-pointer text-left gantt-bar-polished',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1',
                  isPhase ? cn('rounded-[7px]', statusStyle.phaseBgClass) : cn('rounded-[6px]', statusStyle.bgClass),
                  isSelected &&
                    'ring-2 ring-brand-500 ring-offset-1 ring-offset-white dark:ring-offset-canvas-dark',
                )}
              >
                {/* Progress fill sheen */}
                {task.progress > 0 && task.progress < 100 && (
                  <span
                    aria-hidden="true"
                    style={{ width: `${task.progress}%` }}
                    className="absolute inset-y-0 left-0 bg-white/25 pointer-events-none"
                  />
                )}

                {/* Phase summary subtle end-cap accents */}
                {isPhase && (
                  <>
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-0 bottom-0 w-1 bg-white/35 pointer-events-none"
                    />
                    <span
                      aria-hidden="true"
                      className="absolute right-0 top-0 bottom-0 w-1 bg-black/20 pointer-events-none"
                    />
                  </>
                )}

                {/* Inside label */}
                {labelPos === 'inside' && geom.width > 56 && (
                  <span className="relative flex items-center justify-between gap-2 h-full px-2.5 text-[11px] font-semibold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.28)]">
                    <span className="truncate flex items-center gap-1.5">
                      {completed && <Check weight="bold" className="w-3 h-3 shrink-0" />}
                      <span className="truncate">{task.name}</span>
                    </span>
                    {geom.width > 115 && task.progress > 0 && (
                      <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-black/20 shrink-0 tabular-nums">
                        {task.progress}%
                      </span>
                    )}
                  </span>
                )}
              </button>
            )}

            {/* Outside label */}
            {labelPos === 'outside' && (
              <div
                style={{
                  left: `${
                    showDiamond
                      ? geom.left + Math.min(geom.width, 28) / 2 + diamondSize / 2 + 8
                      : geom.left + geom.width + 8
                  }px`,
                  top: `${barCenterY}px`,
                  maxWidth: '210px',
                }}
                className="pointer-events-none absolute -translate-y-1/2 truncate text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                {task.name}
                {task.progress > 0 && !deadline ? (
                  <span className="ml-1 font-mono text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                    {task.progress}%
                  </span>
                ) : null}
              </div>
            )}

            {/* Inline task description directly beneath the bar when toggled on */}
            {showTaskDescriptions && task.description && (
              <div
                style={{
                  left: `${geom.left}px`,
                  top: `${barCenterY + barHeightPx / 2 + 4}px`,
                  maxWidth: `${Math.max(geom.width, 280)}px`,
                }}
                className="pointer-events-none absolute truncate text-[11px] leading-[14px] text-slate-500 dark:text-slate-400"
              >
                {task.description}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});
