import { memo, useMemo } from 'react';
import { routeDependencyArrow, type RoutableBarNode } from '@/domain/dependencyRouting';
import { isTaskDeadline } from '@/domain/taskTree';
import type { TaskBarGeometry } from '@/domain/timeline';
import type {
  BarHeightMode,
  FlatTask,
  SubtaskLabelPosition,
  TaskLabelPosition,
} from '@/types';
import { BAR_HEIGHT_PX, getBarCenterY } from './ganttStyles';

export interface DependencyLayerProps {
  visibleTasks: readonly FlatTask[];
  barGeometries: ReadonlyMap<number, TaskBarGeometry>;
  rowHeight: number;
  barHeight: BarHeightMode;
  taskLabelPosition: TaskLabelPosition;
  subtaskLabelPosition: SubtaskLabelPosition;
  showDependencyLines: boolean;
  showSubtaskConnectors: boolean;
  showTaskDescriptions: boolean;
  showCriticalPath?: boolean;
  criticalEdgeKeys?: ReadonlySet<string>;
  totalWidth: number;
  totalHeight: number;
}

interface IndexedNode extends RoutableBarNode {
  task: FlatTask;
  width: number;
}

export const DependencyLayer = memo(function DependencyLayer({
  visibleTasks,
  barGeometries,
  rowHeight,
  barHeight,
  taskLabelPosition,
  subtaskLabelPosition,
  showDependencyLines,
  showSubtaskConnectors,
  showTaskDescriptions,
  showCriticalPath = false,
  criticalEdgeKeys,
  totalWidth,
  totalHeight,
}: DependencyLayerProps) {
  const barHeightPx = BAR_HEIGHT_PX[barHeight];

  const { depPaths, subtaskPaths } = useMemo(() => {
    const nodeMap = new Map<number, IndexedNode>();
    const allNodes: IndexedNode[] = [];

    visibleTasks.forEach((task, rowIndex) => {
      const geom = barGeometries.get(task.id);
      if (!geom) return;
      const isSub = task.isSubtask || isTaskDeadline(task);
      const labelPos = isSub ? subtaskLabelPosition : taskLabelPosition;
      const centerY =
        rowIndex * rowHeight +
        getBarCenterY(rowHeight, barHeightPx, labelPos === 'top', showTaskDescriptions);
      const right = geom.left + geom.width;
      const deadline = isTaskDeadline(task);
      const progressSuffixLen = task.progress > 0 && !deadline ? String(task.progress).length + 3 : 0;
      const outsideLabelWidth =
        labelPos === 'outside'
          ? 8 + Math.min(210, (task.name.length + progressSuffixLen) * 6.8 + 10)
          : 0;
      const topLabelRight =
        labelPos === 'top'
          ? geom.left + Math.min(240, (task.name.length + progressSuffixLen) * 6.5 + 10)
          : right;
      const descRight =
        showTaskDescriptions && task.description
          ? geom.left + Math.min(Math.max(geom.width, 280), task.description.length * 6.2 + 12)
          : right;
      const labelRight = Math.max(right + outsideLabelWidth, topLabelRight, descRight);

      const node: IndexedNode = {
        id: task.id,
        rowIndex,
        task,
        left: geom.left,
        right,
        labelRight,
        width: geom.width,
        centerY,
      };
      nodeMap.set(task.id, node);
      allNodes.push(node);
    });

    const computedDeps: Array<{
      key: string;
      edgeKey: string;
      d: string;
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
    }> = [];

    if (showDependencyLines) {
      const sourceLaneCounts = new Map<number, number>();
      const targetLaneCounts = new Map<number, number>();

      visibleTasks.forEach((task) => {
        if (!task.dependencies?.length) return;
        const target = nodeMap.get(task.id);
        if (!target) return;

        task.dependencies.forEach((depId) => {
          const source = nodeMap.get(depId);
          if (!source) return;

          const sourceLaneIndex = sourceLaneCounts.get(depId) ?? 0;
          sourceLaneCounts.set(depId, sourceLaneIndex + 1);

          const targetLaneIndex = targetLaneCounts.get(task.id) ?? 0;
          targetLaneCounts.set(task.id, targetLaneIndex + 1);

          const routed = routeDependencyArrow({
            source,
            target,
            allNodes,
            rowHeight,
            sourceLaneIndex,
            targetLaneIndex,
            cornerRadius: 6,
            arrowTipInset: 5,
          });

          computedDeps.push({
            key: `dep-${depId}-${task.id}`,
            edgeKey: `${depId}->${task.id}`,
            d: routed.svgPath,
            fromX: source.right,
            fromY: source.centerY,
            toX: target.left,
            toY: target.centerY,
          });
        });
      });
    }

    const computedConnectors: Array<{ key: string; d: string }> = [];
    if (showSubtaskConnectors) {
      visibleTasks.forEach((task) => {
        if (!task.children?.length) return;
        const parentNode = nodeMap.get(task.id);
        if (!parentNode) return;

        const elbowX = parentNode.left - 10;
        task.children.forEach((child) => {
          const childNode = nodeMap.get(child.id);
          if (!childNode) return;
          const d = `M ${parentNode.left} ${parentNode.centerY} H ${elbowX} V ${childNode.centerY} H ${childNode.left}`;
          computedConnectors.push({ key: `sub-${task.id}-${child.id}`, d });
        });
      });
    }

    return { depPaths: computedDeps, subtaskPaths: computedConnectors };
  }, [
    visibleTasks,
    barGeometries,
    rowHeight,
    barHeightPx,
    taskLabelPosition,
    subtaskLabelPosition,
    showDependencyLines,
    showSubtaskConnectors,
    showTaskDescriptions,
  ]);

  if (depPaths.length === 0 && subtaskPaths.length === 0) {
    return null;
  }

  return (
    <svg
      aria-hidden="true"
      width={totalWidth}
      height={totalHeight}
      className="pointer-events-none absolute top-0 left-0 z-[5] overflow-visible"
    >
      {subtaskPaths.map((conn) => (
        <path
          key={conn.key}
          d={conn.d}
          fill="none"
          className="stroke-slate-300 dark:stroke-slate-700"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      {depPaths.map((dep) => {
        const isCriticalEdge = Boolean(showCriticalPath && criticalEdgeKeys?.has(dep.edgeKey));
        const dimmed = Boolean(showCriticalPath && !isCriticalEdge);
        return (
          <g key={dep.key} opacity={dimmed ? 0.25 : 1}>
            <path
              d={dep.d}
              fill="none"
              className={
                isCriticalEdge
                  ? 'stroke-rose-500 dark:stroke-rose-400'
                  : 'stroke-brand-500/80 dark:stroke-brand-400/85'
              }
              strokeWidth={isCriticalEdge ? '2.3' : '1.75'}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle
              cx={dep.fromX}
              cy={dep.fromY}
              r={isCriticalEdge ? '3.5' : '3'}
              className={
                isCriticalEdge
                  ? 'fill-rose-600 dark:fill-rose-400'
                  : 'fill-brand-600 dark:fill-brand-400'
              }
            />
            <polygon
              points={`${dep.toX},${dep.toY} ${dep.toX - 7},${dep.toY - 4} ${dep.toX - 7},${dep.toY + 4}`}
              className={
                isCriticalEdge
                  ? 'fill-rose-600 dark:fill-rose-400'
                  : 'fill-brand-600 dark:fill-brand-400'
              }
            />
          </g>
        );
      })}
    </svg>
  );
});
