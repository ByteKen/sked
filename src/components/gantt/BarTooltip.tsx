import { forwardRef, useImperativeHandle, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { getTaskStatus } from '@/domain/taskTree';
import { formatDateRange } from '@/domain/timeline';
import type { FlatTask } from '@/types';
import { cn } from '@/utils/cn';
import { SPRING_SNAPPY } from '@/utils/motion';
import { STATUS_BAR_STYLES } from './ganttStyles';

export interface BarTooltipHandle {
  show: (task: FlatTask, durationDays: number, anchorRect: DOMRect) => void;
  hide: () => void;
}

interface TooltipState {
  task: FlatTask;
  durationDays: number;
  x: number;
  y: number;
  placeBelow: boolean;
}

/**
 * Isolated portal tooltip controlled via imperative ref so hovering timeline bars
 * causes ZERO re-renders of GanttWorkspace, TaskTreePane, TimelineGrid, or TimelineBars.
 */
export const BarTooltip = forwardRef<BarTooltipHandle, { readOnly: boolean }>(
  function BarTooltip({ readOnly }, ref) {
    const [state, setState] = useState<TooltipState | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        show: (task, durationDays, anchorRect) => {
          const placeBelow = anchorRect.top < 150;
          const clampedX = Math.max(
            12,
            Math.min(window.innerWidth - 268, anchorRect.left),
          );
          const y = placeBelow ? anchorRect.bottom + 8 : anchorRect.top - 8;
          setState({ task, durationDays, x: clampedX, y, placeBelow });
        },
        hide: () => setState(null),
      }),
      [],
    );

    const status = state ? getTaskStatus(state.task) : null;
    const style = status ? STATUS_BAR_STYLES[status] : null;

    return createPortal(
      <AnimatePresence>
        {state && style && (
          <div
            style={{
              left: `${state.x}px`,
              top: `${state.y}px`,
              transform: state.placeBelow ? 'translateY(0)' : 'translateY(-100%)',
            }}
            className="pointer-events-none fixed z-[55]"
          >
            <motion.div
              role="tooltip"
              initial={{ opacity: 0, scale: 0.95, y: state.placeBelow ? -4 : 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={SPRING_SNAPPY}
              className="w-64 rounded-xl border border-slate-200/90 dark:border-white/[0.12] bg-white dark:bg-surface-elevated px-3.5 py-2.5 shadow-surface-lg dark:shadow-dark-lg"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-50 leading-snug line-clamp-2">
                  {state.task.name}
                </p>
                <span className="font-mono text-[11px] font-bold text-brand-600 dark:text-brand-400 shrink-0 tabular-nums">
                  {state.task.progress}%
                </span>
              </div>

              <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                {formatDateRange(state.task.start, state.task.end)} · {state.durationDays}{' '}
                {state.durationDays === 1 ? 'day' : 'days'}
              </p>

              {state.task.description && (
                <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-2">
                  {state.task.description}
                </p>
              )}

              <div className="mt-2 pt-2 border-t border-slate-100 dark:border-white/[0.08] flex items-center justify-between text-[10px]">
                <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
                  <span className={cn('w-2 h-2 rounded-full', style.dotClass)} />
                  {style.label}
                </span>
                <span className="text-slate-400 dark:text-slate-500">
                  {readOnly ? 'Click for details' : 'Click to edit'}
                </span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.body,
    );
  },
);
