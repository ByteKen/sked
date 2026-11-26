import { buildPaginatedPngFilename } from '@/domain/exportPagination';
import type { Task } from '@/types';
import { renderGanttPages, type CanvasRenderOptions } from './canvasRenderer';
import { downloadBlob } from './downloadUtils';

export interface PngExportResult {
  pageCount: number;
  filenames: string[];
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function exportTasksToPNG(
  tasks: readonly Task[],
  filename: string,
  options: CanvasRenderOptions,
): Promise<PngExportResult> {
  const pages = renderGanttPages(tasks, {
    ...options,
    includeCanvasFooter: true,
  });

  const filenames: string[] = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!;
    const blob = await new Promise<Blob | null>((resolve) =>
      page.canvas.toBlob(resolve, 'image/png', 1.0),
    );
    if (!blob) {
      throw new Error(`Failed to encode PNG image (page ${page.pageNumber})`);
    }
    const pageFilename = buildPaginatedPngFilename(filename, page.pageNumber, page.totalPages);
    downloadBlob(blob, pageFilename);
    filenames.push(pageFilename);

    // Slight stagger between multi-file downloads so browsers don't throttle sequential saves
    if (i < pages.length - 1) {
      await waitMs(180);
    }
  }

  return {
    pageCount: pages.length,
    filenames,
  };
}
