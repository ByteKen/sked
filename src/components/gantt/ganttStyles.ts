import type { BarHeightMode, SubtaskLabelPosition, TaskLabelPosition, TaskStatus } from '@/types';

export const BAR_HEIGHT_PX: Record<BarHeightMode, number> = {
  compact: 22,
  normal: 28,
  large: 36,
};

export const DESCRIPTION_EXTRA_HEIGHT_PX = 18;

export function getRowHeightPx(
  barHeight: BarHeightMode,
  taskLabelPosition: TaskLabelPosition,
  subtaskLabelPosition: SubtaskLabelPosition,
  showTaskDescriptions = false,
): number {
  const barPx = BAR_HEIGHT_PX[barHeight];
  const hasTopLabel = taskLabelPosition === 'top' || subtaskLabelPosition === 'top';
  return barPx + (hasTopLabel ? 28 : 22) + (showTaskDescriptions ? DESCRIPTION_EXTRA_HEIGHT_PX : 0);
}

/**
 * Shared bar vertical center helper used identically by TimelineBars and DependencyLayer
 * so arrows & subtask connectors stay pixel-aligned whether descriptions are shown or hidden.
 */
export function getBarCenterY(
  rowHeight: number,
  barHeightPx: number,
  isTopLabel: boolean,
  showTaskDescriptions = false,
): number {
  const usableHeight = showTaskDescriptions ? rowHeight - DESCRIPTION_EXTRA_HEIGHT_PX : rowHeight;
  return isTopLabel ? usableHeight - barHeightPx / 2 - 4 : usableHeight / 2;
}

export const STATUS_BAR_STYLES: Record<
  TaskStatus,
  {
    bgClass: string;
    phaseBgClass: string;
    diamondClass: string;
    dotClass: string;
    label: string;
  }
> = {
  completed: {
    bgClass:
      'bg-gradient-to-b from-emerald-500 to-emerald-600 hover:brightness-105 border border-emerald-700/30 dark:from-emerald-500 dark:to-emerald-600 dark:border-emerald-300/20',
    phaseBgClass:
      'bg-gradient-to-r from-emerald-700 via-emerald-600 to-emerald-500 border border-emerald-900/30 dark:from-emerald-600 dark:via-emerald-500 dark:to-emerald-500/90',
    diamondClass: 'bg-emerald-500 border border-emerald-700/40',
    dotClass: 'bg-emerald-500',
    label: 'Completed',
  },
  working: {
    bgClass:
      'bg-gradient-to-b from-amber-400 to-amber-500 hover:brightness-105 border border-amber-700/30 dark:from-amber-400 dark:to-amber-600 dark:border-amber-200/25',
    phaseBgClass:
      'bg-gradient-to-r from-amber-600 via-amber-500 to-amber-500/90 border border-amber-800/30',
    diamondClass: 'bg-amber-500 border border-amber-700/40',
    dotClass: 'bg-amber-500',
    label: 'Working Now',
  },
  'in-progress': {
    bgClass:
      'bg-gradient-to-b from-brand-500 to-brand-600 hover:brightness-105 border border-brand-800/35 dark:from-brand-500 dark:to-brand-600 dark:border-brand-300/25',
    phaseBgClass:
      'bg-gradient-to-r from-brand-700 via-brand-600 to-brand-500 border border-brand-900/35 dark:from-brand-600 dark:via-brand-500 dark:to-brand-400/90',
    diamondClass: 'bg-brand-600 border border-brand-800/40',
    dotClass: 'bg-brand-500',
    label: 'In Progress',
  },
  'not-started': {
    bgClass:
      'bg-gradient-to-b from-slate-500 to-slate-600 hover:brightness-105 border border-slate-800/25 dark:from-slate-600 dark:to-slate-700 dark:border-white/10',
    phaseBgClass:
      'bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 border border-slate-800/35 dark:from-slate-700 dark:via-slate-600 dark:to-slate-600',
    diamondClass: 'bg-slate-500 border border-slate-700/40',
    dotClass: 'bg-slate-400 dark:bg-slate-500',
    label: 'Not Started',
  },
};
