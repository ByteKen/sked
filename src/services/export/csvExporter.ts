import { flattenTasks, isTaskDeadline } from '@/domain/taskTree';
import type { Task } from '@/types';
import { downloadBlob } from './downloadUtils';

function escapeCsvCell(value: string | number): string {
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportTasksToCSV(
  tasks: readonly Task[],
  filename: string,
  workspaceTitle?: string | null,
): void {
  const headers = [
    'ID',
    'Task Name',
    'Description',
    'Start Date',
    'End Date',
    'Progress (%)',
    'Deadline',
    'Dependencies',
    'Hierarchy Level',
  ];

  const flat = flattenTasks(tasks);
  const lines: string[] = [];

  if (workspaceTitle) {
    lines.push(escapeCsvCell(`Project: ${workspaceTitle}`));
    lines.push(escapeCsvCell(`Exported: ${new Date().toLocaleDateString()}`));
    lines.push('');
  }

  lines.push(headers.join(','));
  for (const task of flat) {
    const row = [
      task.id,
      escapeCsvCell(task.name),
      escapeCsvCell(task.description ?? ''),
      task.start,
      task.end,
      task.progress ?? 0,
      isTaskDeadline(task) ? 'Yes' : 'No',
      task.dependencies && task.dependencies.length > 0 ? task.dependencies.join(';') : 'None',
      task.level,
    ];
    lines.push(row.join(','));
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename);
}
