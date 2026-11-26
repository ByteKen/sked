import type {
  BarHeightMode,
  ExportFormat,
  Task,
  TaskLabelPosition,
  ThemeMode,
  TimelineGranularity,
} from '@/types';
import { exportTasksToCSV } from './csvExporter';
import { buildExportBaseFilename } from './downloadUtils';
import { exportTasksToJSON } from './jsonExporter';
import { exportTasksToPDF } from './pdfExporter';
import { exportTasksToPNG } from './pngExporter';

export interface ExportChartOptions {
  workspaceTitle?: string | null;
  theme: ThemeMode;
  useRoundedSubtasks: boolean;
  showDependencyLinesOnExport: boolean;
  barHeight: BarHeightMode;
  taskLabelPosition: TaskLabelPosition;
  granularity?: TimelineGranularity;
}

export interface ExportResult {
  ok: boolean;
  filename?: string;
  error?: string;
}

export async function exportGanttChart(
  format: ExportFormat,
  tasks: readonly Task[],
  options: ExportChartOptions,
): Promise<ExportResult> {
  if (tasks.length === 0) {
    return { ok: false, error: 'Add at least one task before exporting.' };
  }

  const baseName = buildExportBaseFilename(options.workspaceTitle);
  const filename = `${baseName}.${format}`;

  try {
    switch (format) {
      case 'pdf':
        await exportTasksToPDF(tasks, filename, {
          workspaceTitle: options.workspaceTitle,
          theme: options.theme,
          useRoundedSubtasks: options.useRoundedSubtasks,
          showDependencyLines: options.showDependencyLinesOnExport,
          barHeight: options.barHeight,
          taskLabelPosition: options.taskLabelPosition,
          granularity: options.granularity,
        });
        break;
      case 'png':
        await exportTasksToPNG(tasks, filename, {
          theme: options.theme,
          useRoundedSubtasks: options.useRoundedSubtasks,
          showDependencyLines: options.showDependencyLinesOnExport,
          barHeight: options.barHeight,
          taskLabelPosition: options.taskLabelPosition,
          granularity: options.granularity,
        });
        break;
      case 'csv':
        exportTasksToCSV(tasks, filename, options.workspaceTitle);
        break;
      case 'json':
        exportTasksToJSON(tasks, filename, options.workspaceTitle);
        break;
    }

    return { ok: true, filename };
  } catch (err) {
    console.error(`Export (${format}) failed:`, err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : `Failed to export as ${format.toUpperCase()}`,
    };
  }
}
