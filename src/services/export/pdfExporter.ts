import type { Task } from '@/types';
import { renderGanttPages, type CanvasRenderOptions } from './canvasRenderer';

export interface PdfExportOptions extends CanvasRenderOptions {
  workspaceTitle?: string | null;
}

export interface PdfExportResult {
  pageCount: number;
}

export async function exportTasksToPDF(
  tasks: readonly Task[],
  filename: string,
  options: PdfExportOptions,
): Promise<PdfExportResult> {
  const pages = renderGanttPages(tasks, {
    ...options,
    includeCanvasFooter: false,
  });
  const { jsPDF } = await import('jspdf');

  const pageWidth = 279.4;
  const pageHeight = 215.9;
  const margin = 10;
  const footerReserve = 7;
  const contentWidth = pageWidth - margin * 2;
  const contentHeight = pageHeight - margin * 2 - footerReserve;

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'letter',
  });

  const exportDate = new Date().toLocaleDateString();
  const maxLogicalWidth = Math.max(...pages.map((p) => p.logicalWidth));
  const maxLogicalHeight = Math.max(...pages.map((p) => p.logicalHeight));
  const uniformScale = Math.min(
    contentWidth / maxLogicalWidth,
    contentHeight / maxLogicalHeight,
  );
  const multiPageXOffset = margin + (contentWidth - maxLogicalWidth * uniformScale) / 2;

  pages.forEach((rendered, index) => {
    if (index > 0) {
      pdf.addPage('letter', 'landscape');
    }

    if (options.theme === 'dark') {
      pdf.setFillColor(9, 11, 16);
    } else {
      pdf.setFillColor(255, 255, 255);
    }
    pdf.rect(0, 0, pageWidth, pageHeight, 'F');

    const fitScale =
      pages.length > 1
        ? uniformScale
        : Math.min(
            contentWidth / rendered.logicalWidth,
            contentHeight / rendered.logicalHeight,
          );
    const finalWidth = rendered.logicalWidth * fitScale;
    const finalHeight = rendered.logicalHeight * fitScale;
    const xOffset =
      pages.length > 1
        ? multiPageXOffset
        : margin + (contentWidth - finalWidth) / 2;
    // Anchor multi-page charts consistently at top margin; center single-page charts cleanly
    const yOffset =
      pages.length > 1 ? margin : margin + (contentHeight - finalHeight) / 2;

    const imgData = rendered.canvas.toDataURL('image/png', 1.0);
    pdf.addImage(imgData, 'PNG', xOffset, yOffset, finalWidth, finalHeight);

    pdf.setFontSize(7.5);
    if (options.theme === 'dark') {
      pdf.setTextColor(148, 163, 184);
    } else {
      pdf.setTextColor(100, 116, 139);
    }

    const granLabel =
      rendered.granularity.charAt(0).toUpperCase() + rendered.granularity.slice(1);
    const prefix = options.workspaceTitle ? `${options.workspaceTitle}  |  ` : '';
    pdf.text(
      `${prefix}Exported ${exportDate}  |  ${rendered.taskCount} tasks  |  View: ${granLabel}`,
      margin,
      pageHeight - 4.5,
    );

    if (rendered.totalPages > 1) {
      pdf.text(
        `Page ${rendered.pageNumber} of ${rendered.totalPages}`,
        pageWidth - margin,
        pageHeight - 4.5,
        { align: 'right' },
      );
    }
  });

  pdf.save(filename);
  return { pageCount: pages.length };
}
