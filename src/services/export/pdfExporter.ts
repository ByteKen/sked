import type { Task } from '@/types';
import { renderGanttToCanvas, type CanvasRenderOptions } from './canvasRenderer';

export interface PdfExportOptions extends CanvasRenderOptions {
  workspaceTitle?: string | null;
}

export async function exportTasksToPDF(
  tasks: readonly Task[],
  filename: string,
  options: PdfExportOptions,
): Promise<void> {
  const rendered = renderGanttToCanvas(tasks, options);
  const { jsPDF } = await import('jspdf');

  const pageWidth = 279.4;
  const pageHeight = 215.9;
  const margin = 10;
  const contentWidth = pageWidth - margin * 2;
  const contentHeight = pageHeight - margin * 2 - 6;

  const fitScale = Math.min(
    contentWidth / rendered.logicalWidth,
    contentHeight / rendered.logicalHeight,
  );
  const finalWidth = rendered.logicalWidth * fitScale;
  const finalHeight = rendered.logicalHeight * fitScale;
  const xOffset = margin + (contentWidth - finalWidth) / 2;
  const yOffset = margin + (contentHeight - finalHeight) / 2;

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'letter',
  });

  if (options.theme === 'dark') {
    pdf.setFillColor(9, 11, 16);
  } else {
    pdf.setFillColor(255, 255, 255);
  }
  pdf.rect(0, 0, pageWidth, pageHeight, 'F');

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
    `${prefix}Exported ${new Date().toLocaleDateString()}  |  ${rendered.taskCount} tasks  |  View: ${granLabel}`,
    margin,
    pageHeight - 4,
  );

  pdf.save(filename);
}
