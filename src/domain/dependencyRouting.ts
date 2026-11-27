export interface Point2D {
  x: number;
  y: number;
}

export interface RoutableBarNode {
  id: number;
  rowIndex: number;
  left: number;
  right: number;
  /** Optional extended right edge covering outside/top/description text labels. */
  labelRight?: number;
  /** True when the node renders a text label inline to the right of the bar at centerY. */
  hasOutsideLabel?: boolean;
  centerY: number;
}

export interface ReservedVerticalChannel {
  x: number;
  minRow: number;
  maxRow: number;
}

export interface RouteDependencyParams {
  source: RoutableBarNode;
  target: RoutableBarNode;
  allNodes: readonly RoutableBarNode[];
  rowHeight: number;
  rowOffsetY?: number;
  sourceLaneIndex?: number;
  targetLaneIndex?: number;
  reservedVerticals?: readonly ReservedVerticalChannel[];
  cornerRadius?: number;
  arrowTipInset?: number;
}

export interface RoutedDependencyPath {
  points: Point2D[];
  svgPath: string;
}

const BAR_CLEARANCE_PX = 10;
const VERTICAL_ESCAPE_PAD_PX = 14;
const LABEL_DETOUR_MAX_PX = 1600;
const LANE_STEP_PX = 8;

const NARROW_CHARS = new Set('ilI1tfrj.,:;|()[]! ');
const WIDE_CHARS = new Set('WMmw@%&');

/**
 * Pure proportional text-width estimator matching sans-serif UI fonts within a few pixels,
 * so dependency routing avoids text labels reliably in both browser DOM and headless tests.
 */
export function estimateLabelTextWidthPx(text: string, fontSizePx = 12): number {
  if (!text) return 0;
  let units = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === ' ') {
      units += 0.45;
    } else if (NARROW_CHARS.has(ch)) {
      units += 0.58;
    } else if (WIDE_CHARS.has(ch)) {
      units += 1.38;
    } else if (ch >= 'A' && ch <= 'Z') {
      units += 1.18;
    } else {
      units += 1.0;
    }
  }
  return Math.ceil(units * fontSizePx * 0.6 + 8);
}

function hitsBarHorizontally(x: number, bar: RoutableBarNode, pad = BAR_CLEARANCE_PX): boolean {
  return x >= bar.left - pad && x <= bar.right + pad;
}

function hitsBarOrLabelHorizontally(
  x: number,
  bar: RoutableBarNode,
  pad = BAR_CLEARANCE_PX,
): boolean {
  const rightEdge = Math.max(bar.right, bar.labelRight ?? bar.right);
  return x >= bar.left - pad && x <= rightEdge + pad;
}

function anyBarBlocksX(
  x: number,
  bars: readonly RoutableBarNode[],
  includeLabels: boolean,
): boolean {
  for (const bar of bars) {
    if (includeLabels ? hitsBarOrLabelHorizontally(x, bar) : hitsBarHorizontally(x, bar)) {
      return true;
    }
  }
  return false;
}

function conflictsWithReservedVertical(
  x: number,
  minRow: number,
  maxRow: number,
  reserved: readonly ReservedVerticalChannel[] | undefined,
): boolean {
  if (!reserved?.length) return false;
  for (const ch of reserved) {
    const rowsOverlap = minRow <= ch.maxRow && maxRow >= ch.minRow;
    if (rowsOverlap && Math.abs(x - ch.x) < LANE_STEP_PX - 1) {
      return true;
    }
  }
  return false;
}

/**
 * Advances `startX` rightward until it clears every obstacle bar and text label
 * (plus any already-reserved vertical dependency channels on overlapping rows).
 */
function findClearRightX(
  startX: number,
  bars: readonly RoutableBarNode[],
  preferClearLabels: boolean,
  minRow: number,
  maxRow: number,
  reserved?: readonly ReservedVerticalChannel[],
): number {
  let x = startX;
  for (let pass = 0; pass <= bars.length + (reserved?.length ?? 0) + 2; pass++) {
    let pushed = false;
    for (const bar of bars) {
      if (hitsBarHorizontally(x, bar)) {
        x = bar.right + VERTICAL_ESCAPE_PAD_PX;
        pushed = true;
      }
    }
    if (conflictsWithReservedVertical(x, minRow, maxRow, reserved)) {
      x += LANE_STEP_PX;
      pushed = true;
    }
    if (!pushed) break;
  }

  if (preferClearLabels) {
    let labelX = x;
    for (let pass = 0; pass <= bars.length + (reserved?.length ?? 0) + 4; pass++) {
      let pushed = false;
      for (const bar of bars) {
        if (hitsBarOrLabelHorizontally(labelX, bar)) {
          const edge = Math.max(bar.right, bar.labelRight ?? bar.right);
          labelX = edge + VERTICAL_ESCAPE_PAD_PX;
          pushed = true;
        }
      }
      if (conflictsWithReservedVertical(labelX, minRow, maxRow, reserved)) {
        labelX += LANE_STEP_PX;
        pushed = true;
      }
      if (!pushed) break;
    }
    if (labelX - x <= LABEL_DETOUR_MAX_PX) {
      return labelX;
    }
  }

  return x;
}

function simplifyCollinearPoints(raw: readonly Point2D[]): Point2D[] {
  const deduped: Point2D[] = [];
  for (const pt of raw) {
    const prev = deduped[deduped.length - 1];
    if (!prev || Math.abs(prev.x - pt.x) > 0.25 || Math.abs(prev.y - pt.y) > 0.25) {
      deduped.push({ x: Math.round(pt.x * 100) / 100, y: Math.round(pt.y * 100) / 100 });
    }
  }

  if (deduped.length <= 2) return deduped;

  const result: Point2D[] = [deduped[0]!];
  for (let i = 1; i < deduped.length - 1; i++) {
    const a = result[result.length - 1]!;
    const b = deduped[i]!;
    const c = deduped[i + 1]!;
    const sameX = Math.abs(a.x - b.x) < 0.25 && Math.abs(b.x - c.x) < 0.25;
    const sameY = Math.abs(a.y - b.y) < 0.25 && Math.abs(b.y - c.y) < 0.25;
    if (!sameX && !sameY) {
      result.push(b);
    }
  }
  result.push(deduped[deduped.length - 1]!);
  return result;
}

/**
 * Converts an orthogonal polyline into an SVG path string with smooth quadratic
 * rounded corners that clamp automatically on short segments.
 */
export function polylineToRoundedSvgPath(points: readonly Point2D[], radius = 6): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0]!.x} ${points[0]!.y}`;

  const segments: string[] = [`M ${points[0]!.x} ${points[0]!.y}`];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const next = points[i + 1]!;

    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const len1 = Math.hypot(dx1, dy1);

    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const len2 = Math.hypot(dx2, dy2);

    const r = Math.min(radius, len1 / 2, len2 / 2);
    if (r < 0.5 || len1 === 0 || len2 === 0) {
      segments.push(`L ${curr.x} ${curr.y}`);
      continue;
    }

    const p1x = curr.x - (dx1 / len1) * r;
    const p1y = curr.y - (dy1 / len1) * r;
    const p2x = curr.x + (dx2 / len2) * r;
    const p2y = curr.y + (dy2 / len2) * r;

    segments.push(
      `L ${Math.round(p1x * 100) / 100} ${Math.round(p1y * 100) / 100}`,
      `Q ${curr.x} ${curr.y} ${Math.round(p2x * 100) / 100} ${Math.round(p2y * 100) / 100}`,
    );
  }

  const last = points[points.length - 1]!;
  segments.push(`L ${last.x} ${last.y}`);
  return segments.join(' ');
}

/**
 * Computes a clean, obstacle-avoiding orthogonal route between two Gantt bars.
 *
 * - Prefers a direct 2-corner forward elbow ONLY when a vertical channel clears BOTH
 *   intermediate bars AND outside/top text labels (and clears the source's own outside label).
 * - Otherwise routes cleanly around all blocking bars and text labels to the empty horizontal
 *   row seam adjacent to the target row (never slicing through intermediate bars or labels).
 */
export function routeDependencyArrow(params: RouteDependencyParams): RoutedDependencyPath {
  const {
    source,
    target,
    allNodes,
    rowHeight,
    rowOffsetY = 0,
    sourceLaneIndex = 0,
    targetLaneIndex = 0,
    reservedVerticals,
    cornerRadius = 6,
    arrowTipInset = 5,
  } = params;

  const fromX = source.right;
  const fromY = source.centerY;
  const toX = target.left;
  const toY = target.centerY;
  const endX = toX - arrowTipInset;

  // Same row edge case
  if (source.rowIndex === target.rowIndex) {
    if (toX >= fromX + arrowTipInset + 4 && !source.hasOutsideLabel) {
      const pts = simplifyCollinearPoints([
        { x: fromX, y: fromY },
        { x: endX, y: toY },
      ]);
      return { points: pts, svgPath: polylineToRoundedSvgPath(pts, cornerRadius) };
    }
    const seamY = rowOffsetY + source.rowIndex * rowHeight;
    const exitX = fromX + 10 + sourceLaneIndex * LANE_STEP_PX;
    const entryX = toX - 12 - targetLaneIndex * LANE_STEP_PX;
    const pts = simplifyCollinearPoints([
      { x: fromX, y: fromY },
      { x: exitX, y: fromY },
      { x: exitX, y: seamY },
      { x: entryX, y: seamY },
      { x: entryX, y: toY },
      { x: endX, y: toY },
    ]);
    return { points: pts, svgPath: polylineToRoundedSvgPath(pts, cornerRadius) };
  }

  const minRow = Math.min(source.rowIndex, target.rowIndex);
  const maxRow = Math.max(source.rowIndex, target.rowIndex);
  const betweenBars = allNodes.filter((n) => n.rowIndex > minRow && n.rowIndex < maxRow);

  const minExitStub = 12 + sourceLaneIndex * LANE_STEP_PX;
  const minEntryStub = 12 + targetLaneIndex * LANE_STEP_PX;
  const sourceOwnOutsideRight =
    source.hasOutsideLabel && source.labelRight ? source.labelRight : fromX;

  // Case 1: Target starts cleanly to the right of source -> try clean 2-turn direct elbow
  // ONLY if the vertical channel clears ALL intermediate bars AND text labels (never slice text!)
  if (toX >= fromX + minExitStub + minEntryStub && !source.hasOutsideLabel) {
    const preferredNearSource = fromX + minExitStub;
    const preferredNearTarget = toX - minEntryStub;
    const midpointX = (preferredNearSource + preferredNearTarget) / 2;

    const candidates: number[] = [preferredNearSource, preferredNearTarget, midpointX];
    // Also test clean gaps immediately past any intermediate label that still fit before target
    for (const bar of betweenBars) {
      const gapX = Math.max(bar.right, bar.labelRight ?? bar.right) + VERTICAL_ESCAPE_PAD_PX;
      if (gapX >= preferredNearSource && gapX <= preferredNearTarget) {
        candidates.push(gapX);
      }
    }

    const chosenElbowX = candidates.find(
      (cx) =>
        !anyBarBlocksX(cx, betweenBars, true) &&
        !conflictsWithReservedVertical(cx, minRow, maxRow, reservedVerticals),
    );

    if (chosenElbowX !== undefined) {
      const pts = simplifyCollinearPoints([
        { x: fromX, y: fromY },
        { x: chosenElbowX, y: fromY },
        { x: chosenElbowX, y: toY },
        { x: endX, y: toY },
      ]);
      return { points: pts, svgPath: polylineToRoundedSvgPath(pts, cornerRadius) };
    }
  }

  // Case 2: Tight/overlapping bars, source outside label, or text-obstructed direct channel ->
  // route cleanly around ALL intermediate bars & labels to the empty horizontal row seam.
  const goingDown = target.rowIndex > source.rowIndex;
  const targetSeamY = goingDown
    ? rowOffsetY + target.rowIndex * rowHeight
    : rowOffsetY + (target.rowIndex + 1) * rowHeight;

  const entryX = toX - minEntryStub;

  // When source itself has an inline outside label at centerY, step immediately onto the empty
  // seam adjacent to source so the horizontal exit never runs through source's own label text.
  if (source.hasOutsideLabel) {
    const sourceSeamY = goingDown
      ? rowOffsetY + (source.rowIndex + 1) * rowHeight
      : rowOffsetY + source.rowIndex * rowHeight;
    const shortStubX = fromX + 8;

    // Adjacent row: sourceSeamY === targetSeamY, so glide straight along the empty shared seam!
    if (Math.abs(sourceSeamY - targetSeamY) < 0.25) {
      const pts = simplifyCollinearPoints([
        { x: fromX, y: fromY },
        { x: shortStubX, y: fromY },
        { x: shortStubX, y: targetSeamY },
        { x: entryX, y: targetSeamY },
        { x: entryX, y: toY },
        { x: endX, y: toY },
      ]);
      return { points: pts, svgPath: polylineToRoundedSvgPath(pts, cornerRadius) };
    }

    // Multi-row span from a source with an outside label: drop vertically in a channel clear
    // of all intermediate bars & labels (starting at least past source's outside label or near entry)
    const canDropAtEntry =
      !anyBarBlocksX(entryX, betweenBars, true) &&
      !conflictsWithReservedVertical(entryX, minRow, maxRow, reservedVerticals);

    const dropX = canDropAtEntry
      ? entryX
      : findClearRightX(
          Math.max(fromX + minExitStub, sourceOwnOutsideRight + VERTICAL_ESCAPE_PAD_PX),
          betweenBars,
          true,
          minRow,
          maxRow,
          reservedVerticals,
        );

    const pts = simplifyCollinearPoints([
      { x: fromX, y: fromY },
      { x: shortStubX, y: fromY },
      { x: shortStubX, y: sourceSeamY },
      { x: dropX, y: sourceSeamY },
      { x: dropX, y: targetSeamY },
      { x: entryX, y: targetSeamY },
      { x: entryX, y: toY },
      { x: endX, y: toY },
    ]);
    return { points: pts, svgPath: polylineToRoundedSvgPath(pts, cornerRadius) };
  }

  const baseExitX = fromX + minExitStub;
  const clearExitX = findClearRightX(
    baseExitX,
    betweenBars,
    true,
    minRow,
    maxRow,
    reservedVerticals,
  );

  const pts = simplifyCollinearPoints([
    { x: fromX, y: fromY },
    { x: clearExitX, y: fromY },
    { x: clearExitX, y: targetSeamY },
    { x: entryX, y: targetSeamY },
    { x: entryX, y: toY },
    { x: endX, y: toY },
  ]);

  return {
    points: pts,
    svgPath: polylineToRoundedSvgPath(pts, cornerRadius),
  };
}
