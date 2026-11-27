import { describe, expect, it } from 'vitest';
import {
  estimateLabelTextWidthPx,
  polylineToRoundedSvgPath,
  routeDependencyArrow,
  type Point2D,
  type ReservedVerticalChannel,
  type RoutableBarNode,
} from '@/domain/dependencyRouting';

function verticalSegmentHitsRange(
  a: Point2D,
  b: Point2D,
  bar: RoutableBarNode,
  rowHeight: number,
  includeLabel = false,
): boolean {
  if (Math.abs(a.x - b.x) > 0.25) return false;
  const x = a.x;
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  const barTop = bar.rowIndex * rowHeight + 4;
  const barBottom = (bar.rowIndex + 1) * rowHeight - 4;
  const overlapsY = maxY > barTop && minY < barBottom;
  const rightEdge = includeLabel ? Math.max(bar.right, bar.labelRight ?? bar.right) : bar.right;
  const overlapsX = x >= bar.left && x <= rightEdge;
  return overlapsY && overlapsX;
}

function verticalSegmentHitsBar(
  a: Point2D,
  b: Point2D,
  bar: RoutableBarNode,
  rowHeight: number,
): boolean {
  return verticalSegmentHitsRange(a, b, bar, rowHeight, false);
}

describe('obstacle-aware dependency arrow routing', () => {
  const rowHeight = 44;

  it('uses a clean 2-turn direct elbow when target starts cleanly after source with no obstacles', () => {
    const source: RoutableBarNode = { id: 1, rowIndex: 0, left: 40, right: 160, centerY: 22 };
    const target: RoutableBarNode = { id: 2, rowIndex: 2, left: 260, right: 380, centerY: 110 };

    const routed = routeDependencyArrow({
      source,
      target,
      allNodes: [source, target],
      rowHeight,
    });

    expect(routed.points).toHaveLength(4);
    expect(routed.svgPath).toContain('Q ');
    expect(routed.points[0]).toEqual({ x: 160, y: 22 });
    expect(routed.points[routed.points.length - 1]).toEqual({ x: 255, y: 110 });
  });

  it('routes cleanly around intermediate bars on overlapping dependencies (Defining -> Designing around Define Database Schema)', () => {
    const defining: RoutableBarNode = { id: 10, rowIndex: 6, left: 400, right: 560, centerY: 6 * rowHeight + 28 };
    const sub1: RoutableBarNode = { id: 11, rowIndex: 7, left: 400, right: 470, centerY: 7 * rowHeight + 22 };
    const sub2: RoutableBarNode = { id: 12, rowIndex: 8, left: 470, right: 520, centerY: 8 * rowHeight + 22 };
    const dbSchema: RoutableBarNode = { id: 13, rowIndex: 9, left: 510, right: 560, centerY: 9 * rowHeight + 22 };
    const designing: RoutableBarNode = { id: 14, rowIndex: 10, left: 545, right: 780, centerY: 10 * rowHeight + 28 };

    const allNodes = [defining, sub1, sub2, dbSchema, designing];
    const routed = routeDependencyArrow({
      source: defining,
      target: designing,
      allNodes,
      rowHeight,
    });

    // Horizontal return track must run cleanly on row 10's top seam (440px), never through row 9 (dbSchema)
    const horizontalReturn = routed.points.find(
      (pt, i) =>
        i > 0 &&
        Math.abs(pt.y - routed.points[i - 1]!.y) < 0.25 &&
        pt.x < routed.points[i - 1]!.x,
    );
    expect(horizontalReturn?.y).toBe(10 * rowHeight);

    // Verify ZERO segments intersect ANY intermediate bar
    for (let i = 0; i < routed.points.length - 1; i++) {
      const a = routed.points[i]!;
      const b = routed.points[i + 1]!;
      for (const obstacle of [sub1, sub2, dbSchema]) {
        expect(verticalSegmentHitsBar(a, b, obstacle, rowHeight)).toBe(false);
      }
    }
  });

  it('dynamically detours rightward past an intermediate bar that extends beyond the source bar', () => {
    const source: RoutableBarNode = { id: 1, rowIndex: 0, left: 50, right: 200, centerY: 22 };
    const wideBlocker: RoutableBarNode = { id: 2, rowIndex: 1, left: 100, right: 320, centerY: 66 };
    const target: RoutableBarNode = { id: 3, rowIndex: 2, left: 260, right: 400, centerY: 110 };

    const routed = routeDependencyArrow({
      source,
      target,
      allNodes: [source, wideBlocker, target],
      rowHeight,
    });

    // Must not cut vertically through wideBlocker [100..320]
    for (let i = 0; i < routed.points.length - 1; i++) {
      expect(
        verticalSegmentHitsBar(routed.points[i]!, routed.points[i + 1]!, wideBlocker, rowHeight),
      ).toBe(false);
    }
  });

  it('staggers parallel lanes so multiple dependencies from the same source do not overlap', () => {
    const source: RoutableBarNode = { id: 1, rowIndex: 0, left: 40, right: 160, centerY: 22 };
    const targetA: RoutableBarNode = { id: 2, rowIndex: 1, left: 260, right: 340, centerY: 66 };
    const targetB: RoutableBarNode = { id: 3, rowIndex: 2, left: 260, right: 340, centerY: 110 };

    const lane0 = routeDependencyArrow({
      source,
      target: targetA,
      allNodes: [source, targetA, targetB],
      rowHeight,
      sourceLaneIndex: 0,
    });
    const lane1 = routeDependencyArrow({
      source,
      target: targetB,
      allNodes: [source, targetA, targetB],
      rowHeight,
      sourceLaneIndex: 1,
    });

    expect(lane1.points[1]!.x).toBeGreaterThan(lane0.points[1]!.x);
  });

  it('routes cleanly around long 210px outside labels in compact Months view (Defining -> Designing)', () => {
    const defining: RoutableBarNode = { id: 10, rowIndex: 6, left: 200, right: 230, labelRight: 290, centerY: 6 * rowHeight + 28 };
    const sub1: RoutableBarNode = { id: 11, rowIndex: 7, left: 200, right: 228, labelRight: 228 + 218, centerY: 7 * rowHeight + 22 };
    const sub2: RoutableBarNode = { id: 12, rowIndex: 8, left: 206, right: 234, labelRight: 234 + 218, centerY: 8 * rowHeight + 22 };
    const sub3: RoutableBarNode = { id: 13, rowIndex: 9, left: 212, right: 240, labelRight: 240 + 200, centerY: 9 * rowHeight + 22 };
    const designing: RoutableBarNode = { id: 14, rowIndex: 10, left: 214, right: 266, labelRight: 300, centerY: 10 * rowHeight + 28 };

    const routed = routeDependencyArrow({
      source: defining,
      target: designing,
      allNodes: [defining, sub1, sub2, sub3, designing],
      rowHeight,
    });

    // Vertical drop X must clear the widest outside label (234 + 218 = 452)
    const verticalDropX = routed.points[1]!.x;
    expect(verticalDropX).toBeGreaterThan(234 + 218);
  });

  it('never drops a direct elbow through intermediate outside labels even when target starts past source (Months view)', () => {
    // Reproduces Developing -> Product Testing where target starts cleanly right of source,
    // while intermediate subtasks have 250px outside labels extending far past target.left.
    const developing: RoutableBarNode = {
      id: 1,
      rowIndex: 0,
      left: 200,
      right: 320,
      labelRight: 320,
      centerY: 22,
    };
    const sub1: RoutableBarNode = {
      id: 2,
      rowIndex: 1,
      left: 240,
      right: 268,
      labelRight: 268 + 258, // 526
      hasOutsideLabel: true,
      centerY: 1 * rowHeight + 22,
    };
    const sub2: RoutableBarNode = {
      id: 3,
      rowIndex: 2,
      left: 290,
      right: 318,
      labelRight: 318 + 258, // 576
      hasOutsideLabel: true,
      centerY: 2 * rowHeight + 22,
    };
    const sub3: RoutableBarNode = {
      id: 4,
      rowIndex: 3,
      left: 340,
      right: 368,
      labelRight: 368 + 258, // 626 (extends > 300px past source and far past target.left!)
      hasOutsideLabel: true,
      centerY: 3 * rowHeight + 22,
    };
    const productTesting: RoutableBarNode = {
      id: 5,
      rowIndex: 4,
      left: 410,
      right: 440,
      labelRight: 520,
      centerY: 4 * rowHeight + 22,
    };

    const routed = routeDependencyArrow({
      source: developing,
      target: productTesting,
      allNodes: [developing, sub1, sub2, sub3, productTesting],
      rowHeight,
    });

    // ZERO vertical segments may touch ANY intermediate bar OR its outside text label!
    for (let i = 0; i < routed.points.length - 1; i++) {
      const a = routed.points[i]!;
      const b = routed.points[i + 1]!;
      for (const obstacle of [sub1, sub2, sub3]) {
        expect(verticalSegmentHitsRange(a, b, obstacle, rowHeight, true)).toBe(false);
      }
    }
    // Must clear sub3's 626px label edge completely
    expect(routed.points[1]!.x).toBeGreaterThan(626);
  });

  it('exits via the empty horizontal seam when source itself renders an inline outside label', () => {
    const source: RoutableBarNode = {
      id: 1,
      rowIndex: 0,
      left: 100,
      right: 128,
      labelRight: 128 + 220,
      hasOutsideLabel: true,
      centerY: 22,
    };
    const middle: RoutableBarNode = {
      id: 2,
      rowIndex: 1,
      left: 130,
      right: 158,
      labelRight: 158 + 240,
      hasOutsideLabel: true,
      centerY: 1 * rowHeight + 22,
    };
    const target: RoutableBarNode = {
      id: 3,
      rowIndex: 2,
      left: 180,
      right: 220,
      hasOutsideLabel: true,
      centerY: 2 * rowHeight + 22,
    };

    const routed = routeDependencyArrow({
      source,
      target,
      allNodes: [source, middle, target],
      rowHeight,
    });

    // Must step onto the empty row 0/1 seam (y = 44) immediately instead of crossing source's label at y = 22
    expect(routed.points[1]!.x).toBe(136);
    expect(routed.points[2]!.y).toBe(rowHeight);
    for (let i = 0; i < routed.points.length - 1; i++) {
      expect(
        verticalSegmentHitsRange(routed.points[i]!, routed.points[i + 1]!, middle, rowHeight, true),
      ).toBe(false);
    }
  });

  it('staggers vertical channels cleanly when reservedVerticals overlap the same row range', () => {
    const sourceA: RoutableBarNode = { id: 1, rowIndex: 0, left: 100, right: 160, centerY: 22 };
    const blocker: RoutableBarNode = {
      id: 2,
      rowIndex: 1,
      left: 140,
      right: 180,
      labelRight: 420,
      hasOutsideLabel: true,
      centerY: 66,
    };
    const targetA: RoutableBarNode = { id: 3, rowIndex: 2, left: 200, right: 260, centerY: 110 };

    const first = routeDependencyArrow({
      source: sourceA,
      target: targetA,
      allNodes: [sourceA, blocker, targetA],
      rowHeight,
    });
    const reserved: ReservedVerticalChannel[] = [
      { x: first.points[1]!.x, minRow: 0, maxRow: 2 },
    ];
    const second = routeDependencyArrow({
      source: sourceA,
      target: targetA,
      allNodes: [sourceA, blocker, targetA],
      rowHeight,
      reservedVerticals: reserved,
    });

    expect(second.points[1]!.x).toBeGreaterThanOrEqual(first.points[1]!.x + 8);
    expect(estimateLabelTextWidthPx('Instructor Dashboard & Schedule Grid', 12)).toBeGreaterThan(200);
  });

  it('produces valid rounded SVG paths with clamped corners on tight segments', () => {
    const path = polylineToRoundedSvgPath(
      [
        { x: 0, y: 0 },
        { x: 6, y: 0 },
        { x: 6, y: 4 },
        { x: 20, y: 4 },
      ],
      8,
    );
    expect(path.startsWith('M 0 0')).toBe(true);
    expect(path).toContain('Q 6 0');
    expect(path).toContain('Q 6 4');
    expect(path.endsWith('L 20 4')).toBe(true);
  });
});
