import type { Task } from '@/types';
import { renderGanttToCanvas, type CanvasRenderOptions } from './canvasRenderer';
import { downloadBlob } from './downloadUtils';

export async function exportTasksToPNG(
  tasks: readonly Task[],
  filename: string,
  options: CanvasRenderOptions,
): Promise<void> {
  const rendered = renderGanttToCanvas(tasks, options);
  const blob = await new Promise<Blob | null>((resolve) =>
    rendered.canvas.toBlob(resolve, 'image/png', 1.0),
  );
  if (!blob) {
    throw new Error('Failed to encode PNG image');
  }
  downloadBlob(blob, filename);
}
