import { buildTasksCsvContent } from '@/domain/csvExport';
import type { Task, WorkspaceBaseline } from '@/types';
import { downloadBlob } from './downloadUtils';

export function exportTasksToCSV(
  tasks: readonly Task[],
  filename: string,
  baseline?: WorkspaceBaseline | null,
): void {
  const csvContent = buildTasksCsvContent(tasks, { baseline });
  // Prepend UTF-8 BOM so Microsoft Excel decodes UTF-8 characters cleanly on Windows & macOS
  const blob = new Blob(['\uFEFF', csvContent], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename);
}
