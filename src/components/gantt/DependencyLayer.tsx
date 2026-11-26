import { memo, useMemo } from 'react';
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
  totalWidth: number;
  totalHeight: number;
}

interface IndexedNode {
  task: FlatTask;
  left: number;
  width: number;
  centerY: number;
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
  totalWidth,
  totalHeight,
}: DependencyLayerProps) {
  const barHeightPx = BAR_HEIGHT_PX[barHeight];

  const { depPaths, subtaskPaths } = useMemo(() => {
    const nodeMap = new Map<number, IndexedNode>();

    visibleTasks.forEach((task, rowIndex) => {
      const geom = barGeometries.get(task.id);
      if (!geom) return;
      const isSub = task.isSubtask || isTaskDeadline(task);
      const labelPos = isSub ? subtaskLabelPosition : taskLabelPosition;
      const centerY =
        rowIndex * rowHeight +
        getBarCenterY(rowHeight, barHeightPx, labelPos === 'top', showTaskDescriptions);

      nodeMap.set(task.id, {
        task,
        left: geom.left,
        width: geom.width,
        centerY,
      });
    });

    const computedDeps: Array<{
      key: string;
      d: string;
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
    }> = [];

    if (showDependencyLines) {
      visibleTasks.forEach((task) => {
        if (!task.dependencies?.length) return;
        const target = nodeMap.get(task.id);
        if (!target) return;

        task.dependencies.forEach((depId) => {
          const source = nodeMap.get(depId);
          if (!source) return;

          const fromX = source.left + source.width;
          const fromY = source.centerY;
          const toX = target.left;
          const toY = target.centerY;
          const goingDown = toY > fromY;
          const vDist = Math.abs(toY - fromY);

          let d: string;
          if (toX > fromX + 26) {
            const midX = fromX + 14;
            const r = Math.min(8, vDist / 2);
            if (goingDown) {
              d = `M ${fromX} ${fromY} H ${midX} Q ${midX + r} ${fromY} ${midX + r} ${fromY + r} V ${toY - r} Q ${midX + r} ${toY} ${midX + r * 2} ${toY} H ${toX - 5}`;
            } else {
              d = `M ${fromX} ${fromY} H ${midX} Q ${midX + r} ${fromY} ${midX + r} ${fromY - r} V ${toY + r} Q ${midX + r} ${toY} ${midX + r * 2} ${toY} H ${toX - 5}`;
            }
          } else {
            const midY = (fromY + toY) / 2;
            d = `M ${fromX} ${fromY} H ${fromX + 10} V ${midY} H ${toX - 12} V ${toY} H ${toX - 5}`;
          }

          computedDeps.push({ key: `dep-${depId}-${task.id}`, d, fromX, fromY, toX, toY });
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

      {depPaths.map((dep) => (
        <g key={dep.key}>
          <path
            d={dep.d}
            fill="none"
            className="stroke-brand-500/80 dark:stroke-brand-400/85"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx={dep.fromX} cy={dep.fromY} r="3" className="fill-brand-600 dark:fill-brand-400" />
          <polygon
            points={`${dep.toX},${dep.toY} ${dep.toX - 7},${dep.toY - 4} ${dep.toX - 7},${dep.toY + 4}`}
            className="fill-brand-600 dark:fill-brand-400"
          />
        </g>
      ))}
    </svg>
  );
});
