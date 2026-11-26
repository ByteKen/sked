import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { computeTaskStats, flattenTasks, isTaskCompleted } from '@/domain/taskTree';
import {
  buildTimelineColumns,
  calculateAutoFitZoom,
  calculateTaskBarGeometry,
  calculateTimelineRange,
  calculateTodayOffsetPx,
  clampTimelineZoom,
  computeAnchoredScrollLeft,
  getDisplayDays,
  getPixelsPerDay,
  getTodayLocal,
  type TaskBarGeometry,
} from '@/domain/timeline';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useResizablePane } from '@/hooks/useResizablePane';
import { useSyncedScroll } from '@/hooks/useSyncedScroll';
import { useTimelineZoomGestures } from '@/hooks/useTimelineZoomGestures';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type {
  FlatTask,
  SharedChartViewPrefs,
  Task,
  TimelineGranularity,
} from '@/types';
import { cn } from '@/utils/cn';
import { BarTooltip, type BarTooltipHandle } from './BarTooltip';
import { DependencyLayer } from './DependencyLayer';
import { GanttToolbar, type StatusFilter } from './GanttToolbar';
import { getRowHeightPx } from './ganttStyles';
import { TaskTreePane } from './TaskTreePane';
import { TimelineBars } from './TimelineBars';
import { TimelineGrid } from './TimelineGrid';
import { TimelineHeader } from './TimelineHeader';

const HEADER_HEIGHT = 50;
const EMPTY_COLLAPSED_MAP: Record<number, boolean> = {};

export interface GanttWorkspaceHandle {
  getGranularity: () => TimelineGranularity;
  scrollToToday: () => void;
  autoFit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

export interface GanttWorkspaceProps {
  tasks: readonly Task[];
  selectedTaskId: number | null;
  onSelectTask: (taskId: number | null) => void;
  onTaskActivate: (task: FlatTask) => void;
  onToggleCollapse?: (taskId: number) => void;
  onSetAllCollapsed?: (collapsed: boolean) => void;
  onToggleSubtaskDone?: (taskId: number) => void;
  onAddSubtask?: (parentId: number) => void;
  onDeleteTask?: (taskId: number) => void;
  onExpandedChange?: (expanded: boolean) => void;
  readOnly?: boolean;
  viewPrefsOverride?: SharedChartViewPrefs;
  mobileView?: 'chart' | 'list';
}

function filterTreeByStatus(tasks: readonly Task[], filter: StatusFilter): Task[] {
  if (filter === 'all') return [...tasks];
  const result: Task[] = [];
  for (const task of tasks) {
    const children = task.children ? filterTreeByStatus(task.children, filter) : [];
    const done = isTaskCompleted(task);
    const selfMatches = filter === 'done' ? done : !done;
    if (selfMatches || children.length > 0) {
      result.push({ ...task, children });
    }
  }
  return result;
}

export const GanttWorkspace = forwardRef<GanttWorkspaceHandle, GanttWorkspaceProps>(
  function GanttWorkspace(
    {
      tasks,
      selectedTaskId,
      onSelectTask,
      onTaskActivate,
      onToggleCollapse,
      onSetAllCollapsed,
      onToggleSubtaskDone,
      onAddSubtask,
      onDeleteTask,
      onExpandedChange,
      readOnly = false,
      viewPrefsOverride,
      mobileView = 'chart',
    },
    ref,
  ) {
    const useRoundedSubtasks = usePreferencesStore((s) => s.useRoundedSubtasks);
    const taskLabelPosition = usePreferencesStore((s) => s.taskLabelPosition);
    const subtaskLabelPosition = usePreferencesStore((s) => s.subtaskLabelPosition);
    const barHeight = usePreferencesStore((s) => s.barHeight);
    const showDependencyLines = usePreferencesStore((s) => s.showDependencyLines);
    const showSubtaskConnectors = usePreferencesStore((s) => s.showSubtaskConnectors);
    const storeShowTaskDescriptions = usePreferencesStore((s) => s.showTaskDescriptions);

    const useLocalDescriptionToggle = readOnly || Boolean(viewPrefsOverride);
    const [localShowDescriptions, setLocalShowDescriptions] = useState<boolean>(
      Boolean(viewPrefsOverride?.showTaskDescriptions ?? storeShowTaskDescriptions),
    );

    const viewPrefs: SharedChartViewPrefs = viewPrefsOverride ?? {
      useRoundedSubtasks,
      taskLabelPosition,
      subtaskLabelPosition,
      barHeight,
      showDependencyLines,
      showSubtaskConnectors,
      showTaskDescriptions: storeShowTaskDescriptions,
    };

    const showTaskDescriptions = useLocalDescriptionToggle
      ? localShowDescriptions
      : storeShowTaskDescriptions;

    const handleToggleTaskDescriptions = useCallback(() => {
      if (useLocalDescriptionToggle) {
        setLocalShowDescriptions((prev) => !prev);
        return;
      }
      const prefStore = usePreferencesStore.getState();
      prefStore.toggleShowTaskDescriptions();
      const { currentWorkspaceId, syncSharedPreferences } = useWorkspaceStore.getState();
      if (currentWorkspaceId) {
        void syncSharedPreferences(currentWorkspaceId, prefStore.getPreferencesSnapshot());
      }
    }, [useLocalDescriptionToggle]);

    const handleSelectTask = useCallback(
      (id: number) => {
        onSelectTask(id);
      },
      [onSelectTask],
    );

    const isMobile = useMediaQuery('(max-width: 767px)');
    const [granularity, setGranularity] = useState<TimelineGranularity>('days');
    const [zoom, setZoom] = useState(1);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [isExpandedView, setIsExpandedView] = useState(false);
    const [localCollapsed, setLocalCollapsed] = useState<Record<number, boolean>>({});

    // Imperative refs for zero-rerender hover synchronization & floating tooltip
    const tooltipRef = useRef<BarTooltipHandle | null>(null);
    const hoverHighlightRef = useRef<HTMLDivElement | null>(null);
    const lastHoveredRowRef = useRef<number | null>(null);

    const { width: paneWidth, isDragging, handlePointerDown, resetWidth } = useResizablePane({
      storageKey: 'gantt_tree_pane_width',
      defaultWidth: 300,
      minWidth: 220,
      maxWidth: 480,
    });

    const { leftRef, rightRef, claimLeft, claimRight, handleLeftScroll, handleRightScroll } =
      useSyncedScroll();

    const rowHeight = getRowHeightPx(
      viewPrefs.barHeight,
      viewPrefs.taskLabelPosition,
      viewPrefs.subtaskLabelPosition,
      showTaskDescriptions,
    );

    const statusFilteredTasks = useMemo(
      () => filterTreeByStatus(tasks, statusFilter),
      [tasks, statusFilter],
    );

    const allFlatTasks = useMemo(() => flattenTasks(tasks), [tasks]);
    const stats = useMemo(() => computeTaskStats(tasks), [tasks]);

    const visibleTasks = useMemo(
      () =>
        flattenTasks(statusFilteredTasks, {
          respectCollapsed: true,
          collapsedOverrides: readOnly ? localCollapsed : undefined,
        }),
      [statusFilteredTasks, readOnly, localCollapsed],
    );

    const selectedRowIndex = useMemo(() => {
      if (selectedTaskId === null) return -1;
      return visibleTasks.findIndex((t) => t.id === selectedTaskId);
    }, [visibleTasks, selectedTaskId]);

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

    const handleToggleCollapse = useCallback(
      (taskId: number) => {
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
      },
      [readOnly, onToggleCollapse, allFlatTasks],
    );

    const handleToggleCollapseAll = useCallback(() => {
      const nextCollapsed = !allCollapsed;
      if (readOnly || !onSetAllCollapsed) {
        const nextMap: Record<number, boolean> = {};
        parentIds.forEach((id) => {
          nextMap[id] = nextCollapsed;
        });
        setLocalCollapsed(nextMap);
      } else {
        onSetAllCollapsed(nextCollapsed);
      }
    }, [allCollapsed, readOnly, onSetAllCollapsed, parentIds]);

    // Zero-rerender GPU hover highlight across both panes
    const handleHoverRowIndex = useCallback(
      (rowIndex: number | null) => {
        const prev = lastHoveredRowRef.current;
        if (prev === rowIndex) return;
        lastHoveredRowRef.current = rowIndex;

        // Sync tree row data attribute
        if (leftRef.current) {
          if (prev !== null) {
            const prevEl = leftRef.current.querySelector<HTMLElement>(`[data-tree-row="${prev}"]`);
            if (prevEl) delete prevEl.dataset.rowHovered;
          }
          if (rowIndex !== null) {
            const nextEl = leftRef.current.querySelector<HTMLElement>(
              `[data-tree-row="${rowIndex}"]`,
            );
            if (nextEl) nextEl.dataset.rowHovered = 'true';
          }
        }

        // Sync right timeline GPU overlay band via transform (no layout reflow)
        const band = hoverHighlightRef.current;
        if (band) {
          if (rowIndex === null) {
            band.style.opacity = '0';
          } else {
            band.style.transform = `translateY(${rowIndex * rowHeight}px)`;
            band.style.opacity = '1';
          }
        }
      },
      [leftRef, rowHeight],
    );

    const handleBarHover = useCallback(
      (task: FlatTask, durationDays: number, rect: DOMRect, rowIndex: number) => {
        handleHoverRowIndex(rowIndex);
        tooltipRef.current?.show(task, durationDays, rect);
      },
      [handleHoverRowIndex],
    );

    const handleBarLeave = useCallback(() => {
      tooltipRef.current?.hide();
      handleHoverRowIndex(null);
    }, [handleHoverRowIndex]);

    // Timeline math computed ONCE per view change
    const range = useMemo(
      () => calculateTimelineRange(allFlatTasks, granularity),
      [allFlatTasks, granularity],
    );
    const pixelsPerDay = useMemo(() => getPixelsPerDay(granularity, zoom), [granularity, zoom]);
    const displayDays = useMemo(
      () => getDisplayDays(range.days, granularity, zoom),
      [range.days, granularity, zoom],
    );
    const columns = useMemo(
      () => buildTimelineColumns(range.startDate, displayDays, granularity, pixelsPerDay),
      [range.startDate, displayDays, granularity, pixelsPerDay],
    );

    // Pre-computed bar geometries shared by BOTH TimelineBars and DependencyLayer
    const barGeometries = useMemo(() => {
      const map = new Map<number, TaskBarGeometry>();
      for (const task of visibleTasks) {
        map.set(task.id, calculateTaskBarGeometry(task, range.startDate, pixelsPerDay, 28));
      }
      return map;
    }, [visibleTasks, range.startDate, pixelsPerDay]);

    const totalWidth = useMemo(
      () => columns.reduce((acc, col) => acc + col.widthPx, 0),
      [columns],
    );
    const totalHeight = Math.max(visibleTasks.length * rowHeight, 120);

    const todayOffsetPx = useMemo(() => {
      const today = getTodayLocal();
      const offset = calculateTodayOffsetPx(range.startDate, pixelsPerDay, today);
      if (offset < 0 || offset > totalWidth) return null;
      return offset;
    }, [range.startDate, pixelsPerDay, totalWidth]);

    const pendingZoomAnchorRef = useRef<{
      prevScrollLeft: number;
      prevZoom: number;
      anchorOffsetPx: number;
    } | null>(null);

    const applyZoomAtAnchor = useCallback(
      (rawNextZoom: number, anchorOffsetPx?: number) => {
        const nextZoom = clampTimelineZoom(rawNextZoom);
        setZoom((prevZoom) => {
          if (Math.abs(nextZoom - prevZoom) < 0.005) return prevZoom;
          const container = rightRef.current;
          if (container && !pendingZoomAnchorRef.current) {
            pendingZoomAnchorRef.current = {
              prevScrollLeft: container.scrollLeft,
              prevZoom,
              anchorOffsetPx:
                anchorOffsetPx !== undefined ? anchorOffsetPx : container.clientWidth / 2,
            };
          }
          return nextZoom;
        });
      },
      [rightRef],
    );

    useLayoutEffect(() => {
      const pending = pendingZoomAnchorRef.current;
      const container = rightRef.current;
      if (!pending || !container) return;
      pendingZoomAnchorRef.current = null;

      container.scrollLeft = computeAnchoredScrollLeft({
        prevScrollLeft: pending.prevScrollLeft,
        prevZoom: pending.prevZoom,
        nextZoom: zoom,
        anchorOffsetPx: pending.anchorOffsetPx,
      });
    }, [zoom, rightRef]);

    const handleZoomIn = useCallback(() => {
      applyZoomAtAnchor(zoom + 0.25);
    }, [applyZoomAtAnchor, zoom]);

    const handleZoomOut = useCallback(() => {
      applyZoomAtAnchor(zoom - 0.25);
    }, [applyZoomAtAnchor, zoom]);

    const handleResetZoom = useCallback(() => {
      applyZoomAtAnchor(1);
    }, [applyZoomAtAnchor]);

    const handleScrollToToday = useCallback(() => {
      const container = rightRef.current;
      if (!container || todayOffsetPx === null) return;
      const targetLeft = Math.max(0, todayOffsetPx - container.clientWidth / 2);
      container.scrollTo({ left: targetLeft, behavior: 'smooth' });
    }, [rightRef, todayOffsetPx]);

    const handleAutoFit = useCallback(() => {
      const container = rightRef.current;
      const availableWidth = container ? container.clientWidth - 48 : 900;
      const nextZoom = calculateAutoFitZoom(allFlatTasks, availableWidth, granularity);
      setZoom(nextZoom);
    }, [rightRef, allFlatTasks, granularity]);

    const handleToggleExpandedView = useCallback(() => {
      setIsExpandedView((prev) => {
        const next = !prev;
        onExpandedChange?.(next);
        return next;
      });
    }, [onExpandedChange]);

    useImperativeHandle(
      ref,
      () => ({
        getGranularity: () => granularity,
        scrollToToday: handleScrollToToday,
        autoFit: handleAutoFit,
        zoomIn: handleZoomIn,
        zoomOut: handleZoomOut,
        resetZoom: handleResetZoom,
      }),
      [
        granularity,
        handleScrollToToday,
        handleAutoFit,
        handleZoomIn,
        handleZoomOut,
        handleResetZoom,
      ],
    );

    const showTreePane = !isMobile || mobileView === 'list';
    const showTimelinePane = !isMobile || mobileView === 'chart';

    useTimelineZoomGestures({
      containerRef: rightRef,
      zoom,
      active: showTimelinePane,
      onZoomAtAnchor: applyZoomAtAnchor,
    });

    return (
      <div
        className={cn(
          'relative isolate flex flex-col bg-white dark:bg-surface-dark border border-slate-300/80 dark:border-white/10 overflow-hidden shadow-surface-md dark:shadow-dark-md',
          isExpandedView ? 'rounded-none border-0 min-h-screen' : 'h-full rounded-none md:rounded-2xl',
          isDragging && 'select-none',
        )}
      >
        <GanttToolbar
          stats={stats}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          granularity={granularity}
          onGranularityChange={setGranularity}
          zoom={zoom}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onResetZoom={handleResetZoom}
          onAutoFit={handleAutoFit}
          onScrollToToday={handleScrollToToday}
          isExpandedView={isExpandedView}
          onToggleExpandedView={handleToggleExpandedView}
          showTaskDescriptions={showTaskDescriptions}
          onToggleTaskDescriptions={handleToggleTaskDescriptions}
          hasCollapsibleParents={parentIds.length > 0}
          allCollapsed={allCollapsed}
          onToggleCollapseAll={handleToggleCollapseAll}
          isMobile={isMobile}
        />

        {/* Unified Split Pane: Synchronized Task Tree + Gantt Timeline */}
        <div
          className={cn(
            'flex flex-1 min-h-0',
            isExpandedView ? 'overflow-x-auto' : 'overflow-hidden',
          )}
        >
          {showTreePane && (
            <TaskTreePane
              ref={leftRef}
              visibleTasks={visibleTasks}
              width={paneWidth}
              headerHeight={HEADER_HEIGHT}
              rowHeight={rowHeight}
              collapsedMap={readOnly ? localCollapsed : EMPTY_COLLAPSED_MAP}
              selectedTaskId={selectedTaskId}
              showTaskDescriptions={showTaskDescriptions}
              readOnly={readOnly}
              isExpandedView={isExpandedView}
              fullWidth={isMobile && mobileView === 'list'}
              hasCollapsibleParents={parentIds.length > 0}
              allCollapsed={allCollapsed}
              onToggleCollapseAll={handleToggleCollapseAll}
              onScroll={handleLeftScroll}
              onClaimScroll={claimLeft}
              onSelectTask={handleSelectTask}
              onHoverRowIndex={handleHoverRowIndex}
              onToggleCollapse={handleToggleCollapse}
              onToggleSubtaskDone={onToggleSubtaskDone}
              onEditTask={onTaskActivate}
              onAddSubtask={onAddSubtask}
              onDeleteTask={onDeleteTask}
            />
          )}

          {/* Resizable Split Handle (Desktop) */}
          {!isMobile && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize task hierarchy panel"
              title="Drag to resize · Double-click to reset"
              onPointerDown={handlePointerDown}
              onDoubleClick={resetWidth}
              className={cn(
                'w-1.5 -ml-[3px] shrink-0 cursor-col-resize transition-colors relative z-20',
                isDragging
                  ? 'bg-brand-500'
                  : 'bg-transparent hover:bg-brand-500/45 active:bg-brand-500',
              )}
            />
          )}

          {showTimelinePane && (
            <div
              ref={rightRef}
              data-testid="timeline-viewport"
              onScroll={handleRightScroll}
              onWheel={claimRight}
              onTouchStart={claimRight}
              onPointerDown={claimRight}
              style={{ touchAction: 'pan-x pan-y' }}
              className={cn(
                'flex-1 min-w-0 bg-white dark:bg-canvas-dark overscroll-contain [overflow-anchor:none]',
                isExpandedView ? '' : 'overflow-auto',
              )}
            >
              <div
                style={{
                  width: `${totalWidth}px`,
                  minHeight: `${totalHeight + HEADER_HEIGHT + (isExpandedView || readOnly ? 16 : 96)}px`,
                }}
              >
                {/* Opaque z-30 Sticky Date Header (bars sit at z-10 and scroll cleanly underneath!) */}
                <TimelineHeader
                  columns={columns}
                  headerHeight={HEADER_HEIGHT}
                  todayOffsetPx={todayOffsetPx}
                  showMonthMarkers={granularity === 'days'}
                />

                {/* Timeline Body with strict stacking isolation */}
                <div className="relative isolate" style={{ height: `${totalHeight}px` }}>
                  <TimelineGrid
                    columns={columns}
                    granularity={granularity}
                    visibleTasks={visibleTasks}
                    rowHeight={rowHeight}
                    selectedRowIndex={selectedRowIndex}
                    todayOffsetPx={todayOffsetPx}
                    onSelectTask={handleSelectTask}
                    onHoverRowIndex={handleHoverRowIndex}
                  />

                  {/* Zero-rerender GPU row hover band */}
                  <div
                    ref={hoverHighlightRef}
                    aria-hidden="true"
                    style={{ height: `${rowHeight}px`, opacity: 0 }}
                    className="pointer-events-none absolute left-0 right-0 top-0 z-[2] bg-brand-500/[0.06] dark:bg-brand-400/[0.09] transition-opacity duration-75 will-change-transform"
                  />

                  <DependencyLayer
                    visibleTasks={visibleTasks}
                    barGeometries={barGeometries}
                    rowHeight={rowHeight}
                    barHeight={viewPrefs.barHeight}
                    taskLabelPosition={viewPrefs.taskLabelPosition}
                    subtaskLabelPosition={viewPrefs.subtaskLabelPosition}
                    showDependencyLines={viewPrefs.showDependencyLines}
                    showSubtaskConnectors={viewPrefs.showSubtaskConnectors}
                    showTaskDescriptions={showTaskDescriptions}
                    totalWidth={totalWidth}
                    totalHeight={totalHeight}
                  />

                  <TimelineBars
                    visibleTasks={visibleTasks}
                    barGeometries={barGeometries}
                    rowHeight={rowHeight}
                    barHeight={viewPrefs.barHeight}
                    useRoundedSubtasks={viewPrefs.useRoundedSubtasks}
                    taskLabelPosition={viewPrefs.taskLabelPosition}
                    subtaskLabelPosition={viewPrefs.subtaskLabelPosition}
                    showTaskDescriptions={showTaskDescriptions}
                    selectedTaskId={selectedTaskId}
                    onSelectTask={handleSelectTask}
                    onTaskActivate={onTaskActivate}
                    onBarHover={handleBarHover}
                    onBarLeave={handleBarLeave}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Floating portal bar tooltip (zero parent re-renders) */}
        <BarTooltip ref={tooltipRef} readOnly={readOnly} />
      </div>
    );
  },
);
