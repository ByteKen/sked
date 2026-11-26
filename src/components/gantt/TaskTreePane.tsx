import { forwardRef, memo } from 'react';
import { ArrowsInLineVertical, ArrowsOutLineVertical } from '@phosphor-icons/react';
import type { FlatTask } from '@/types';
import { cn } from '@/utils/cn';
import { TaskTreeRow } from './TaskTreeRow';

export interface TaskTreePaneProps {
  visibleTasks: readonly FlatTask[];
  width: number;
  headerHeight: number;
  rowHeight: number;
  collapsedMap: Record<number, boolean>;
  selectedTaskId: number | null;
  showTaskDescriptions: boolean;
  readOnly: boolean;
  isExpandedView: boolean;
  fullWidth?: boolean;
  hasCollapsibleParents?: boolean;
  allCollapsed?: boolean;
  onToggleCollapseAll?: () => void;
  onScroll?: () => void;
  onClaimScroll?: () => void;
  onSelectTask: (taskId: number) => void;
  onHoverRowIndex: (rowIndex: number | null) => void;
  onToggleCollapse: (taskId: number) => void;
  onToggleSubtaskDone?: (taskId: number) => void;
  onEditTask?: (task: FlatTask) => void;
  onAddSubtask?: (parentId: number) => void;
  onDeleteTask?: (taskId: number) => void;
}

export const TaskTreePane = memo(
  forwardRef<HTMLDivElement, TaskTreePaneProps>(function TaskTreePane(
    {
      visibleTasks,
      width,
      headerHeight,
      rowHeight,
      collapsedMap,
      selectedTaskId,
      showTaskDescriptions,
      readOnly,
      isExpandedView,
      fullWidth = false,
      hasCollapsibleParents = false,
      allCollapsed = false,
      onToggleCollapseAll,
      onScroll,
      onClaimScroll,
      onSelectTask,
      onHoverRowIndex,
      onToggleCollapse,
      onToggleSubtaskDone,
      onEditTask,
      onAddSubtask,
      onDeleteTask,
    },
    ref,
  ) {
    const isCompact = !fullWidth && width < 245;

    return (
      <div
        className={cn(
          'flex flex-col shrink-0 bg-white dark:bg-surface-dark border-r border-slate-200/90 dark:border-white/[0.08]',
          isExpandedView && 'sticky left-0 z-20',
          fullWidth && 'w-full border-r-0',
        )}
        style={fullWidth ? undefined : { width: `${width}px` }}
      >
        {/* Column Header (matches TimelineHeader height & surface pixel-for-pixel) */}
        <div
          style={{ height: headerHeight }}
          className="flex items-center justify-between gap-2 px-3.5 border-b border-slate-200/90 dark:border-white/[0.08] bg-[#F4F6FA] dark:bg-[#10131C] shadow-[0_2px_10px_-3px_rgba(9,11,16,0.08)] dark:shadow-[0_3px_12px_-3px_rgba(0,0,0,0.5)] shrink-0 z-10"
        >
          <div
            className={cn(
              'flex items-center gap-2 min-w-0',
              !(fullWidth && hasCollapsibleParents && onToggleCollapseAll) &&
                'flex-1 justify-between',
            )}
          >
            <span className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-slate-600 dark:text-slate-300 truncate">
              Task Hierarchy
            </span>
            {!isCompact && (
              <span className="text-[11px] font-mono font-medium px-1.5 py-0.5 rounded bg-slate-200/75 dark:bg-white/[0.06] text-slate-600 dark:text-slate-400 tabular-nums shrink-0">
                {visibleTasks.length} rows
              </span>
            )}
          </div>

          {fullWidth && hasCollapsibleParents && onToggleCollapseAll && (
            <button
              type="button"
              onClick={onToggleCollapseAll}
              title={allCollapsed ? 'Expand all groups' : 'Collapse all groups'}
              aria-label={allCollapsed ? 'Expand all groups' : 'Collapse all groups'}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] font-semibold border border-slate-200/90 dark:border-white/[0.1] bg-white dark:bg-surface-elevated text-slate-700 dark:text-slate-200 hover:text-brand-600 dark:hover:text-brand-400 hover:border-brand-300 dark:hover:border-brand-400/35 shadow-surface-sm transition-colors cursor-pointer shrink-0"
            >
              {allCollapsed ? (
                <>
                  <ArrowsOutLineVertical
                    weight="duotone"
                    className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400"
                  />
                  <span>Expand all</span>
                </>
              ) : (
                <>
                  <ArrowsInLineVertical
                    weight="duotone"
                    className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400"
                  />
                  <span>Collapse all</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Synchronized scrollable rows */}
        <div
          ref={ref}
          onScroll={onScroll}
          onWheel={onClaimScroll}
          onTouchStart={onClaimScroll}
          onPointerDown={onClaimScroll}
          className={cn(
            isExpandedView
              ? ''
              : cn(
                  'flex-1 overflow-y-auto overflow-x-hidden overscroll-contain [overflow-anchor:none]',
                  readOnly ? 'pb-4' : 'pb-24',
                ),
          )}
        >
          {visibleTasks.map((task, idx) => {
            const isCollapsed = Object.prototype.hasOwnProperty.call(collapsedMap, task.id)
              ? Boolean(collapsedMap[task.id])
              : Boolean(task.collapsed);

            return (
              <TaskTreeRow
                key={task.id}
                task={task}
                rowIndex={idx}
                rowHeight={rowHeight}
                isCollapsed={isCollapsed}
                isSelected={selectedTaskId === task.id}
                readOnly={readOnly}
                compact={isCompact}
                showTaskDescriptions={showTaskDescriptions}
                onSelect={onSelectTask}
                onHoverRowIndex={onHoverRowIndex}
                onToggleCollapse={onToggleCollapse}
                onToggleSubtaskDone={onToggleSubtaskDone}
                onEdit={onEditTask}
                onAddSubtask={onAddSubtask}
                onDelete={onDeleteTask}
              />
            );
          })}
        </div>
      </div>
    );
  }),
);
