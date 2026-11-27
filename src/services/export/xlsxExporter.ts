import { buildTasksXlsxWorkbook, type BuildXlsxOptions } from '@/domain/xlsxExport';
import type { Task } from '@/types';
import { downloadBlob } from './downloadUtils';

const XLSX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function exportTasksToXLSX(
  tasks: readonly Task[],
  filename: string,
  options: BuildXlsxOptions = {},
): void {
  const { bytes } = buildTasksXlsxWorkbook(tasks, options);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([buffer], { type: XLSX_MIME_TYPE });
  downloadBlob(blob, filename);
}
