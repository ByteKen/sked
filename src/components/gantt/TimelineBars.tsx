import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Check } from '@phosphor-icons/react';
import {
  computeClampedDragDates,
  computeTaskBaselineSlipDays,
  diffDaysISO,
  getInclusiveDurationDays,
  type ClampedDragResult,
  type ScheduleDragMode,
  type TaskDateBounds,
} from '@/domain/scheduling';
import { getTaskStatus, isTaskCompleted, isTaskDeadline } from '@/domain/taskTree';
import { formatDateRange, type TaskBarGeometry } from '@/domain/timeline';
import type {
  BarHeightMode,
  FlatTask,
  SubtaskLabelPosition,
  TaskLabelPosition,
  WorkspaceBaseline,
} from '@/types';
import { cn } from '@/utils/cn';
import { BAR_HEIGHT_PX, getBarCenterY, STATUS_BAR_STYLES } from './ganttStyles';

interface ActiveBarDrag {
  taskId: number;
  pointerId: number;
  pointerType: string;
  mode: ScheduleDragMode;
  origStart: string;
  origEnd: string;
  bounds?: TaskDateBounds;
  startClientX: number;
  startClientY: number;
  deltaDays: number;
  /** True once drag gesture has been armed (mouse moved >= 5px, or touch held >= 260ms). */
  active: boolean;
}

const TOUCH_HOLD_MS = 260;
const TOUCH_HOLD_CANCEL_MOVE_PX = 8;
const MOUSE_DRAG_THRESHOLD_PX = 5;

export interface TimelineBarsProps {
  visibleTasks: readonly FlatTask[];
  barGeometries: ReadonlyMap<number, TaskBarGeometry>;
  taskDateBounds?: ReadonlyMap<number, TaskDateBounds>;
  baselineGeometries?: ReadonlyMap<number, TaskBarGeometry>;
  baseline?: WorkspaceBaseline | null;
  showBaseline?: boolean;
  showCriticalPath?: boolean;
  criticalTaskIds?: ReadonlySet<number>;
  pixelsPerDay: number;
  readOnly?: boolean;
  rowHeight: number;
  barHeight: BarHeightMode;
  useRoundedSubtasks: boolean;
  taskLabelPosition: TaskLabelPosition;
  subtaskLabelPosition: SubtaskLabelPosition;
  showTaskDescriptions: boolean;
  selectedTaskId: number | null;
  onSelectTask: (taskId: number) => void;
  onTaskActivate: (task: FlatTask) => void;
  onRescheduleTask?: (taskId: number, nextStart: string, nextEnd: string) => void;
  onBarHover: (task: FlatTask, durationDays: number, rect: DOMRect, rowIndex: number) => void;
  onBarLeave: () => void;
}

function computePreviewDates(drag: ActiveBarDrag): ClampedDragResult {
  return computeClampedDragDates({
    mode: drag.mode,
    origStart: drag.origStart,
    origEnd: drag.origEnd,
    deltaDays: drag.deltaDays,
    bounds: drag.bounds,
  });
}

/**
 * Renders all task bars strictly at z-10 (below the opaque z-30 TimelineHeader),
 * with cross-platform drag-to-reschedule (instant mouse drag + touch long-press so
 * mobile swipe-scrolling and two-finger pinch-to-zoom never conflict), Escape cancel,
 * Critical Path highlighting, and Planned vs. Actual baseline ghost bars.
 */
export const TimelineBars = memo(function TimelineBars({
  visibleTasks,
  barGeometries,
  taskDateBounds,
  baselineGeometries,
  baseline,
  showBaseline = false,
  showCriticalPath = false,
  criticalTaskIds,
  pixelsPerDay,
  readOnly = false,
  rowHeight,
  barHeight,
  useRoundedSubtasks,
  taskLabelPosition,
  subtaskLabelPosition,
  showTaskDescriptions,
  selectedTaskId,
  onSelectTask,
  onTaskActivate,
  onRescheduleTask,
  onBarHover,
  onBarLeave,
}: TimelineBarsProps) {
  const barHeightPx = BAR_HEIGHT_PX[barHeight];
  const canDrag = !readOnly && Boolean(onRescheduleTask);

  const [drag, setDrag] = useState<ActiveBarDrag | null>(null);
  const dragRef = useRef<ActiveBarDrag | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const suppressClickTaskIdRef = useRef<number | null>(null);
  const pixelsPerDayRef = useRef(pixelsPerDay);
  const onRescheduleRef = useRef(onRescheduleTask);

  useEffect(() => {
    pixelsPerDayRef.current = pixelsPerDay;
  }, [pixelsPerDay]);

  useEffect(() => {
    onRescheduleRef.current = onRescheduleTask;
  }, [onRescheduleTask]);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const cancelDrag = useCallback(() => {
    clearHoldTimer();
    dragRef.current = null;
    setDrag(null);
  }, [clearHoldTimer]);

  const isDragSessionOpen = drag !== null;
  const activeDragMode = drag?.active ? drag.mode : null;

  // Steady body cursor & selection lock only while actively dragging on mouse/pen
  useEffect(() => {
    if (!activeDragMode) return;
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = activeDragMode === 'move' ? 'grabbing' : 'ew-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [activeDragMode]);

  useEffect(() => {
    if (!isDragSessionOpen) return;

    const handlePointerMove = (e: PointerEvent) => {
      const curr = dragRef.current;
      if (!curr) return;
      if (curr.pointerId !== 0 && e.pointerId !== 0 && e.pointerId !== curr.pointerId) return;

      const dx = e.clientX - curr.startClientX;
      const dy = e.clientY - curr.startClientY;

      // Touch requires holding still until long-press arms; moving early yields to native scroll
      if (curr.pointerType === 'touch' && !curr.active) {
        if (Math.hypot(dx, dy) > TOUCH_HOLD_CANCEL_MOVE_PX) {
          cancelDrag();
        }
        return;
      }

      if (!curr.active) {
        if (Math.abs(dx) < MOUSE_DRAG_THRESHOLD_PX) return;
      }

      const ppd = Math.max(0.1, pixelsPerDayRef.current);
      const deltaDays = Math.round(dx / ppd);
      if (curr.active && deltaDays === curr.deltaDays) return;

      const updated: ActiveBarDrag = { ...curr, active: true, deltaDays };
      dragRef.current = updated;
      setDrag(updated);
    };

    // Prevent viewport scroll only when a touch long-press drag is actively armed
    const handleTouchMove = (e: TouchEvent) => {
      const curr = dragRef.current;
      if (!curr) return;
      if (e.touches.length >= 2) {
        // Two-finger pinch-to-zoom always wins over single-finger drag
        cancelDrag();
        return;
      }
      if (curr.active && curr.pointerType === 'touch') {
        e.preventDefault();
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        cancelDrag();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelDrag();
      }
    };

    // Suppress native long-press context menu on iOS/Android while touch drag is arming or active
    const handleContextMenu = (e: MouseEvent) => {
      if (dragRef.current?.pointerType === 'touch') {
        e.preventDefault();
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      const curr = dragRef.current;
      if (!curr) return;
      if (curr.pointerId !== 0 && e.pointerId !== 0 && e.pointerId !== curr.pointerId) return;

      clearHoldTimer();
      dragRef.current = null;
      setDrag(null);
      if (!curr.active) return;

      suppressClickTaskIdRef.current = curr.taskId;
      window.setTimeout(() => {
        if (suppressClickTaskIdRef.current === curr.taskId) {
          suppressClickTaskIdRef.current = null;
        }
      }, 120);

      const { nextStart, nextEnd } = computePreviewDates(curr);
      if (nextStart !== curr.origStart || nextEnd !== curr.origEnd) {
        onRescheduleRef.current?.(curr.taskId, nextStart, nextEnd);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', cancelDrag);
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('contextmenu', handleContextMenu);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', cancelDrag);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [isDragSessionOpen, cancelDrag, clearHoldTimer]);

  useEffect(() => () => clearHoldTimer(), [clearHoldTimer]);

  const startBarDrag = useCallback(
    (e: React.PointerEvent, task: FlatTask, mode: ScheduleDragMode) => {
      if (!canDrag || e.button !== 0) return;
      if (e.pointerType === 'touch' && !e.isPrimary) return;

      e.stopPropagation();
      onBarLeave();
      clearHoldTimer();

      const initial: ActiveBarDrag = {
        taskId: task.id,
        pointerId: e.pointerId ?? 0,
        pointerType: e.pointerType || 'mouse',
        mode,
        origStart: task.start,
        origEnd: task.end,
        bounds: taskDateBounds?.get(task.id),
        startClientX: e.clientX,
        startClientY: e.clientY,
        deltaDays: 0,
        active: false,
      };
      dragRef.current = initial;
      setDrag(initial);

      // For touch, require a brief stationary hold so normal timeline swipe-scrolling stays effortless
      if (initial.pointerType === 'touch') {
        holdTimerRef.current = window.setTimeout(() => {
          const curr = dragRef.current;
          if (!curr || curr.taskId !== task.id) return;
          if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate(12);
          }
          const armed: ActiveBarDrag = { ...curr, active: true };
          dragRef.current = armed;
          setDrag(armed);
        }, TOUCH_HOLD_MS);
      }
    },
    [canDrag, onBarLeave, clearHoldTimer, taskDateBounds],
  );

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {visibleTasks.map((task, rowIndex) => {
        const baseGeom = barGeometries.get(task.id);
        if (!baseGeom) return null;

        const isDraggingThis = Boolean(drag?.active && drag.taskId === task.id);
        const previewDates = isDraggingThis && drag ? computePreviewDates(drag) : null;

        let renderLeft = baseGeom.left;
        let renderWidth = baseGeom.width;
        let renderDuration = baseGeom.durationDays;

        if (isDraggingThis && drag && previewDates) {
          const startShiftDays = diffDaysISO(drag.origStart, previewDates.nextStart);
          const nextDur = getInclusiveDurationDays(previewDates.nextStart, previewDates.nextEnd);
          renderLeft = baseGeom.left + startShiftDays * pixelsPerDay;
          renderWidth = Math.max(28, nextDur * pixelsPerDay);
          renderDuration = nextDur;
        }

        const status = getTaskStatus(task);
        const statusStyle = STATUS_BAR_STYLES[status];
        const completed = isTaskCompleted(task);
        const deadline = isTaskDeadline(task);
        const isPhase = task.hasChildren;
        const isSelected = selectedTaskId === task.id;
        const isCritical = Boolean(showCriticalPath && criticalTaskIds?.has(task.id));
        const isDimmedByCpm = Boolean(showCriticalPath && !isCritical && !isDraggingThis);

        const labelPos = task.isSubtask || deadline ? subtaskLabelPosition : taskLabelPosition;
        const isTopLabel = labelPos === 'top';
        const showDiamond = deadline && !useRoundedSubtasks;
        const diamondSize = Math.max(14, barHeightPx - 6);
        const barCenterY = getBarCenterY(rowHeight, barHeightPx, isTopLabel, showTaskDescriptions);

        const baselineGeom = showBaseline ? baselineGeometries?.get(task.id) : undefined;
        const slipDays = showBaseline ? computeTaskBaselineSlipDays(task, baseline) : null;
        const showResizeHandles = canDrag && !showDiamond && renderWidth >= 34;

        // Compute horizontal gap between baseline ghost and live bar for the subtle drift connector
        const liveVisualLeft = showDiamond
          ? renderLeft + Math.min(renderWidth, 28) / 2 - diamondSize / 2
          : renderLeft;
        const liveVisualRight = showDiamond ? liveVisualLeft + diamondSize : renderLeft + renderWidth;
        const ghostVisualLeft = baselineGeom
          ? showDiamond
            ? baselineGeom.left + Math.min(baselineGeom.width, 28) / 2 - diamondSize / 2
            : baselineGeom.left
          : 0;
        const ghostVisualRight = baselineGeom
          ? showDiamond
            ? ghostVisualLeft + diamondSize
            : baselineGeom.left + baselineGeom.width
          : 0;

        let driftConnector: { left: number; width: number } | null = null;
        if (baselineGeom) {
          if (ghostVisualRight + 4 < liveVisualLeft) {
            driftConnector = {
              left: ghostVisualRight + 2,
              width: liveVisualLeft - ghostVisualRight - 4,
            };
          } else if (liveVisualRight + 4 < ghostVisualLeft) {
            driftConnector = {
              left: liveVisualRight + 2,
              width: ghostVisualLeft - liveVisualRight - 4,
            };
          }
        }

        // If a task extended over its entire baseline, mark the planned finish edge cleanly on top
        const coveredPlannedEndX =
          !showDiamond &&
          baselineGeom &&
          baselineGeom.left >= renderLeft - 1 &&
          baselineGeom.left + baselineGeom.width < renderLeft + renderWidth - 4
            ? baselineGeom.left + baselineGeom.width
            : null;

        const handleBarClick = (e: React.MouseEvent) => {
          e.stopPropagation();
          if (suppressClickTaskIdRef.current === task.id) {
            suppressClickTaskIdRef.current = null;
            return;
          }
          onSelectTask(task.id);
          onTaskActivate(task);
        };

        const handlePointerEnter = (e: React.PointerEvent<HTMLElement>) => {
          // Mouse-only hover tooltip prevents the iOS Safari double-tap-to-click issue on touch
          if (e.pointerType !== 'mouse' || dragRef.current?.active) return;
          onBarHover(task, renderDuration, e.currentTarget.getBoundingClientRect(), rowIndex);
        };

        const handlePointerLeave = (e: React.PointerEvent<HTMLElement>) => {
          if (e.pointerType !== 'mouse') return;
          onBarLeave();
        };

        return (
          <div
            key={task.id}
            style={{ top: rowIndex * rowHeight, height: rowHeight }}
            className="pointer-events-none absolute left-0 right-0"
          >
            {/* Subtle dashed drift connector bridging original baseline ghost to moved live bar */}
            {driftConnector && (
              <div
                aria-hidden="true"
                style={{
                  left: `${driftConnector.left}px`,
                  top: `${barCenterY}px`,
                  width: `${driftConnector.width}px`,
                }}
                className={cn(
                  'pointer-events-none absolute border-t-[1.5px] border-dashed -translate-y-1/2 transition-opacity duration-150',
                  slipDays && slipDays > 0
                    ? 'border-amber-400/75 dark:border-amber-400/55'
                    : slipDays && slipDays < 0
                      ? 'border-emerald-400/75 dark:border-emerald-400/55'
                      : 'border-slate-400/60 dark:border-slate-400/45',
                  isDimmedByCpm && 'opacity-35',
                )}
              />
            )}

            {/* Planned Baseline Ghost Bar aligned pixel-for-pixel on the exact same row centerline */}
            {baselineGeom &&
              (showDiamond ? (
                <div
                  aria-hidden="true"
                  data-testid={`baseline-ghost-${task.id}`}
                  style={{
                    left: `${ghostVisualLeft}px`,
                    top: `${barCenterY - diamondSize / 2}px`,
                    width: `${diamondSize}px`,
                    height: `${diamondSize}px`,
                  }}
                  className={cn(
                    'pointer-events-none absolute flex items-center justify-center transition-opacity duration-150',
                    isDimmedByCpm && 'opacity-35',
                  )}
                >
                  <span
                    className={cn(
                      'block w-full h-full rotate-45 rounded-[3px] border-[1.5px] border-dashed',
                      slipDays && slipDays > 0
                        ? 'bg-amber-400/15 border-amber-500/75 dark:bg-amber-400/15 dark:border-amber-400/70'
                        : slipDays && slipDays < 0
                          ? 'bg-emerald-400/15 border-emerald-500/75 dark:bg-emerald-400/15 dark:border-emerald-400/70'
                          : 'bg-slate-400/15 border-slate-500/60 dark:bg-slate-400/15 dark:border-slate-400/55',
                    )}
                  />
                </div>
              ) : (
                <div
                  aria-hidden="true"
                  data-testid={`baseline-ghost-${task.id}`}
                  style={{
                    left: `${baselineGeom.left}px`,
                    top: `${barCenterY - barHeightPx / 2}px`,
                    width: `${baselineGeom.width}px`,
                    height: `${barHeightPx}px`,
                    backgroundImage:
                      'repeating-linear-gradient(-45deg, transparent, transparent 4px, currentColor 4px, currentColor 5px)',
                  }}
                  className={cn(
                    'pointer-events-none absolute border-[1.5px] border-dashed transition-opacity duration-150',
                    isPhase ? 'rounded-[7px]' : 'rounded-[6px]',
                    slipDays && slipDays > 0
                      ? 'bg-amber-400/15 border-amber-500/75 text-amber-500/15 dark:bg-amber-400/12 dark:border-amber-400/70 dark:text-amber-400/15'
                      : slipDays && slipDays < 0
                        ? 'bg-emerald-400/15 border-emerald-500/75 text-emerald-500/15 dark:bg-emerald-400/12 dark:border-emerald-400/70 dark:text-emerald-400/15'
                        : 'bg-slate-400/12 border-slate-400/70 text-slate-400/15 dark:bg-slate-400/12 dark:border-slate-400/55 dark:text-slate-400/15',
                    isDimmedByCpm && 'opacity-35',
                  )}
                />
              ))}

            {/* Top label (strictly inside row bounds & below header z-30) */}
            {labelPos === 'top' && (
              <div
                style={{ left: `${renderLeft}px`, top: '3px', maxWidth: '240px' }}
                className={cn(
                  'pointer-events-none absolute truncate text-[11px] font-semibold leading-none transition-opacity duration-150',
                  isCritical
                    ? 'text-rose-700 dark:text-rose-300'
                    : 'text-slate-700 dark:text-slate-300',
                  isDimmedByCpm && 'opacity-45',
                )}
              >
                {task.name}
                {task.progress > 0 && !deadline ? (
                  <span className="ml-1 font-mono text-[10px] text-slate-500 dark:text-slate-400">
                    · {task.progress}%
                  </span>
                ) : null}
              </div>
            )}

            {/* Live floating drag date preview badge */}
            {isDraggingThis && previewDates && drag && (
              <div
                style={{
                  left: `${renderLeft}px`,
                  top: `${Math.max(0, barCenterY - barHeightPx / 2 - 22)}px`,
                }}
                className="pointer-events-none absolute z-30 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-mono text-[10px] font-semibold shadow-md whitespace-nowrap"
              >
                <span>{formatDateRange(previewDates.nextStart, previewDates.nextEnd)}</span>
                <span className="opacity-75">
                  {drag.mode === 'move'
                    ? (() => {
                        const actualShift = diffDaysISO(drag.origStart, previewDates.nextStart);
                        return `${actualShift > 0 ? '+' : ''}${actualShift}d`;
                      })()
                    : `${renderDuration}d`}
                </span>
                {previewDates.clampedBy && (
                  <span className="text-amber-300 dark:text-amber-600">
                    · {previewDates.clampedBy === 'parent' ? 'Parent limit' : 'Subtask limit'}
                  </span>
                )}
              </div>
            )}

            {/* Bar or Diamond */}
            {showDiamond ? (
              <button
                type="button"
                onPointerDown={(e) => startBarDrag(e, task, 'move')}
                onClick={handleBarClick}
                onPointerEnter={handlePointerEnter}
                onPointerLeave={handlePointerLeave}
                aria-label={`${task.name} deadline on ${formatDateRange(task.start, task.end)}`}
                style={{
                  left: `${renderLeft + Math.min(renderWidth, 28) / 2 - diamondSize / 2}px`,
                  top: `${barCenterY - diamondSize / 2}px`,
                  width: `${diamondSize}px`,
                  height: `${diamondSize}px`,
                }}
                className={cn(
                  'pointer-events-auto absolute flex items-center justify-center transition-[transform,opacity] duration-150 hover:scale-110 select-none [-webkit-touch-callout:none]',
                  canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
                  isDraggingThis && 'scale-125 z-20',
                  !isDraggingThis && isSelected && 'scale-110',
                  isDimmedByCpm && 'opacity-40 hover:opacity-80',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'block w-full h-full rotate-45 rounded-[3px] shadow-sm',
                    statusStyle.diamondClass,
                    isCritical &&
                      'ring-2 ring-rose-500 ring-offset-1 ring-offset-white dark:ring-offset-canvas-dark',
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
              <div
                role="button"
                tabIndex={0}
                onPointerDown={(e) => startBarDrag(e, task, 'move')}
                onClick={handleBarClick}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectTask(task.id);
                    onTaskActivate(task);
                  }
                }}
                onPointerEnter={handlePointerEnter}
                onPointerLeave={handlePointerLeave}
                aria-label={`${task.name}: ${formatDateRange(task.start, task.end)}, ${task.progress}% complete`}
                data-critical={isCritical ? 'true' : undefined}
                style={{
                  left: `${renderLeft}px`,
                  top: `${barCenterY - barHeightPx / 2}px`,
                  width: `${renderWidth}px`,
                  height: `${barHeightPx}px`,
                }}
                className={cn(
                  'group/bar pointer-events-auto absolute overflow-hidden transition-[filter,box-shadow,opacity,transform] duration-150 text-left gantt-bar-polished select-none [-webkit-touch-callout:none]',
                  canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1',
                  isPhase
                    ? cn('rounded-[7px]', statusStyle.phaseBgClass)
                    : cn('rounded-[6px]', statusStyle.bgClass),
                  isDraggingThis && 'z-20 scale-[1.02] ring-2 ring-brand-500 shadow-lg brightness-105',
                  !isDraggingThis &&
                    isCritical &&
                    'ring-2 ring-rose-500 dark:ring-rose-400 shadow-[0_0_0_3px_rgba(244,63,94,0.18)]',
                  !isDraggingThis &&
                    !isCritical &&
                    isSelected &&
                    'ring-2 ring-brand-500 ring-offset-1 ring-offset-white dark:ring-offset-canvas-dark',
                  isDimmedByCpm && 'opacity-40 hover:opacity-80',
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
                {labelPos === 'inside' && renderWidth > 56 && (
                  <span className="relative flex items-center justify-between gap-2 h-full px-2.5 text-[11px] font-semibold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.28)] pointer-events-none">
                    <span className="truncate flex items-center gap-1.5">
                      {completed && <Check weight="bold" className="w-3 h-3 shrink-0" />}
                      <span className="truncate">{task.name}</span>
                    </span>
                    {renderWidth > 115 && task.progress > 0 && (
                      <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-black/20 shrink-0 tabular-nums">
                        {task.progress}%
                      </span>
                    )}
                  </span>
                )}

                {/* Left & Right edge resize handles (hover on desktop, also visible when bar selected on touch/tablet) */}
                {showResizeHandles && (
                  <>
                    <span
                      aria-label={`Resize start date of ${task.name}`}
                      onPointerDown={(e) => startBarDrag(e, task, 'resize-start')}
                      onClick={(e) => e.stopPropagation()}
                      className={cn(
                        'absolute left-0 inset-y-0 w-3 cursor-ew-resize flex items-center justify-center transition-opacity',
                        isSelected
                          ? 'opacity-100'
                          : 'opacity-0 group-hover/bar:opacity-100 focus-within:opacity-100',
                      )}
                    >
                      <span className="w-[3px] h-3 rounded-full bg-white/85 shadow-sm" />
                    </span>
                    <span
                      aria-label={`Resize end date of ${task.name}`}
                      onPointerDown={(e) => startBarDrag(e, task, 'resize-end')}
                      onClick={(e) => e.stopPropagation()}
                      className={cn(
                        'absolute right-0 inset-y-0 w-3 cursor-ew-resize flex items-center justify-center transition-opacity',
                        isSelected
                          ? 'opacity-100'
                          : 'opacity-0 group-hover/bar:opacity-100 focus-within:opacity-100',
                      )}
                    >
                      <span className="w-[3px] h-3 rounded-full bg-white/85 shadow-sm" />
                    </span>
                  </>
                )}
              </div>
            )}

            {/* Planned finish tick when an extended live bar covers its baseline ghost */}
            {coveredPlannedEndX !== null && (
              <div
                aria-hidden="true"
                style={{
                  left: `${coveredPlannedEndX}px`,
                  top: `${barCenterY - barHeightPx / 2 + 2}px`,
                  height: `${barHeightPx - 4}px`,
                }}
                className="pointer-events-none absolute z-20 border-l-2 border-dashed border-white/85 drop-shadow-[0_0_2px_rgba(0,0,0,0.45)]"
              />
            )}

            {/* Outside label + optional baseline slip badge */}
            {(labelPos === 'outside' || (showBaseline && slipDays !== null && slipDays !== 0)) && (
              <div
                style={{
                  left: `${
                    showDiamond
                      ? renderLeft + Math.min(renderWidth, 28) / 2 + diamondSize / 2 + 8
                      : renderLeft + renderWidth + 8
                  }px`,
                  top: `${barCenterY}px`,
                  maxWidth: '250px',
                }}
                className={cn(
                  'pointer-events-none absolute -translate-y-1/2 flex items-center gap-1.5 transition-opacity duration-150',
                  isDimmedByCpm && 'opacity-45',
                )}
              >
                {labelPos === 'outside' && (
                  <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-300">
                    {task.name}
                    {task.progress > 0 && !deadline ? (
                      <span className="ml-1 font-mono text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                        {task.progress}%
                      </span>
                    ) : null}
                  </span>
                )}
                {showBaseline && slipDays !== null && slipDays !== 0 && (
                  <span
                    className={cn(
                      'shrink-0 font-mono text-[10px] font-bold px-1.5 py-[1px] rounded-md tabular-nums',
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

            {/* Inline task description directly beneath the bar when toggled on */}
            {showTaskDescriptions && task.description && (
              <div
                style={{
                  left: `${renderLeft}px`,
                  top: `${barCenterY + barHeightPx / 2 + 4}px`,
                  maxWidth: `${Math.max(renderWidth, 280)}px`,
                }}
                className={cn(
                  'pointer-events-none absolute truncate text-[11px] leading-[14px] text-slate-500 dark:text-slate-400',
                  isDimmedByCpm && 'opacity-40',
                )}
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
