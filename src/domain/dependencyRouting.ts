export interface Point2D {
  x: number;
  y: number;
}

export interface RoutableBarNode {
  id: number;
  rowIndex: number;
  left: number;
  right: number;
  /** Optional extended right edge covering outside text labels (soft obstacle). */
  labelRight?: number;
  centerY: number;
}

export interface RouteDependencyParams {
  source: RoutableBarNode;
  target: RoutableBarNode;
  allNodes: readonly RoutableBarNode[];
  rowHeight: number;
  rowOffsetY?: number;
  sourceLaneIndex?: number;
  targetLaneIndex?: number;
  cornerRadius?: number;
  arrowTipInset?: number;
}

export interface RoutedDependencyPath {
  points: Point2D[];
  svgPath: string;
}

const BAR_CLEARANCE_PX = 8;
const VERTICAL_ESCAPE_PAD_PX = 12;
const LABEL_DETOUR_MAX_PX = 360;
const LANE_STEP_PX = 6;

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

function anyBarBlocksX(x: number, bars: readonly RoutableBarNode[], includeLabels: boolean): boolean {
  for (const bar of bars) {
    if (includeLabels ? hitsBarOrLabelHorizontally(x, bar) : hitsBarHorizontally(x, bar)) {
      return true;
    }
  }
  return false;
}

/**
 * Advances `startX` rightward until it clears every obstacle bar (and optionally
 * outside labels if the detour stays compact).
 */
function findClearRightX(
  startX: number,
  bars: readonly RoutableBarNode[],
  preferClearLabels: boolean,
): number {
  let x = startX;
  for (let pass = 0; pass <= bars.length; pass++) {
    let pushed = false;
    for (const bar of bars) {
      if (hitsBarHorizontally(x, bar)) {
        x = bar.right + VERTICAL_ESCAPE_PAD_PX;
        pushed = true;
      }
    }
    if (!pushed) break;
  }

  if (preferClearLabels) {
    let labelX = x;
    for (let pass = 0; pass <= bars.length; pass++) {
      let pushed = false;
      for (const bar of bars) {
        if (hitsBarOrLabelHorizontally(labelX, bar)) {
          const edge = Math.max(bar.right, bar.labelRight ?? bar.right);
          labelX = edge + VERTICAL_ESCAPE_PAD_PX;
          pushed = true;
        }
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
 * - Prefers a direct 2-corner forward elbow when clear of intermediate bars.
 * - When bars overlap or a direct drop would cut through intermediate tasks,
 *   drops cleanly outside blocking bars to the empty horizontal row seam
 *   adjacent to the target row (never crossing intermediate bars or top labels).
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
    if (toX >= fromX + arrowTipInset + 4) {
      const pts = simplifyCollinearPoints([
        { x: fromX, y: fromY },
        { x: endX, y: toY },
      ]);
      return { points: pts, svgPath: polylineToRoundedSvgPath(pts, cornerRadius) };
    }
    const seamY = rowOffsetY + source.rowIndex * rowHeight;
    const exitX = fromX + 12 + sourceLaneIndex * LANE_STEP_PX;
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

  // Case 1: Target starts cleanly to the right of source -> try clean 2-turn direct elbow
  if (toX >= fromX + minExitStub + minEntryStub) {
    const preferredNearSource = fromX + minExitStub;
    const preferredNearTarget = toX - minEntryStub;
    const midpointX = (preferredNearSource + preferredNearTarget) / 2;
    const candidates = [preferredNearSource, preferredNearTarget, midpointX];

    // Prefer a channel clear of BOTH bars and outside text labels first
    let chosenElbowX = candidates.find((cx) => !anyBarBlocksX(cx, betweenBars, true));
    // Fallback to a channel clear of all solid bars
    if (chosenElbowX === undefined) {
      chosenElbowX = candidates.find((cx) => !anyBarBlocksX(cx, betweenBars, false));
    }

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

  // Case 2: Tight/overlapping bars or obstructed direct channel -> route cleanly along the
  // empty horizontal row seam immediately adjacent to the target row.
  const goingDown = target.rowIndex > source.rowIndex;
  const seamY = goingDown
    ? rowOffsetY + target.rowIndex * rowHeight
    : rowOffsetY + (target.rowIndex + 1) * rowHeight;

  const baseExitX = fromX + minExitStub;
  const clearExitX = findClearRightX(baseExitX, betweenBars, true);
  const entryX = toX - minEntryStub;

  const pts = simplifyCollinearPoints([
    { x: fromX, y: fromY },
    { x: clearExitX, y: fromY },
    { x: clearExitX, y: seamY },
    { x: entryX, y: seamY },
    { x: entryX, y: toY },
    { x: endX, y: toY },
  ]);

  return {
    points: pts,
    svgPath: polylineToRoundedSvgPath(pts, cornerRadius),
  };
}
