import { forwardRef, useImperativeHandle, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { getTaskStatus } from '@/domain/taskTree';
import type { DueUrgency } from '@/domain/taskViews';
import { formatDateRange } from '@/domain/timeline';
import type { FlatTask, TaskBaselineEntry } from '@/types';
import { cn } from '@/utils/cn';
import { SPRING_SNAPPY } from '@/utils/motion';
import { STATUS_BAR_STYLES } from './ganttStyles';

export interface BarTooltipMeta {
  isCritical?: boolean;
  slackDays?: number | null;
  baselineEntry?: TaskBaselineEntry | null;
  slipDays?: number | null;
  dueUrgency?: DueUrgency;
  daysUntilDue?: number;
}

function getTooltipDueCountdown(
  urgency?: DueUrgency,
  daysUntilDue?: number,
): { label: string; className: string } | null {
  if (!urgency || typeof daysUntilDue !== 'number' || urgency === 'completed') {
    return null;
  }
  if (urgency === 'overdue') {
    return {
      label: `${Math.abs(daysUntilDue)}d overdue`,
      className:
        'bg-rose-100 text-rose-700 border-rose-200/80 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/30',
    };
  }
  if (urgency === 'today') {
    return {
      label: 'Due today',
      className:
        'bg-amber-100 text-amber-800 border-amber-200/80 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-400/30',
    };
  }
  if (urgency === 'soon') {
    return {
      label: `${daysUntilDue}d left`,
      className:
        'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-400/25',
    };
  }
  return {
    label: `${daysUntilDue}d left`,
    className:
      'bg-slate-100 text-slate-600 border-slate-200/80 dark:bg-white/[0.07] dark:text-slate-300 dark:border-white/[0.1]',
  };
}

export interface BarTooltipHandle {
  show: (
    task: FlatTask,
    durationDays: number,
    anchorRect: DOMRect,
    meta?: BarTooltipMeta,
  ) => void;
  hide: () => void;
}

interface TooltipState {
  task: FlatTask;
  durationDays: number;
  x: number;
  y: number;
  placeBelow: boolean;
  meta?: BarTooltipMeta;
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
        show: (task, durationDays, anchorRect, meta) => {
          const placeBelow = anchorRect.top < 240;
          const clampedX = Math.max(12, Math.min(window.innerWidth - 280, anchorRect.left));
          const y = placeBelow ? anchorRect.bottom + 8 : anchorRect.top - 8;
          setState({ task, durationDays, x: clampedX, y, placeBelow, meta });
        },
        hide: () => setState(null),
      }),
      [],
    );

    const status = state ? getTaskStatus(state.task) : null;
    const style = status ? STATUS_BAR_STYLES[status] : null;
    const meta = state?.meta;
    const dueCountdown = getTooltipDueCountdown(meta?.dueUrgency, meta?.daysUntilDue);

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
              className="w-[272px] rounded-xl border border-slate-200/90 dark:border-white/[0.12] bg-white dark:bg-surface-elevated px-3.5 py-2.5 shadow-surface-lg dark:shadow-dark-lg"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-50 leading-snug line-clamp-2">
                  {state.task.name}
                </p>
                <span className="font-mono text-[11px] font-bold text-brand-600 dark:text-brand-400 shrink-0 tabular-nums">
                  {state.task.progress}%
                </span>
              </div>

              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  {formatDateRange(state.task.start, state.task.end)} · {state.durationDays}{' '}
                  {state.durationDays === 1 ? 'day' : 'days'}
                </p>
                {dueCountdown && (
                  <span
                    className={cn(
                      'shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-md border font-mono text-[10px] font-semibold tabular-nums',
                      dueCountdown.className,
                    )}
                  >
                    {dueCountdown.label}
                  </span>
                )}
              </div>

              {/* Critical Path / Slack metadata */}
              {meta && (meta.isCritical || typeof meta.slackDays === 'number') && (
                <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                  {meta.isCritical ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200/80 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/25">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      Critical Path (0d slack)
                    </span>
                  ) : typeof meta.slackDays === 'number' ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md font-mono text-[10px] font-medium bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">
                      {meta.slackDays}d float slack
                    </span>
                  ) : null}
                </div>
              )}

              {/* Baseline comparison */}
              {meta?.baselineEntry && (
                <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] font-mono bg-slate-50 dark:bg-white/[0.03] border border-slate-200/70 dark:border-white/[0.06] rounded-lg px-2 py-1">
                  <span className="text-slate-500 dark:text-slate-400 truncate">
                    Plan: {formatDateRange(meta.baselineEntry.start, meta.baselineEntry.end)}
                  </span>
                  {typeof meta.slipDays === 'number' && (
                    <span
                      className={cn(
                        'font-semibold shrink-0 tabular-nums',
                        meta.slipDays > 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : meta.slipDays < 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-500 dark:text-slate-400',
                      )}
                    >
                      {meta.slipDays > 0
                        ? `+${meta.slipDays}d slip`
                        : meta.slipDays < 0
                          ? `${Math.abs(meta.slipDays)}d ahead`
                          : 'On plan'}
                    </span>
                  )}
                </div>
              )}

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
                  {readOnly ? 'Click for details' : 'Drag to move · Click to edit'}
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
