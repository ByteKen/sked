import { flattenTasks, sanitizeTaskTree } from '@/domain/taskTree';
import type { Task } from '@/types';
import { downloadBlob } from './downloadUtils';

export function exportTasksToJSON(
  tasks: readonly Task[],
  filename: string,
  workspaceTitle?: string | null,
): void {
  const payload = {
    version: '2.0',
    projectTitle: workspaceTitle ?? null,
    exportDate: new Date().toISOString(),
    taskCount: flattenTasks(tasks).length,
    tasks: sanitizeTaskTree(tasks),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  downloadBlob(blob, filename);
}
