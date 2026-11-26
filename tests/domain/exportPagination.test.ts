import { describe, expect, it } from 'vitest';
import {
  buildExportPagePlan,
  buildPaginatedPngFilename,
  computeColumnSlices,
  computeRowSlices,
} from '@/domain/exportPagination';
import type { TimelineColumn } from '@/domain/timeline';

function makeColumns(count: number, widthPx: number): TimelineColumn[] {
  return Array.from({ length: count }, (_, i) => ({
    key: `col-${i}`,
    date: new Date(2026, i % 12, 1),
    days: 30,
    leftPx: i * widthPx,
    widthPx,
    label: `M${i + 1}`,
    subLabel: '2026',
    isWeekend: false,
    isCurrent: false,
  }));
}

describe('multi-page Gantt export pagination', () => {
  it('keeps small projects on a single page', () => {
    const pages = buildExportPagePlan({
      totalRows: 12,
      columns: makeColumns(6, 120),
      rowHeightPx: 34,
      headerHeightPx: 44,
      taskNameWidthPx: 230,
      paddingPx: 20,
    });

    expect(pages).toHaveLength(1);
    expect(pages[0]!.pageNumber).toBe(1);
    expect(pages[0]!.totalPages).toBe(1);
    expect(pages[0]!.rowSlice).toEqual({ startRow: 0, endRow: 12 });
    expect(pages[0]!.colSlice.startCol).toBe(0);
    expect(pages[0]!.colSlice.endCol).toBe(6);
  });

  it('splits a 58-task project into balanced full-width pages with zero orphan rows', () => {
    const pages = buildExportPagePlan({
      totalRows: 58,
      columns: makeColumns(9, 120),
      rowHeightPx: 34,
      headerHeightPx: 44,
      taskNameWidthPx: 230,
      paddingPx: 20,
    });

    expect(pages.length).toBeGreaterThanOrEqual(3);
    const counts = pages.map((p) => p.rowSlice.endRow - p.rowSlice.startRow);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(58);
    // Balanced pages differ by at most 1 row
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    expect(pages[0]!.rowSlice.startRow).toBe(0);
    expect(pages[pages.length - 1]!.rowSlice.endRow).toBe(58);
  });

  it('splits very wide timelines evenly along exact column boundaries without tiny orphan tiles', () => {
    const cols = makeColumns(30, 100); // 3,000px wide
    const colSlices = computeColumnSlices(cols, 1000);

    expect(colSlices).toHaveLength(3);
    expect(colSlices[0]).toEqual({ startCol: 0, endCol: 10, offsetX: 0, widthPx: 1000 });
    expect(colSlices[1]).toEqual({ startCol: 10, endCol: 20, offsetX: 1000, widthPx: 1000 });
    expect(colSlices[2]).toEqual({ startCol: 20, endCol: 30, offsetX: 2000, widthPx: 1000 });

    // 14 months (1,680px) against a 1,520px cap splits evenly into 7 + 7 instead of 12 + 2
    const fourteenMonths = makeColumns(14, 120);
    const balancedSlices = computeColumnSlices(fourteenMonths, 1520);
    expect(balancedSlices).toHaveLength(2);
    expect(balancedSlices[0]).toEqual({ startCol: 0, endCol: 7, offsetX: 0, widthPx: 840 });
    expect(balancedSlices[1]).toEqual({ startCol: 7, endCol: 14, offsetX: 840, widthPx: 840 });
  });

  it('produces clean single-file or numbered multi-PNG filenames', () => {
    expect(buildPaginatedPngFilename('plotwise-2026-11-26.png', 1, 1)).toBe(
      'plotwise-2026-11-26.png',
    );
    expect(buildPaginatedPngFilename('plotwise-2026-11-26.png', 2, 4)).toBe(
      'plotwise-2026-11-26-page-2-of-4.png',
    );
  });

  it('handles empty or zero-row input safely', () => {
    const slices = computeRowSlices({
      totalRows: 0,
      rowHeightPx: 34,
      logicalPageWidthPx: 1000,
      headerHeightPx: 44,
      paddingPx: 20,
    });
    expect(slices).toEqual([{ startRow: 0, endRow: 0 }]);
  });
});
