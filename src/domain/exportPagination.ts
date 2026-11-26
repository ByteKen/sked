import type { TimelineColumn } from './timeline';

export interface RowSlice {
  startRow: number; // inclusive
  endRow: number; // exclusive
}

export interface ColumnSlice {
  startCol: number; // inclusive
  endCol: number; // exclusive
  offsetX: number;
  widthPx: number;
}

export interface ExportPageSpec {
  pageNumber: number; // 1-based
  totalPages: number;
  rowSlice: RowSlice;
  colSlice: ColumnSlice;
}

export interface ExportPaginationInput {
  totalRows: number;
  columns: readonly TimelineColumn[];
  rowHeightPx: number;
  headerHeightPx: number;
  taskNameWidthPx: number;
  paddingPx: number;
  footerHeightPx?: number;
  /** Target width/height aspect ratio of each exported page (landscape Letter ≈ 1.40). */
  targetAspectRatio?: number;
  /** Maximum timeline width (excluding task name column) before horizontally splitting columns. */
  maxTimelineSliceWidthPx?: number;
  /** Minimum logical width used when computing vertical row capacity so narrow charts don't over-pack rows. */
  minLogicalPageWidthPx?: number;
}

const DEFAULT_TARGET_ASPECT = 259.4 / 184; // Landscape Letter printable ratio (~1.41)
const DEFAULT_MAX_TIMELINE_SLICE_WIDTH = 1520;
const DEFAULT_MIN_LOGICAL_PAGE_WIDTH = 960;
const MIN_ROWS_PER_PAGE = 8;

/**
 * Splits timeline columns along exact column boundaries so no day/week/month
 * header is ever cut in half across horizontally paginated tiles.
 * When a wide timeline must split, columns are balanced evenly across tiles
 * so the final page never gets stuck with a tiny 1-column orphan strip.
 */
export function computeColumnSlices(
  columns: readonly TimelineColumn[],
  maxTimelineSliceWidthPx = DEFAULT_MAX_TIMELINE_SLICE_WIDTH,
): ColumnSlice[] {
  if (columns.length === 0) {
    return [{ startCol: 0, endCol: 0, offsetX: 0, widthPx: 0 }];
  }

  const totalWidth = columns.reduce((sum, col) => sum + col.widthPx, 0);
  if (totalWidth <= maxTimelineSliceWidthPx) {
    return [
      {
        startCol: 0,
        endCol: columns.length,
        offsetX: columns[0]!.leftPx,
        widthPx: totalWidth,
      },
    ];
  }

  const slices: ColumnSlice[] = [];
  let startCol = 0;
  let remainingWidth = totalWidth;
  let remainingSlices = Math.max(1, Math.ceil(totalWidth / maxTimelineSliceWidthPx));

  while (startCol < columns.length) {
    const firstCol = columns[startCol]!;
    const offsetX = firstCol.leftPx;

    if (remainingSlices <= 1) {
      let widthPx = firstCol.widthPx;
      let endCol = startCol + 1;
      while (
        endCol < columns.length &&
        widthPx + columns[endCol]!.widthPx <= maxTimelineSliceWidthPx
      ) {
        widthPx += columns[endCol]!.widthPx;
        endCol += 1;
      }
      slices.push({ startCol, endCol, offsetX, widthPx });
      remainingWidth -= widthPx;
      startCol = endCol;
      continue;
    }

    const targetWidth = remainingWidth / remainingSlices;
    let widthPx = firstCol.widthPx;
    let endCol = startCol + 1;

    while (endCol < columns.length) {
      const nextCol = columns[endCol]!;
      const candidateWidth = widthPx + nextCol.widthPx;
      if (candidateWidth > maxTimelineSliceWidthPx) {
        break;
      }
      if (columns.length - endCol <= remainingSlices - 1) {
        break;
      }
      if (
        widthPx >= targetWidth ||
        Math.abs(candidateWidth - targetWidth) > Math.abs(widthPx - targetWidth)
      ) {
        break;
      }
      widthPx = candidateWidth;
      endCol += 1;
    }

    slices.push({ startCol, endCol, offsetX, widthPx });
    remainingWidth -= widthPx;
    remainingSlices -= 1;
    startCol = endCol;
  }

  return slices;
}

/**
 * Computes balanced vertical row slices so large projects fill each landscape page
 * at full readable width without leaving tiny orphan rows on the final page.
 */
export function computeRowSlices(params: {
  totalRows: number;
  rowHeightPx: number;
  logicalPageWidthPx: number;
  headerHeightPx: number;
  paddingPx: number;
  footerHeightPx?: number;
  targetAspectRatio?: number;
}): RowSlice[] {
  const {
    totalRows,
    rowHeightPx,
    logicalPageWidthPx,
    headerHeightPx,
    paddingPx,
    footerHeightPx = 0,
    targetAspectRatio = DEFAULT_TARGET_ASPECT,
  } = params;

  if (totalRows <= 0) {
    return [{ startRow: 0, endRow: 0 }];
  }

  const maxPageLogicalHeight = logicalPageWidthPx / targetAspectRatio;
  const overhead = paddingPx * 2 + headerHeightPx + footerHeightPx;
  const availableRowsHeight = Math.max(rowHeightPx * MIN_ROWS_PER_PAGE, maxPageLogicalHeight - overhead);
  const maxRowsPerPage = Math.max(MIN_ROWS_PER_PAGE, Math.floor(availableRowsHeight / rowHeightPx));

  if (totalRows <= maxRowsPerPage) {
    return [{ startRow: 0, endRow: totalRows }];
  }

  // Balance rows evenly across the minimum needed pages (e.g. 58 rows -> 15, 15, 15, 13 instead of 19, 19, 19, 1)
  const pageCount = Math.ceil(totalRows / maxRowsPerPage);
  const baseCount = Math.floor(totalRows / pageCount);
  const remainder = totalRows % pageCount;

  const slices: RowSlice[] = [];
  let cursor = 0;
  for (let p = 0; p < pageCount; p++) {
    const count = baseCount + (p < remainder ? 1 : 0);
    slices.push({ startRow: cursor, endRow: cursor + count });
    cursor += count;
  }

  return slices;
}

/**
 * Builds the complete ordered list of export pages (vertical row bands × horizontal column tiles).
 */
export function buildExportPagePlan(input: ExportPaginationInput): ExportPageSpec[] {
  const colSlices = computeColumnSlices(
    input.columns,
    input.maxTimelineSliceWidthPx ?? DEFAULT_MAX_TIMELINE_SLICE_WIDTH,
  );
  const maxColWidth = colSlices.reduce((max, s) => Math.max(max, s.widthPx), 0);
  const logicalPageWidthPx = Math.max(
    input.minLogicalPageWidthPx ?? DEFAULT_MIN_LOGICAL_PAGE_WIDTH,
    input.taskNameWidthPx + maxColWidth + input.paddingPx * 2,
  );

  const rowSlices = computeRowSlices({
    totalRows: input.totalRows,
    rowHeightPx: input.rowHeightPx,
    logicalPageWidthPx,
    headerHeightPx: input.headerHeightPx,
    paddingPx: input.paddingPx,
    footerHeightPx: input.footerHeightPx ?? 0,
    targetAspectRatio: input.targetAspectRatio ?? DEFAULT_TARGET_ASPECT,
  });

  const totalPages = rowSlices.length * colSlices.length;
  const pages: ExportPageSpec[] = [];
  let pageNumber = 1;

  for (const rowSlice of rowSlices) {
    for (const colSlice of colSlices) {
      pages.push({
        pageNumber,
        totalPages,
        rowSlice,
        colSlice,
      });
      pageNumber += 1;
    }
  }

  return pages;
}

export function buildPaginatedPngFilename(
  filename: string,
  pageNumber: number,
  totalPages: number,
): string {
  if (totalPages <= 1) return filename;
  const dotIdx = filename.lastIndexOf('.');
  if (dotIdx <= 0) {
    return `${filename}-page-${pageNumber}-of-${totalPages}.png`;
  }
  const stem = filename.slice(0, dotIdx);
  const ext = filename.slice(dotIdx);
  return `${stem}-page-${pageNumber}-of-${totalPages}${ext}`;
}
