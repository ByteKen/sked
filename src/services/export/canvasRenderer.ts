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
  theme: ThemeMode;
  useRoundedSubtasks: boolean;
  showDependencyLines: boolean;
  barHeight: BarHeightMode;
  taskLabelPosition: TaskLabelPosition;
  granularity?: TimelineGranularity;
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
    depLine: '#6366f1',
    barNotStarted: ['#94a3b8', '#64748b'],
    barWorking: ['#f59e0b', '#d97706'],
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
    depLine: '#818cf8',
    barNotStarted: ['#64748b', '#475569'],
    barWorking: ['#fbbf24', '#f59e0b'],
    barComplete: ['#34d399', '#10b981'],
  },
};

export interface RenderedGanttCanvas {
  canvas: HTMLCanvasElement;
  logicalWidth: number;
  logicalHeight: number;
  taskCount: number;
  granularity: TimelineGranularity;
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
  padding: number,
  taskNameWidth: number,
  headerHeight: number,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const startX = padding + taskNameWidth;

  ctx.fillStyle = palette.headerBg;
  ctx.fillRect(padding, padding, canvasWidth - padding * 2, headerHeight);

  columns.forEach((col) => {
    const x = startX + col.leftPx;
    if (col.isCurrent) {
      ctx.fillStyle = palette.todayBg;
      ctx.fillRect(x, padding, col.widthPx, headerHeight);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = col.isCurrent ? palette.todayLine : palette.text;
    ctx.font = '600 9px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(col.label, x + col.widthPx / 2, padding + headerHeight / 2 - (col.subLabel ? 7 : 0));

    if (col.subLabel) {
      ctx.fillStyle = col.isCurrent ? palette.todayLine : palette.textMuted;
      ctx.font = '500 8px "JetBrains Mono", monospace';
      ctx.fillText(col.subLabel, x + col.widthPx / 2, padding + headerHeight / 2 + 8);
    }

    ctx.strokeStyle = palette.gridLineFaint;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, padding + headerHeight);
    ctx.lineTo(x, canvasHeight - padding);
    ctx.stroke();
  });

  // Left Task Name column header
  ctx.fillStyle = palette.text;
  ctx.font = '700 10px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('TASK NAME', padding + 12, padding + headerHeight / 2);

  // Header bottom border & vertical divider
  ctx.strokeStyle = palette.gridLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, padding + headerHeight);
  ctx.lineTo(canvasWidth - padding, padding + headerHeight);
  ctx.moveTo(startX, padding);
  ctx.lineTo(startX, canvasHeight - padding);
  ctx.stroke();
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

export function renderGanttToCanvas(
  tasks: readonly Task[],
  options: CanvasRenderOptions,
): RenderedGanttCanvas {
  const flatTasks = flattenTasks(tasks);
  const baseRange = calculateTimelineRange(flatTasks, options.granularity ?? 'days');
  const granularity = options.granularity ?? detectOptimalGranularity(baseRange.days);
  const range = calculateTimelineRange(flatTasks, granularity);

  const pixelsPerDay = getPixelsPerDay(granularity, 0.85);
  const columns = buildTimelineColumns(range.startDate, range.days, granularity, pixelsPerDay);
  const timelineWidth = columns.reduce((sum, col) => sum + col.widthPx, 0);

  const barHeightPx = options.barHeight === 'compact' ? 18 : options.barHeight === 'large' ? 30 : 24;
  const rowHeightPx = barHeightPx + 16;
  const headerHeight = 44;
  const taskNameWidth = 230;
  const padding = 20;
  const scale = 2;

  const logicalWidth = Math.max(820, taskNameWidth + timelineWidth + padding * 2);
  const logicalHeight = headerHeight + flatTasks.length * rowHeightPx + padding * 2;

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

  const palette = PALETTES[options.theme];

  // Canvas background
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, logicalWidth, logicalHeight);

  const startX = padding + taskNameWidth;
  const rowStartY = padding + headerHeight;

  // Draw alternating rows first (so gridlines & bars sit cleanly above them)
  flatTasks.forEach((_, idx) => {
    const rowY = rowStartY + idx * rowHeightPx;
    ctx.fillStyle = idx % 2 === 0 ? palette.rowEven : palette.rowOdd;
    ctx.fillRect(padding, rowY, logicalWidth - padding * 2, rowHeightPx);

    ctx.strokeStyle = palette.gridLineFaint;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(padding, rowY + rowHeightPx);
    ctx.lineTo(logicalWidth - padding, rowY + rowHeightPx);
    ctx.stroke();
  });

  // Draw timeline headers & vertical gridlines
  drawHeader(
    ctx,
    palette,
    columns,
    padding,
    taskNameWidth,
    headerHeight,
    logicalWidth,
    logicalHeight,
  );

  // Pre-compute task bar geometry + index lookup for O(1) dependencies
  const rowIndexMap = new Map<number, number>();
  const geomMap = new Map<number, { left: number; width: number }>();

  flatTasks.forEach((task, idx) => {
    rowIndexMap.set(task.id, idx);
    const geom = calculateTaskBarGeometry(task, range.startDate, pixelsPerDay, 24);
    geomMap.set(task.id, geom);

    const rowY = rowStartY + idx * rowHeightPx;
    const indent = task.level * 14;

    // Task name & date label
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

    // Draw task bar or deadline diamond
    const barX = startX + geom.left;
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

  // Draw Today line if within visible range
  const today = getTodayLocal();
  if (today >= range.startDate && today <= range.endDate) {
    const todayX = startX + calculateTodayOffsetPx(range.startDate, pixelsPerDay, today);
    ctx.strokeStyle = palette.todayLine;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(todayX, rowStartY);
    ctx.lineTo(todayX, logicalHeight - padding);
    ctx.stroke();

    ctx.fillStyle = palette.todayLine;
    ctx.beginPath();
    ctx.arc(todayX, rowStartY, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw dependency arrows if enabled
  if (options.showDependencyLines) {
    ctx.strokeStyle = palette.depLine;
    ctx.fillStyle = palette.depLine;
    ctx.lineWidth = 1.4;

    flatTasks.forEach((task, toIndex) => {
      if (!task.dependencies?.length) return;
      const toGeom = geomMap.get(task.id);
      if (!toGeom) return;

      task.dependencies.forEach((depId) => {
        const fromIndex = rowIndexMap.get(depId);
        const fromGeom = geomMap.get(depId);
        if (fromIndex === undefined || !fromGeom) return;

        const fromX = startX + fromGeom.left + fromGeom.width;
        const fromY = rowStartY + fromIndex * rowHeightPx + rowHeightPx / 2;
        const toX = startX + toGeom.left;
        const toY = rowStartY + toIndex * rowHeightPx + rowHeightPx / 2;

        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        if (toX > fromX + 18) {
          const midX = fromX + 12;
          ctx.lineTo(midX, fromY);
          ctx.lineTo(midX, toY);
          ctx.lineTo(toX - 6, toY);
        } else {
          const midY = (fromY + toY) / 2;
          ctx.lineTo(fromX + 8, fromY);
          ctx.lineTo(fromX + 8, midY);
          ctx.lineTo(toX - 10, midY);
          ctx.lineTo(toX - 10, toY);
          ctx.lineTo(toX - 6, toY);
        }
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(toX, toY);
        ctx.lineTo(toX - 7, toY - 3.5);
        ctx.lineTo(toX - 7, toY + 3.5);
        ctx.closePath();
        ctx.fill();
      });
    });
  }

  return {
    canvas,
    logicalWidth,
    logicalHeight,
    taskCount: flatTasks.length,
    granularity,
  };
}
