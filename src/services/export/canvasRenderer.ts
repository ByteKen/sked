import {
  estimateLabelTextWidthPx,
  routeDependencyArrow,
  type ReservedVerticalChannel,
  type RoutableBarNode,
} from '@/domain/dependencyRouting';
import { buildExportPagePlan } from '@/domain/exportPagination';
import { flattenTasks, getTaskStatus, isTaskCompleted, isTaskDeadline } from '@/domain/taskTree';
import {
  buildTimelineColumns,
  calculateTaskBarGeometry,
  calculateTimelineRange,
  calculateTodayOffsetPx,
  detectOptimalGranularity,
  formatDateRange,
  getPixelsPerDay,
  getTodayLocal,
  type TimelineColumn,
} from '@/domain/timeline';
import type {
  BarHeightMode,
  FlatTask,
  Task,
  TaskLabelPosition,
  ThemeMode,
  TimelineGranularity,
} from '@/types';

export interface CanvasRenderOptions {
  workspaceTitle?: string | null;
  theme: ThemeMode;
  useRoundedSubtasks: boolean;
  showDependencyLines: boolean;
  barHeight: BarHeightMode;
  taskLabelPosition: TaskLabelPosition;
  granularity?: TimelineGranularity;
  /** When true, paints a subtle metadata + page-number footer onto each canvas (used for PNG). */
  includeCanvasFooter?: boolean;
}

interface Palette {
  background: string;
  headerBg: string;
  rowEven: string;
  rowOdd: string;
  gridLine: string;
  gridLineFaint: string;
  text: string;
  textMuted: string;
  todayLine: string;
  todayBg: string;
  depLine: string;
  barNotStarted: [string, string];
  barWorking: [string, string];
  barComplete: [string, string];
}

const PALETTES: Record<ThemeMode, Palette> = {
  light: {
    background: '#ffffff',
    headerBg: '#f8fafc',
    rowEven: '#ffffff',
    rowOdd: '#f8fafc',
    gridLine: '#cbd5e1',
    gridLineFaint: '#e2e8f0',
    text: '#0f172a',
    textMuted: '#64748b',
    todayLine: '#0284c7',
    todayBg: 'rgba(14, 165, 233, 0.12)',
    depLine: '#3b6bff',
    barNotStarted: ['#94a3b8', '#64748b'],
    barWorking: ['#3b6bff', '#2a55eb'],
    barComplete: ['#10b981', '#059669'],
  },
  dark: {
    background: '#090b10',
    headerBg: '#111520',
    rowEven: '#090b10',
    rowOdd: '#0e131f',
    gridLine: '#334155',
    gridLineFaint: '#1e293b',
    text: '#f8fafc',
    textMuted: '#94a3b8',
    todayLine: '#38bdf8',
    todayBg: 'rgba(56, 189, 248, 0.14)',
    depLine: '#648eff',
    barNotStarted: ['#64748b', '#475569'],
    barWorking: ['#648eff', '#3b6bff'],
    barComplete: ['#34d399', '#10b981'],
  },
};

export interface RenderedGanttCanvas {
  canvas: HTMLCanvasElement;
  logicalWidth: number;
  logicalHeight: number;
  taskCount: number;
  granularity: TimelineGranularity;
  pageNumber: number;
  totalPages: number;
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 3 && ctx.measureText(`${trimmed}...`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}...`;
}

function getStatusGradient(
  ctx: CanvasRenderingContext2D,
  palette: Palette,
  task: FlatTask,
  x: number,
  y: number,
  w: number,
  h: number,
): CanvasGradient {
  const status = getTaskStatus(task);
  const pair =
    status === 'completed'
      ? palette.barComplete
      : status === 'working' || status === 'in-progress'
        ? palette.barWorking
        : palette.barNotStarted;

  const gradient = ctx.createLinearGradient(x, y, x + w, y + h);
  gradient.addColorStop(0, pair[0]);
  gradient.addColorStop(1, pair[1]);
  return gradient;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawHeader(
  ctx: CanvasRenderingContext2D,
  palette: Palette,
  columns: readonly TimelineColumn[],
  colOffsetX: number,
  padding: number,
  taskNameWidth: number,
  headerHeight: number,
  canvasWidth: number,
  bodyBottomY: number,
): void {
  const startX = padding + taskNameWidth;

  ctx.fillStyle = palette.headerBg;
  ctx.fillRect(padding, padding, canvasWidth - padding * 2, headerHeight);

  columns.forEach((col) => {
    const x = startX + (col.leftPx - colOffsetX);
    if (col.isCurrent) {
      ctx.fillStyle = palette.todayBg;
      ctx.fillRect(x, padding, col.widthPx, headerHeight);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = col.isCurrent ? palette.todayLine : palette.text;
    ctx.font = '600 9px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(
      col.label,
      x + col.widthPx / 2,
      padding + headerHeight / 2 - (col.subLabel ? 7 : 0),
    );

    if (col.subLabel) {
      ctx.fillStyle = col.isCurrent ? palette.todayLine : palette.textMuted;
      ctx.font = '500 8px "JetBrains Mono", monospace';
      ctx.fillText(col.subLabel, x + col.widthPx / 2, padding + headerHeight / 2 + 8);
    }

    ctx.strokeStyle = palette.gridLineFaint;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, padding + headerHeight);
    ctx.lineTo(x, bodyBottomY);
    ctx.stroke();
  });

  // Left Task Name column header
  ctx.fillStyle = palette.text;
  ctx.font = '700 10px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('TASK NAME', padding + 12, padding + headerHeight / 2);

  // Header bottom border & vertical divider & outer frame
  ctx.strokeStyle = palette.gridLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, padding + headerHeight);
  ctx.lineTo(canvasWidth - padding, padding + headerHeight);
  ctx.moveTo(startX, padding);
  ctx.lineTo(startX, bodyBottomY);
  ctx.stroke();

  ctx.strokeStyle = palette.gridLineFaint;
  ctx.lineWidth = 1;
  ctx.strokeRect(padding, padding, canvasWidth - padding * 2, bodyBottomY - padding);
}

function drawDiamondMarker(
  ctx: CanvasRenderingContext2D,
  palette: Palette,
  task: FlatTask,
  cx: number,
  cy: number,
  labelPosition: TaskLabelPosition,
): void {
  const size = 14;
  const completed = isTaskCompleted(task);
  const gradient = getStatusGradient(ctx, palette, task, cx - size, cy - size, size * 2, size * 2);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);
  drawRoundedRect(ctx, -size / 2, -size / 2, size, size, 3);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.restore();

  if (completed) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 3, cy);
    ctx.lineTo(cx - 1, cy + 2);
    ctx.lineTo(cx + 3, cy - 2.5);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  if (labelPosition === 'outside') {
    ctx.fillStyle = palette.text;
    ctx.font = '500 9px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(task.name, cx + size / 2 + 8, cy);
  }
}

/**
 * Renders the Gantt chart into one or more crisp 2× pages with balanced row breaks,
 * column-boundary horizontal tiling when very wide, repeated headers on every page,
 * and obstacle-aware dependency arrows.
 */
export function renderGanttPages(
  tasks: readonly Task[],
  options: CanvasRenderOptions,
): RenderedGanttCanvas[] {
  const flatTasks = flattenTasks(tasks);
  const baseRange = calculateTimelineRange(flatTasks, options.granularity ?? 'days');
  const granularity = options.granularity ?? detectOptimalGranularity(baseRange.days);
  const range = calculateTimelineRange(flatTasks, granularity);

  const pixelsPerDay = getPixelsPerDay(granularity, 0.85);
  const columns = buildTimelineColumns(range.startDate, range.days, granularity, pixelsPerDay);

  const barHeightPx = options.barHeight === 'compact' ? 18 : options.barHeight === 'large' ? 30 : 24;
  const rowHeightPx = barHeightPx + 16;
  const headerHeight = 44;
  const taskNameWidth = 230;
  const padding = 20;
  const footerHeight = options.includeCanvasFooter ? 24 : 0;
  const scale = 2;
  const palette = PALETTES[options.theme];

  const pageSpecs = buildExportPagePlan({
    totalRows: flatTasks.length,
    columns,
    rowHeightPx,
    headerHeightPx: headerHeight,
    taskNameWidthPx: taskNameWidth,
    paddingPx: padding,
    footerHeightPx: footerHeight,
  });

  // Pre-compute global bar geometry & dependency routes once across all tasks
  const geomMap = new Map<number, { left: number; width: number }>();
  const globalNodes: RoutableBarNode[] = [];
  const globalNodeMap = new Map<number, RoutableBarNode>();

  flatTasks.forEach((task, idx) => {
    const geom = calculateTaskBarGeometry(task, range.startDate, pixelsPerDay, 24);
    geomMap.set(task.id, geom);

    const right = geom.left + Math.max(24, geom.width);
    const hasOutside = options.taskLabelPosition === 'outside' || task.isSubtask || isTaskDeadline(task);
    const node: RoutableBarNode = {
      id: task.id,
      rowIndex: idx,
      left: geom.left,
      right,
      labelRight: hasOutside
        ? right + 8 + Math.min(250, estimateLabelTextWidthPx(task.name, 10) + 28)
        : right,
      hasOutsideLabel: hasOutside,
      centerY: idx * rowHeightPx + rowHeightPx / 2,
    };
    globalNodes.push(node);
    globalNodeMap.set(task.id, node);
  });

  const routedDeps: Array<{
    points: Array<{ x: number; y: number }>;
    targetX: number;
    targetY: number;
    minY: number;
    maxY: number;
  }> = [];

  if (options.showDependencyLines) {
    const sourceLaneCounts = new Map<number, number>();
    const targetLaneCounts = new Map<number, number>();
    const reservedVerticals: ReservedVerticalChannel[] = [];

    flatTasks.forEach((task) => {
      if (!task.dependencies?.length) return;
      const target = globalNodeMap.get(task.id);
      if (!target) return;

      task.dependencies.forEach((depId) => {
        const source = globalNodeMap.get(depId);
        if (!source) return;

        const sourceLaneIndex = sourceLaneCounts.get(depId) ?? 0;
        sourceLaneCounts.set(depId, sourceLaneIndex + 1);
        const targetLaneIndex = targetLaneCounts.get(task.id) ?? 0;
        targetLaneCounts.set(task.id, targetLaneIndex + 1);

        const routed = routeDependencyArrow({
          source,
          target,
          allNodes: globalNodes,
          rowHeight: rowHeightPx,
          rowOffsetY: 0,
          sourceLaneIndex,
          targetLaneIndex,
          reservedVerticals,
          cornerRadius: 5,
          arrowTipInset: 6,
        });

        for (let i = 0; i < routed.points.length - 1; i++) {
          const a = routed.points[i]!;
          const b = routed.points[i + 1]!;
          if (Math.abs(a.x - b.x) < 0.25 && Math.abs(b.y - a.y) > rowHeightPx * 0.75) {
            reservedVerticals.push({
              x: a.x,
              minRow: Math.floor(Math.min(a.y, b.y) / rowHeightPx),
              maxRow: Math.floor(Math.max(a.y, b.y) / rowHeightPx),
            });
          }
        }

        const ys = routed.points.map((p) => p.y);
        routedDeps.push({
          points: routed.points,
          targetX: target.left,
          targetY: target.centerY,
          minY: Math.min(...ys),
          maxY: Math.max(...ys),
        });
      });
    });
  }

  const today = getTodayLocal();
  const hasToday = today >= range.startDate && today <= range.endDate;
  const globalTodayX = hasToday
    ? calculateTodayOffsetPx(range.startDate, pixelsPerDay, today)
    : null;

  const granLabel = granularity.charAt(0).toUpperCase() + granularity.slice(1);
  const dateLabel = new Date().toLocaleDateString();

  const hasHorizontalPaging = pageSpecs.some((p) => p.colSlice.startCol > 0);

  return pageSpecs.map((spec) => {
    const pageTasks = flatTasks.slice(spec.rowSlice.startRow, spec.rowSlice.endRow);
    const pageColumns = columns.slice(spec.colSlice.startCol, spec.colSlice.endCol);
    const sliceTimelineWidth = hasHorizontalPaging
      ? Math.max(240, spec.colSlice.widthPx)
      : Math.max(560, spec.colSlice.widthPx);
    const logicalWidth = hasHorizontalPaging
      ? taskNameWidth + sliceTimelineWidth + padding * 2
      : Math.max(820, taskNameWidth + sliceTimelineWidth + padding * 2);
    const bodyHeight = pageTasks.length * rowHeightPx;
    const rowStartY = padding + headerHeight;
    const bodyBottomY = rowStartY + bodyHeight;
    const logicalHeight = bodyBottomY + padding + footerHeight;

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(logicalWidth * scale);
    canvas.height = Math.ceil(logicalHeight * scale);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not initialize 2D canvas context');
    }

    ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Page background
    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, logicalWidth, logicalHeight);

    const startX = padding + taskNameWidth;
    const timelineClipWidth = logicalWidth - padding - startX;
    const rowOffsetGlobalY = spec.rowSlice.startRow * rowHeightPx;
    const colOffsetX = spec.colSlice.offsetX;

    // Alternating rows
    pageTasks.forEach((_, localIdx) => {
      const globalIdx = spec.rowSlice.startRow + localIdx;
      const rowY = rowStartY + localIdx * rowHeightPx;
      ctx.fillStyle = globalIdx % 2 === 0 ? palette.rowEven : palette.rowOdd;
      ctx.fillRect(padding, rowY, logicalWidth - padding * 2, rowHeightPx);

      ctx.strokeStyle = palette.gridLineFaint;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(padding, rowY + rowHeightPx);
      ctx.lineTo(logicalWidth - padding, rowY + rowHeightPx);
      ctx.stroke();
    });

    // Repeated Header + vertical gridlines
    drawHeader(
      ctx,
      palette,
      pageColumns,
      colOffsetX,
      padding,
      taskNameWidth,
      headerHeight,
      logicalWidth,
      bodyBottomY,
    );

    // Left Task Name column rows
    pageTasks.forEach((task, localIdx) => {
      const rowY = rowStartY + localIdx * rowHeightPx;
      const indent = task.level * 14;

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = palette.text;
      ctx.font = task.hasChildren
        ? '600 10px "Plus Jakarta Sans", system-ui, sans-serif'
        : '500 10px "Plus Jakarta Sans", system-ui, sans-serif';

      const maxNameWidth = taskNameWidth - indent - 24;
      const displayName = truncateText(ctx, task.name, maxNameWidth);
      ctx.fillText(displayName, padding + 12 + indent, rowY + rowHeightPx / 2 - 6);

      ctx.fillStyle = palette.textMuted;
      ctx.font = '400 8px "JetBrains Mono", monospace';
      ctx.fillText(
        formatDateRange(task.start, task.end),
        padding + 12 + indent,
        rowY + rowHeightPx / 2 + 7,
      );
    });

    // Clipped timeline body region (bars, Today line, obstacle-aware dependency arrows)
    ctx.save();
    ctx.beginPath();
    ctx.rect(startX, rowStartY, timelineClipWidth, bodyHeight);
    ctx.clip();

    // Draw Today line if inside this horizontal slice
    if (globalTodayX !== null) {
      const todayX = startX + (globalTodayX - colOffsetX);
      if (todayX >= startX && todayX <= startX + timelineClipWidth) {
        ctx.strokeStyle = palette.todayLine;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(todayX, rowStartY);
        ctx.lineTo(todayX, bodyBottomY);
        ctx.stroke();

        ctx.fillStyle = palette.todayLine;
        ctx.beginPath();
        ctx.arc(todayX, rowStartY, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw obstacle-aware dependency arrows intersecting this page slice
    if (options.showDependencyLines && routedDeps.length > 0) {
      ctx.strokeStyle = palette.depLine;
      ctx.fillStyle = palette.depLine;
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const sliceTopGlobalY = rowOffsetGlobalY;
      const sliceBottomGlobalY = rowOffsetGlobalY + bodyHeight;

      routedDeps.forEach((dep) => {
        if (dep.maxY < sliceTopGlobalY || dep.minY > sliceBottomGlobalY) return;

        const pts = dep.points.map((p) => ({
          x: startX + (p.x - colOffsetX),
          y: rowStartY + (p.y - rowOffsetGlobalY),
        }));

        if (pts.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(pts[0]!.x, pts[0]!.y);
          for (let i = 1; i < pts.length - 1; i++) {
            const prev = pts[i - 1]!;
            const curr = pts[i]!;
            const next = pts[i + 1]!;
            const len1 = Math.hypot(curr.x - prev.x, curr.y - prev.y);
            const len2 = Math.hypot(next.x - curr.x, next.y - curr.y);
            const r = Math.min(5, len1 / 2, len2 / 2);
            if (r >= 0.5 && len1 > 0 && len2 > 0) {
              ctx.arcTo(curr.x, curr.y, next.x, next.y, r);
            } else {
              ctx.lineTo(curr.x, curr.y);
            }
          }
          const last = pts[pts.length - 1]!;
          ctx.lineTo(last.x, last.y);
          ctx.stroke();
        }

        const toY = rowStartY + (dep.targetY - rowOffsetGlobalY);
        if (toY >= rowStartY && toY <= bodyBottomY) {
          const toX = startX + (dep.targetX - colOffsetX);
          ctx.beginPath();
          ctx.moveTo(toX, toY);
          ctx.lineTo(toX - 7, toY - 3.5);
          ctx.lineTo(toX - 7, toY + 3.5);
          ctx.closePath();
          ctx.fill();
        }
      });
    }

    // Draw task bars / diamonds for this page
    pageTasks.forEach((task, localIdx) => {
      const geom = geomMap.get(task.id);
      if (!geom) return;

      const rowY = rowStartY + localIdx * rowHeightPx;
      const barX = startX + (geom.left - colOffsetX);
      const barW = Math.max(24, geom.width);
      const barY = rowY + (rowHeightPx - barHeightPx) / 2;
      const completed = isTaskCompleted(task);

      if (isTaskDeadline(task) && !options.useRoundedSubtasks) {
        drawDiamondMarker(
          ctx,
          palette,
          task,
          barX + Math.min(barW, 24) / 2,
          rowY + rowHeightPx / 2,
          options.taskLabelPosition,
        );
        return;
      }

      drawRoundedRect(ctx, barX, barY, barW, barHeightPx, barHeightPx / 2);
      ctx.fillStyle = getStatusGradient(ctx, palette, task, barX, barY, barW, barHeightPx);
      ctx.fill();

      if (task.progress > 0 && task.progress < 100) {
        const progressW = (barW * task.progress) / 100;
        drawRoundedRect(ctx, barX, barY, Math.max(6, progressW), barHeightPx, barHeightPx / 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.fill();
      }

      const label = task.progress > 0 && !completed ? `${task.name} ${task.progress}%` : task.name;
      if (options.taskLabelPosition === 'inside' && barW > 52) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '600 8.5px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(truncateText(ctx, label, barW - 14), barX + barW / 2, barY + barHeightPx / 2);
      } else if (options.taskLabelPosition === 'outside') {
        ctx.fillStyle = palette.text;
        ctx.font = '500 8.5px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, barX + barW + 8, barY + barHeightPx / 2);
      }
    });

    ctx.restore();

    // Optional canvas metadata footer (used for PNG exports)
    if (options.includeCanvasFooter) {
      const footerY = logicalHeight - padding / 2 - 4;
      const prefix = options.workspaceTitle ? `${options.workspaceTitle}  |  ` : '';
      ctx.fillStyle = palette.textMuted;
      ctx.font = '500 8.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        `${prefix}Exported ${dateLabel}  |  ${flatTasks.length} tasks  |  View: ${granLabel}`,
        padding,
        footerY,
      );

      if (spec.totalPages > 1) {
        ctx.textAlign = 'right';
        ctx.fillText(`Page ${spec.pageNumber} of ${spec.totalPages}`, logicalWidth - padding, footerY);
      }
    }

    return {
      canvas,
      logicalWidth,
      logicalHeight,
      taskCount: flatTasks.length,
      granularity,
      pageNumber: spec.pageNumber,
      totalPages: spec.totalPages,
    };
  });
}

/**
 * Backward-compatible single-page helper returning the first rendered page.
 */
export function renderGanttToCanvas(
  tasks: readonly Task[],
  options: CanvasRenderOptions,
): RenderedGanttCanvas {
  const pages = renderGanttPages(tasks, options);
  return pages[0]!;
}
