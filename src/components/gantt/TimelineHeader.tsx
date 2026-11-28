import { memo } from 'react';
import type { TimelineColumn } from '@/domain/timeline';
import { cn } from '@/utils/cn';

export interface TimelineHeaderProps {
  columns: readonly TimelineColumn[];
  headerHeight: number;
  todayOffsetPx: number | null;
  showMonthMarkers: boolean;
  highlightWeekends?: boolean;
}

export const TimelineHeader = memo(function TimelineHeader({
  columns,
  headerHeight,
  todayOffsetPx,
  showMonthMarkers,
  highlightWeekends = true,
}: TimelineHeaderProps) {
  const lastCol = columns[columns.length - 1];
  const totalWidth = lastCol ? lastCol.leftPx + lastCol.widthPx : 0;
  const clampedTodayPillLeft =
    todayOffsetPx !== null
      ? totalWidth > 48
        ? Math.min(Math.max(todayOffsetPx, 24), totalWidth - 24)
        : todayOffsetPx
      : null;

  return (
    <div
      style={{ height: headerHeight }}
      className={cn(
        'sticky top-0 z-30 flex select-none overflow-hidden',
        'bg-[#F4F6FA] dark:bg-[#10131C]',
        'border-b border-slate-200/90 dark:border-white/[0.08]',
        'shadow-[0_2px_10px_-3px_rgba(9,11,16,0.1)] dark:shadow-[0_3px_12px_-3px_rgba(0,0,0,0.65)]',
      )}
    >
      {columns.map((col, idx) => {
        const isNewMonth =
          showMonthMarkers &&
          (idx === 0 || col.date.getDate() === 1);
        const monthShort = isNewMonth
          ? col.date.toLocaleDateString('en-US', { month: 'short' })
          : null;

        return (
          <div
            key={col.key}
            style={{ width: `${col.widthPx}px`, height: headerHeight }}
            className={cn(
              'shrink-0 relative flex flex-col items-center justify-center border-r border-slate-200/90 dark:border-white/[0.06] px-0.5',
              todayOffsetPx !== null && 'pb-3.5',
              col.isCurrent
                ? 'bg-brand-100/80 dark:bg-brand-500/18'
                : highlightWeekends && col.isWeekend
                  ? 'bg-slate-200/40 dark:bg-white/[0.02]'
                  : 'bg-transparent',
            )}
          >
            {monthShort && (
              <span className="absolute top-0.5 left-1 text-[8px] font-bold uppercase tracking-wider text-brand-700 dark:text-brand-300 leading-none pointer-events-none">
                {monthShort}
              </span>
            )}
            <span
              className={cn(
                'text-[11px] font-semibold tracking-wide leading-none',
                isNewMonth && 'mt-1.5',
                col.isCurrent
                  ? 'text-brand-700 dark:text-brand-200'
                  : highlightWeekends && col.isWeekend
                    ? 'text-slate-400 dark:text-slate-500'
                    : 'text-slate-700 dark:text-slate-200',
              )}
            >
              {col.label}
            </span>
            {col.subLabel && (
              <span
                className={cn(
                  'font-mono text-[10px] leading-none mt-1 tabular-nums',
                  col.isCurrent
                    ? 'text-brand-700 dark:text-white font-bold'
                    : 'text-slate-500 dark:text-slate-400',
                )}
              >
                {col.subLabel}
              </span>
            )}
          </div>
        );
      })}

      {/* Today indicator cleanly seated inside the header's reserved bottom strip */}
      {clampedTodayPillLeft !== null && (
        <div
          style={{ left: `${clampedTodayPillLeft}px` }}
          className="pointer-events-none absolute bottom-[2px] -translate-x-1/2 z-40 flex items-center"
        >
          <span className="inline-flex items-center h-[13px] px-1.5 rounded-full text-[8px] font-bold leading-none uppercase tracking-wider bg-brand-600 dark:bg-brand-500 text-white shadow-sm">
            Today
          </span>
        </div>
      )}
    </div>
  );
});
