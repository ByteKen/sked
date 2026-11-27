import {
  addDaysISO,
  computeCriticalPath,
  computeTaskBaselineSlipDays,
  diffDaysISO,
  getInclusiveDurationDays,
} from '@/domain/scheduling';
import { flattenTasks, getTaskStatus, isTaskCompleted, isTaskDeadline } from '@/domain/taskTree';
import { formatISODate, getTodayLocal, parseISODate } from '@/domain/timeline';
import { buildStoredZip } from '@/domain/xlsxZip';
import type { FlatTask, Task, WorkspaceBaseline } from '@/types';

export interface BuildXlsxOptions {
  workspaceTitle?: string | null;
  baseline?: WorkspaceBaseline | null;
  /** Optional deterministic ISO `YYYY-MM-DD` date used for overdue / Today highlighting. */
  todayISO?: string;
}

export type XlsxTimelineScale = 'daily' | 'weekly' | 'monthly';

export interface BuiltXlsxWorkbook {
  bytes: Uint8Array;
  files: ReadonlyMap<string, string>;
  scale: XlsxTimelineScale;
  timelineColumnCount: number;
}

interface FontSpec {
  size: number;
  color: string;
  bold?: boolean;
  italic?: boolean;
  name?: string;
}

interface BorderSideSpec {
  style: 'thin' | 'medium' | 'dashed';
  color: string;
}

interface BorderSpec {
  left?: BorderSideSpec;
  right?: BorderSideSpec;
  top?: BorderSideSpec;
  bottom?: BorderSideSpec;
}

interface AlignmentSpec {
  horizontal?: 'left' | 'center' | 'right';
  vertical?: 'top' | 'center' | 'bottom';
  wrapText?: boolean;
  indent?: number;
}

interface CellStyleSpec {
  font?: FontSpec;
  fill?: string;
  border?: BorderSpec;
  numFmtId?: number;
  alignment?: AlignmentSpec;
}

interface CellDef {
  col: number; // 1-based column index
  styleId: number;
  type: 'str' | 'num' | 'formula-num' | 'formula-str' | 'empty';
  value?: string | number;
  formula?: string;
}

interface RowDef {
  rowNum: number;
  height?: number;
  cells: CellDef[];
}

interface TimelineBucket {
  startISO: string;
  endISO: string;
  label: string;
  groupLabel: string;
  isWeekend: boolean;
  isToday: boolean;
}

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const MONTH_UPPER = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;

const NUM_FMT_DATE = 164;
const NUM_FMT_PERCENT = 165;
const NUM_FMT_INT = 166;
const NUM_FMT_SLIP = 167;

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;

// Strip XML 1.0 disallowed control chars while preserving tab/newline/CR
// eslint-disable-next-line no-control-regex
const INVALID_XML_CONTROL_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

function sanitizeXmlText(raw: string): string {
  return raw.replace(INVALID_XML_CONTROL_RE, '');
}

function escapeXmlText(raw: string): string {
  return sanitizeXmlText(raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeXmlAttr(raw: string): string {
  return escapeXmlText(raw).replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function columnIndexToLetter(colIndex: number): string {
  let n = colIndex;
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

export function cellRef(colIndex: number, rowNum: number): string {
  return `${columnIndexToLetter(colIndex)}${rowNum}`;
}

export function isoToExcelSerial(isoDate: string): number {
  const parsed = parseISODate(isoDate);
  const utcMs = Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  return Math.round((utcMs - EXCEL_EPOCH_MS) / MS_PER_DAY);
}

function formatReadableDate(isoDate: string): string {
  const d = parseISODate(isoDate);
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function toARGB(hex: string): string {
  const clean = hex.replace('#', '').toUpperCase();
  return clean.length === 8 ? clean : `FF${clean}`;
}

function buildWbsMap(tasks: readonly Task[], prefix = ''): Map<number, string> {
  const map = new Map<number, string>();
  tasks.forEach((task, idx) => {
    const code = prefix ? `${prefix}.${idx + 1}` : `${idx + 1}`;
    map.set(task.id, `#${code}`);
    if (task.children?.length) {
      buildWbsMap(task.children, code).forEach((v, k) => map.set(k, v));
    }
  });
  return map;
}

function measureWidth(text: string, opts: { bold?: boolean; indent?: number } = {}): number {
  const lines = text.split(/\r?\n/);
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const boldFactor = opts.bold ? 1.1 : 1.0;
  const indentPadding = (opts.indent ?? 0) * 2.4;
  return Math.ceil(longest * boldFactor + indentPadding + 3.5);
}

function clampWidth(width: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number(width.toFixed(1))));
}

/**
 * Deduplicating OOXML StyleSheet registry that guarantees strict ECMA-376 element ordering
 * (including mandatory `none` and `gray125` built-in fills at indices 0 and 1).
 */
class StyleRegistry {
  private readonly fonts: FontSpec[] = [{ size: 10, color: '0F172A', name: 'Calibri' }];
  private readonly fontKeyToId = new Map<string, number>([['10|0F172A|0|0|Calibri', 0]]);

  // Index 0 = none, Index 1 = gray125 (required by Excel!)
  private readonly fills: Array<{ type: 'none' | 'gray125' | 'solid'; color?: string }> = [
    { type: 'none' },
    { type: 'gray125' },
  ];
  private readonly fillKeyToId = new Map<string, number>();

  private readonly borders: BorderSpec[] = [{}];
  private readonly borderKeyToId = new Map<string, number>([['{}', 0]]);

  private readonly xfs: Array<{
    numFmtId: number;
    fontId: number;
    fillId: number;
    borderId: number;
    alignment?: AlignmentSpec;
  }> = [{ numFmtId: 0, fontId: 0, fillId: 0, borderId: 0 }];
  private readonly xfKeyToId = new Map<string, number>([['0|0|0|0|', 0]]);

  private registerFont(spec?: FontSpec): number {
    if (!spec) return 0;
    const name = spec.name ?? 'Calibri';
    const color = spec.color.replace('#', '').toUpperCase();
    const key = `${spec.size}|${color}|${spec.bold ? 1 : 0}|${spec.italic ? 1 : 0}|${name}`;
    const existing = this.fontKeyToId.get(key);
    if (existing !== undefined) return existing;
    const id = this.fonts.length;
    this.fonts.push({ ...spec, color, name });
    this.fontKeyToId.set(key, id);
    return id;
  }

  private registerFill(colorHex?: string): number {
    if (!colorHex) return 0;
    const color = colorHex.replace('#', '').toUpperCase();
    const existing = this.fillKeyToId.get(color);
    if (existing !== undefined) return existing;
    const id = this.fills.length;
    this.fills.push({ type: 'solid', color });
    this.fillKeyToId.set(color, id);
    return id;
  }

  private registerBorder(spec?: BorderSpec): number {
    if (!spec || (!spec.left && !spec.right && !spec.top && !spec.bottom)) return 0;
    const key = JSON.stringify(spec);
    const existing = this.borderKeyToId.get(key);
    if (existing !== undefined) return existing;
    const id = this.borders.length;
    this.borders.push(spec);
    this.borderKeyToId.set(key, id);
    return id;
  }

  register(spec: CellStyleSpec): number {
    const fontId = this.registerFont(spec.font);
    const fillId = this.registerFill(spec.fill);
    const borderId = this.registerBorder(spec.border);
    const numFmtId = spec.numFmtId ?? 0;
    const alignKey = spec.alignment ? JSON.stringify(spec.alignment) : '';
    const key = `${numFmtId}|${fontId}|${fillId}|${borderId}|${alignKey}`;
    const existing = this.xfKeyToId.get(key);
    if (existing !== undefined) return existing;

    const id = this.xfs.length;
    this.xfs.push({ numFmtId, fontId, fillId, borderId, alignment: spec.alignment });
    this.xfKeyToId.set(key, id);
    return id;
  }

  toXml(): string {
    const numFmtsXml = [
      `<numFmt numFmtId="${NUM_FMT_DATE}" formatCode="mmm d, yyyy"/>`,
      `<numFmt numFmtId="${NUM_FMT_PERCENT}" formatCode="0%"/>`,
      `<numFmt numFmtId="${NUM_FMT_INT}" formatCode="#,##0"/>`,
      `<numFmt numFmtId="${NUM_FMT_SLIP}" formatCode="+#,##0;-#,##0;0"/>`,
    ].join('');

    const fontsXml = this.fonts
      .map((f) => {
        const b = f.bold ? '<b/>' : '';
        const i = f.italic ? '<i/>' : '';
        return `<font>${b}${i}<sz val="${f.size}"/><color rgb="${toARGB(f.color)}"/><name val="${escapeXmlAttr(f.name ?? 'Calibri')}"/></font>`;
      })
      .join('');

    const fillsXml = this.fills
      .map((f) => {
        if (f.type === 'none') return '<fill><patternFill patternType="none"/></fill>';
        if (f.type === 'gray125') return '<fill><patternFill patternType="gray125"/></fill>';
        const rgb = toARGB(f.color!);
        return `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;
      })
      .join('');

    const renderSide = (tag: string, side?: BorderSideSpec): string => {
      if (!side) return `<${tag}/>`;
      return `<${tag} style="${side.style}"><color rgb="${toARGB(side.color)}"/></${tag}>`;
    };

    const bordersXml = this.borders
      .map(
        (b) =>
          `<border>${renderSide('left', b.left)}${renderSide('right', b.right)}${renderSide('top', b.top)}${renderSide('bottom', b.bottom)}<diagonal/></border>`,
      )
      .join('');

    const xfsXml = this.xfs
      .map((xf) => {
        const attrs = [
          `numFmtId="${xf.numFmtId}"`,
          `fontId="${xf.fontId}"`,
          `fillId="${xf.fillId}"`,
          `borderId="${xf.borderId}"`,
          'xfId="0"',
        ];
        if (xf.numFmtId !== 0) attrs.push('applyNumberFormat="1"');
        if (xf.fontId !== 0) attrs.push('applyFont="1"');
        if (xf.fillId !== 0) attrs.push('applyFill="1"');
        if (xf.borderId !== 0) attrs.push('applyBorder="1"');
        if (xf.alignment) {
          attrs.push('applyAlignment="1"');
          const aAttrs: string[] = [];
          if (xf.alignment.horizontal) aAttrs.push(`horizontal="${xf.alignment.horizontal}"`);
          if (xf.alignment.vertical) aAttrs.push(`vertical="${xf.alignment.vertical}"`);
          if (xf.alignment.wrapText) aAttrs.push('wrapText="1"');
          if (xf.alignment.indent && xf.alignment.indent > 0) {
            aAttrs.push(`indent="${xf.alignment.indent}"`);
          }
          return `<xf ${attrs.join(' ')}><alignment ${aAttrs.join(' ')}/></xf>`;
        }
        return `<xf ${attrs.join(' ')}/>`;
      })
      .join('');

    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      `<numFmts count="4">${numFmtsXml}</numFmts>` +
      `<fonts count="${this.fonts.length}">${fontsXml}</fonts>` +
      `<fills count="${this.fills.length}">${fillsXml}</fills>` +
      `<borders count="${this.borders.length}">${bordersXml}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfs.length}">${xfsXml}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>'
    );
  }
}

function buildTimelineBuckets(
  tasks: readonly FlatTask[],
  baseline: WorkspaceBaseline | null,
  todayISO: string,
): {
  buckets: TimelineBucket[];
  scale: XlsxTimelineScale;
  minStartISO: string;
  maxEndISO: string;
} {
  let minStartISO = tasks[0]?.start ?? todayISO;
  let maxEndISO = tasks[0]?.end ?? todayISO;

  for (const t of tasks) {
    if (diffDaysISO(t.start, minStartISO) > 0) minStartISO = t.start;
    if (diffDaysISO(maxEndISO, t.end) > 0) maxEndISO = t.end;
    const b = baseline?.entries[t.id];
    if (b?.start && diffDaysISO(b.start, minStartISO) > 0) minStartISO = b.start;
    if (b?.end && diffDaysISO(maxEndISO, b.end) > 0) maxEndISO = b.end;
  }

  const totalSpanDays = getInclusiveDurationDays(minStartISO, maxEndISO);
  const buckets: TimelineBucket[] = [];

  if (totalSpanDays <= 180) {
    // Daily scale: 1 day padding on each side for visual breathing room
    const rangeStart = addDaysISO(minStartISO, -1);
    const rangeEnd = addDaysISO(maxEndISO, 2);
    const days = getInclusiveDurationDays(rangeStart, rangeEnd);

    for (let i = 0; i < days; i++) {
      const iso = addDaysISO(rangeStart, i);
      const d = parseISODate(iso);
      const dow = d.getDay();
      buckets.push({
        startISO: iso,
        endISO: iso,
        label: String(d.getDate()),
        groupLabel: `${MONTH_UPPER[d.getMonth()]} ${d.getFullYear()}`,
        isWeekend: dow === 0 || dow === 6,
        isToday: iso === todayISO,
      });
    }
    return { buckets, scale: 'daily', minStartISO, maxEndISO };
  }

  if (totalSpanDays <= 540) {
    // Weekly scale (Monday-aligned weeks)
    const startDate = parseISODate(minStartISO);
    const daysSinceMon = (startDate.getDay() + 6) % 7;
    let cursorISO = addDaysISO(minStartISO, -daysSinceMon);
    const endLimit = addDaysISO(maxEndISO, 6);

    while (diffDaysISO(cursorISO, endLimit) >= 0) {
      const weekEndISO = addDaysISO(cursorISO, 6);
      const d = parseISODate(cursorISO);
      buckets.push({
        startISO: cursorISO,
        endISO: weekEndISO,
        label: `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`,
        groupLabel: `${MONTH_UPPER[d.getMonth()]} ${d.getFullYear()}`,
        isWeekend: false,
        isToday: diffDaysISO(cursorISO, todayISO) >= 0 && diffDaysISO(todayISO, weekEndISO) >= 0,
      });
      cursorISO = addDaysISO(cursorISO, 7);
    }
    return { buckets, scale: 'weekly', minStartISO, maxEndISO };
  }

  // Monthly scale for multi-year roadmaps
  const startDate = parseISODate(minStartISO);
  const endDate = parseISODate(maxEndISO);
  let y = startDate.getFullYear();
  let m = startDate.getMonth();
  const endY = endDate.getFullYear();
  const endM = endDate.getMonth();

  while (y < endY || (y === endY && m <= endM)) {
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const startISO = formatISODate(first);
    const endISO = formatISODate(last);
    buckets.push({
      startISO,
      endISO,
      label: MONTH_SHORT[m]!,
      groupLabel: String(y),
      isWeekend: false,
      isToday: diffDaysISO(startISO, todayISO) >= 0 && diffDaysISO(todayISO, endISO) >= 0,
    });
    m += 1;
    if (m >= 12) {
      m = 0;
      y += 1;
    }
  }
  return { buckets, scale: 'monthly', minStartISO, maxEndISO };
}

function renderCellXml(cell: CellDef, rowNum: number): string {
  const ref = cellRef(cell.col, rowNum);
  const styleAttr = cell.styleId > 0 ? ` s="${cell.styleId}"` : '';

  switch (cell.type) {
    case 'empty':
      return `<c r="${ref}"${styleAttr}/>`;
    case 'num':
      return `<c r="${ref}"${styleAttr}><v>${cell.value ?? 0}</v></c>`;
    case 'str': {
      const escaped = escapeXmlText(String(cell.value ?? ''));
      return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${escaped}</t></is></c>`;
    }
    case 'formula-num':
      return `<c r="${ref}"${styleAttr}><f>${escapeXmlText(cell.formula ?? '0')}</f><v>${cell.value ?? 0}</v></c>`;
    case 'formula-str':
      return `<c r="${ref}"${styleAttr} t="str"><f>${escapeXmlText(cell.formula ?? '""')}</f><v>${escapeXmlText(String(cell.value ?? ''))}</v></c>`;
  }
}

function renderWorksheetXml(params: {
  rows: readonly RowDef[];
  colWidths: readonly number[];
  merges?: readonly string[];
  autoFilterRef?: string;
  freeze?: { xSplit?: number; ySplit?: number };
  tabSelected?: boolean;
  showGridLines?: boolean;
  landscape?: boolean;
}): string {
  const {
    rows,
    colWidths,
    merges = [],
    autoFilterRef,
    freeze,
    tabSelected = false,
    showGridLines = true,
    landscape = true,
  } = params;

  const maxRow = rows.reduce((max, r) => Math.max(max, r.rowNum), 1);
  const maxCol = Math.max(
    colWidths.length,
    rows.reduce((max, r) => r.cells.reduce((cm, c) => Math.max(cm, c.col), max), 1),
  );
  const dimensionRef = `A1:${cellRef(maxCol, maxRow)}`;

  const sheetViewAttrs = [
    tabSelected ? 'tabSelected="1"' : null,
    showGridLines ? null : 'showGridLines="0"',
    'workbookViewId="0"',
  ]
    .filter(Boolean)
    .join(' ');

  let paneXml = '';
  if (freeze && ((freeze.xSplit ?? 0) > 0 || (freeze.ySplit ?? 0) > 0)) {
    const x = freeze.xSplit ?? 0;
    const y = freeze.ySplit ?? 0;
    const topLeft = cellRef(x + 1, y + 1);
    const activePane = x > 0 && y > 0 ? 'bottomRight' : x > 0 ? 'topRight' : 'bottomLeft';
    const paneAttrs = [
      x > 0 ? `xSplit="${x}"` : null,
      y > 0 ? `ySplit="${y}"` : null,
      `topLeftCell="${topLeft}"`,
      `activePane="${activePane}"`,
      'state="frozen"',
    ]
      .filter(Boolean)
      .join(' ');
    paneXml = `<pane ${paneAttrs}/><selection pane="${activePane}" activeCell="${topLeft}" sqref="${topLeft}"/>`;
  }

  const colsXml =
    colWidths.length > 0
      ? `<cols>${colWidths
          .map(
            (w, idx) =>
              `<col min="${idx + 1}" max="${idx + 1}" width="${w.toFixed(1)}" customWidth="1"/>`,
          )
          .join('')}</cols>`
      : '';

  const sheetDataXml = rows
    .map((row) => {
      const sortedCells = [...row.cells].sort((a, b) => a.col - b.col);
      const heightAttr = row.height ? ` ht="${row.height}" customHeight="1"` : '';
      return `<row r="${row.rowNum}"${heightAttr}>${sortedCells
        .map((c) => renderCellXml(c, row.rowNum))
        .join('')}</row>`;
    })
    .join('');

  const autoFilterXml = autoFilterRef ? `<autoFilter ref="${autoFilterRef}"/>` : '';
  const mergeXml =
    merges.length > 0
      ? `<mergeCells count="${merges.length}">${merges
          .map((m) => `<mergeCell ref="${m}"/>`)
          .join('')}</mergeCells>`
      : '';

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    `<dimension ref="${dimensionRef}"/>` +
    `<sheetViews><sheetView ${sheetViewAttrs}>${paneXml}</sheetView></sheetViews>` +
    '<sheetFormatPr defaultRowHeight="20"/>' +
    colsXml +
    `<sheetData>${sheetDataXml}</sheetData>` +
    autoFilterXml +
    mergeXml +
    '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.25" footer="0.25"/>' +
    `<pageSetup orientation="${landscape ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>` +
    '</worksheet>'
  );
}

type DisplayStatus = 'Completed' | 'Working' | 'Not Started' | 'Overdue';

function resolveDisplayStatus(task: FlatTask, todayISO: string): DisplayStatus {
  const status = getTaskStatus(task);
  if (status === 'completed') return 'Completed';
  if (diffDaysISO(task.end, todayISO) > 0) return 'Overdue';
  if (status === 'working') return 'Working';
  return 'Not Started';
}

/**
 * Generates a full styled 3-sheet Excel (`.xlsx`) Gantt workbook:
 * 1. `Gantt Chart` — Auto-fitted task schedule paired directly with a color-coded timeline diagram
 * 2. `Task Details` — Full structured task register with WBS, dependencies, critical path, baseline slip, & descriptions
 * 3. `Summary & Legend` — Live cross-sheet Excel formulas, phase progress bars, and color legend
 */
export function buildTasksXlsxWorkbook(
  tasks: readonly Task[],
  options: BuildXlsxOptions = {},
): BuiltXlsxWorkbook {
  const title = (options.workspaceTitle || 'Sked Project').trim() || 'Sked Project';
  const baseline = options.baseline ?? null;
  const hasBaseline = Boolean(baseline && Object.keys(baseline.entries).length > 0);
  const todayISO = options.todayISO ?? formatISODate(getTodayLocal());

  const flat = flattenTasks(tasks);
  const byId = new Map(flat.map((t) => [t.id, t]));
  const wbsMap = buildWbsMap(tasks);
  const criticalPath = computeCriticalPath(tasks);
  const { buckets, scale, minStartISO, maxEndISO } = buildTimelineBuckets(flat, baseline, todayISO);

  const resolveRootPhaseName = (taskId: number): string => {
    let curr = byId.get(taskId);
    const seen = new Set<number>();
    while (curr && curr.parentId !== null && curr.parentId !== undefined) {
      if (seen.has(curr.id)) break;
      seen.add(curr.id);
      const parent = byId.get(curr.parentId);
      if (!parent) break;
      curr = parent;
    }
    return curr?.name ?? '';
  };

  const styles = new StyleRegistry();

  // Shared semantic borders
  const hairlineGrid: BorderSpec = {
    left: { style: 'thin', color: 'E2E8F0' },
    right: { style: 'thin', color: 'E2E8F0' },
    top: { style: 'thin', color: 'E2E8F0' },
    bottom: { style: 'thin', color: 'E2E8F0' },
  };
  const phaseBorder: BorderSpec = {
    left: { style: 'thin', color: 'CBD5E1' },
    right: { style: 'thin', color: 'CBD5E1' },
    top: { style: 'thin', color: '94A3B8' },
    bottom: { style: 'thin', color: 'CBD5E1' },
  };
  const headerBorder: BorderSpec = {
    left: { style: 'thin', color: '334155' },
    right: { style: 'thin', color: '334155' },
    top: { style: 'thin', color: '0F172A' },
    bottom: { style: 'medium', color: '0F172A' },
  };
  const kpiBorder: BorderSpec = {
    top: { style: 'thin', color: 'CBD5E1' },
    bottom: { style: 'thin', color: 'CBD5E1' },
  };
  const cardBorder: BorderSpec = {
    left: { style: 'thin', color: 'CBD5E1' },
    right: { style: 'thin', color: 'CBD5E1' },
    top: { style: 'thin', color: 'CBD5E1' },
    bottom: { style: 'thin', color: 'CBD5E1' },
  };

  // Shared style IDs
  const sTitleBanner = styles.register({
    font: { size: 14, color: 'FFFFFF', bold: true },
    fill: '0F172A',
    alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
  });
  const sTitleMeta = styles.register({
    font: { size: 9, color: 'CBD5E1' },
    fill: '0F172A',
    alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
  });
  const sKpiLabel = styles.register({
    font: { size: 9, color: '475569', bold: true },
    fill: 'F1F5F9',
    border: kpiBorder,
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  const sKpiText = styles.register({
    font: { size: 9, color: '1E293B', bold: true },
    fill: 'F1F5F9',
    border: kpiBorder,
    alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
  });
  const sKpiDate = styles.register({
    font: { size: 9, color: '1E293B', bold: true },
    fill: 'F1F5F9',
    border: kpiBorder,
    numFmtId: NUM_FMT_DATE,
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  const sKpiInt = styles.register({
    font: { size: 9, color: '1E293B', bold: true },
    fill: 'F1F5F9',
    border: kpiBorder,
    numFmtId: NUM_FMT_INT,
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  const sKpiPct = styles.register({
    font: { size: 9, color: '1D4ED8', bold: true },
    fill: 'F1F5F9',
    border: kpiBorder,
    numFmtId: NUM_FMT_PERCENT,
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  const sSectionHeader = styles.register({
    font: { size: 9, color: 'E2E8F0', bold: true },
    fill: '1E293B',
    border: headerBorder,
    alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
  });
  const sMonthEven = styles.register({
    font: { size: 9, color: 'FFFFFF', bold: true },
    fill: '1E3A8A',
    border: {
      left: { style: 'thin', color: 'FFFFFF' },
      right: { style: 'thin', color: 'FFFFFF' },
      top: { style: 'thin', color: '1E3A8A' },
      bottom: { style: 'thin', color: '1E3A8A' },
    },
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  const sMonthOdd = styles.register({
    font: { size: 9, color: 'FFFFFF', bold: true },
    fill: '2563EB',
    border: {
      left: { style: 'thin', color: 'FFFFFF' },
      right: { style: 'thin', color: 'FFFFFF' },
      top: { style: 'thin', color: '2563EB' },
      bottom: { style: 'thin', color: '2563EB' },
    },
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  const sTableHeader = styles.register({
    font: { size: 10, color: 'FFFFFF', bold: true },
    fill: '1E293B',
    border: headerBorder,
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  const sTableHeaderLeft = styles.register({
    font: { size: 10, color: 'FFFFFF', bold: true },
    fill: '1E293B',
    border: headerBorder,
    alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
  });
  const sDayHeader = styles.register({
    font: { size: 8, color: '475569', bold: true },
    fill: 'F8FAFC',
    border: {
      left: { style: 'thin', color: 'E2E8F0' },
      right: { style: 'thin', color: 'E2E8F0' },
      bottom: { style: 'medium', color: '94A3B8' },
    },
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  const sDayHeaderWeekend = styles.register({
    font: { size: 8, color: '64748B' },
    fill: 'E2E8F0',
    border: {
      left: { style: 'thin', color: 'CBD5E1' },
      right: { style: 'thin', color: 'CBD5E1' },
      bottom: { style: 'medium', color: '94A3B8' },
    },
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  const sDayHeaderToday = styles.register({
    font: { size: 8, color: '1D4ED8', bold: true },
    fill: 'DBEAFE',
    border: {
      left: { style: 'thin', color: '93C5FD' },
      right: { style: 'thin', color: '93C5FD' },
      bottom: { style: 'medium', color: '2563EB' },
    },
    alignment: { horizontal: 'center', vertical: 'center' },
  });

  // Status badge styles
  const statusStyles: Record<DisplayStatus, number> = {
    Completed: styles.register({
      font: { size: 9, color: '166534', bold: true },
      fill: 'DCFCE7',
      border: hairlineGrid,
      alignment: { horizontal: 'center', vertical: 'center' },
    }),
    Working: styles.register({
      font: { size: 9, color: '1E40AF', bold: true },
      fill: 'DBEAFE',
      border: hairlineGrid,
      alignment: { horizontal: 'center', vertical: 'center' },
    }),
    'Not Started': styles.register({
      font: { size: 9, color: '475569', bold: true },
      fill: 'F1F5F9',
      border: hairlineGrid,
      alignment: { horizontal: 'center', vertical: 'center' },
    }),
    Overdue: styles.register({
      font: { size: 9, color: 'BE123C', bold: true },
      fill: 'FFE4E6',
      border: hairlineGrid,
      alignment: { horizontal: 'center', vertical: 'center' },
    }),
  };

  const sCriticalYes = styles.register({
    font: { size: 9, color: 'BE123C', bold: true },
    fill: 'FFE4E6',
    border: hairlineGrid,
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  const sCriticalNo = styles.register({
    font: { size: 9, color: '94A3B8' },
    fill: 'FFFFFF',
    border: hairlineGrid,
    alignment: { horizontal: 'center', vertical: 'center' },
  });

  const makeRowCellStyle = (
    variant: 'phase' | 'even' | 'odd',
    opts: {
      align?: 'left' | 'center' | 'right';
      indent?: number;
      numFmtId?: number;
      bold?: boolean;
      italic?: boolean;
      color?: string;
      wrapText?: boolean;
    } = {},
  ): number => {
    const fill = variant === 'phase' ? 'EEF2FF' : variant === 'odd' ? 'F8FAFC' : 'FFFFFF';
    const border = variant === 'phase' ? phaseBorder : hairlineGrid;
    return styles.register({
      font: {
        size: 10,
        color: opts.color ?? (variant === 'phase' ? '0F172A' : '1E293B'),
        bold: opts.bold ?? variant === 'phase',
        italic: opts.italic,
      },
      fill,
      border,
      numFmtId: opts.numFmtId,
      alignment: {
        horizontal: opts.align ?? 'left',
        vertical: 'center',
        indent: opts.indent,
        wrapText: opts.wrapText,
      },
    });
  };

  // Timeline bar & empty cell styles
  const sEmptyWeekday = styles.register({
    fill: 'FFFFFF',
    border: {
      left: { style: 'thin', color: 'F1F5F9' },
      right: { style: 'thin', color: 'F1F5F9' },
      bottom: { style: 'thin', color: 'E2E8F0' },
    },
  });
  const sEmptyPhase = styles.register({
    fill: 'F8FAFC',
    border: {
      left: { style: 'thin', color: 'E2E8F0' },
      right: { style: 'thin', color: 'E2E8F0' },
      top: { style: 'thin', color: 'CBD5E1' },
      bottom: { style: 'thin', color: 'CBD5E1' },
    },
  });
  const sEmptyWeekend = styles.register({
    fill: 'F1F5F9',
    border: {
      left: { style: 'thin', color: 'E2E8F0' },
      right: { style: 'thin', color: 'E2E8F0' },
      bottom: { style: 'thin', color: 'E2E8F0' },
    },
  });
  const sEmptyToday = styles.register({
    fill: 'EFF6FF',
    border: {
      left: { style: 'thin', color: 'BFDBFE' },
      right: { style: 'thin', color: 'BFDBFE' },
      bottom: { style: 'thin', color: 'E2E8F0' },
    },
  });
  const sBaselineGhost = styles.register({
    fill: 'FEF3C7',
    border: {
      left: { style: 'dashed', color: 'F59E0B' },
      right: { style: 'dashed', color: 'F59E0B' },
      top: { style: 'dashed', color: 'F59E0B' },
      bottom: { style: 'dashed', color: 'F59E0B' },
    },
  });

  const makeBarStyle = (fillHex: string, isCritical: boolean): number =>
    styles.register({
      fill: fillHex,
      border: isCritical
        ? {
            top: { style: 'medium', color: 'E11D48' },
            bottom: { style: 'medium', color: 'E11D48' },
          }
        : {
            top: { style: 'thin', color: 'FFFFFF' },
            bottom: { style: 'thin', color: 'FFFFFF' },
          },
    });

  const makeMilestoneStyle = (fillHex: string, textHex: string, isCritical: boolean): number =>
    styles.register({
      font: { size: 11, color: textHex, bold: true },
      fill: fillHex,
      border: isCritical
        ? {
            left: { style: 'thin', color: 'E11D48' },
            right: { style: 'thin', color: 'E11D48' },
            top: { style: 'medium', color: 'E11D48' },
            bottom: { style: 'medium', color: 'E11D48' },
          }
        : hairlineGrid,
      alignment: { horizontal: 'center', vertical: 'center' },
    });

  const resolveBarCellStyle = (
    task: FlatTask,
    displayStatus: DisplayStatus,
    isCritical: boolean,
    progressRatio: number, // 0..1 position of this cell within the task's bar
  ): { styleId: number; symbol?: string } => {
    const deadline = isTaskDeadline(task);
    if (deadline) {
      if (displayStatus === 'Completed') {
        return { styleId: makeMilestoneStyle('D1FAE5', '059669', isCritical), symbol: '◆' };
      }
      if (displayStatus === 'Overdue') {
        return { styleId: makeMilestoneStyle('FFE4E6', 'BE123C', isCritical), symbol: '◆' };
      }
      return { styleId: makeMilestoneStyle('FEF3C7', 'D97706', isCritical), symbol: '◆' };
    }

    const pct = Math.max(0, Math.min(100, task.progress ?? 0)) / 100;
    const isCompletedSlice = pct > 0 && progressRatio <= pct;

    if (task.hasChildren) {
      if (displayStatus === 'Completed') return { styleId: makeBarStyle('059669', isCritical) };
      if (displayStatus === 'Overdue') {
        return { styleId: makeBarStyle(isCompletedSlice ? '9F1239' : 'FB7185', isCritical) };
      }
      if (pct > 0) {
        return { styleId: makeBarStyle(isCompletedSlice ? '1E3A8A' : '818CF8', isCritical) };
      }
      return { styleId: makeBarStyle('475569', isCritical) };
    }

    if (displayStatus === 'Completed') return { styleId: makeBarStyle('10B981', isCritical) };
    if (displayStatus === 'Overdue') {
      return { styleId: makeBarStyle(isCompletedSlice ? 'BE123C' : 'FDA4AF', isCritical) };
    }
    if (displayStatus === 'Working') {
      return { styleId: makeBarStyle(isCompletedSlice ? '2563EB' : '93C5FD', isCritical) };
    }
    return { styleId: makeBarStyle('94A3B8', isCritical) };
  };

  // =========================================================================
  // SHEET 1: Gantt Chart (Task Table A..G + Color-Coded Timeline Diagram H..)
  // =========================================================================
  const TABLE_COL_COUNT = 7;
  const GANTT_START_COL = TABLE_COL_COUNT + 1; // Column H (8)
  const GANTT_FIRST_DATA_ROW = 5;
  const GANTT_LAST_DATA_ROW = Math.max(GANTT_FIRST_DATA_ROW, GANTT_FIRST_DATA_ROW + flat.length - 1);

  const ganttRows: RowDef[] = [];
  const ganttMerges: string[] = [];

  // Summary pre-computed cached values for live KPI strip formulas
  const totalCount = flat.length;
  const completedCount = flat.filter((t) => resolveDisplayStatus(t, todayISO) === 'Completed').length;
  const workingCount = flat.filter((t) => resolveDisplayStatus(t, todayISO) === 'Working').length;
  const overdueCount = flat.filter((t) => resolveDisplayStatus(t, todayISO) === 'Overdue').length;
  const notStartedCount = totalCount - completedCount - workingCount - overdueCount;
  const avgProgress =
    totalCount > 0
      ? flat.reduce((acc, t) => acc + Math.max(0, Math.min(100, t.progress ?? 0)) / 100, 0) /
        totalCount
      : 0;
  const spanDays = getInclusiveDurationDays(minStartISO, maxEndISO);

  // Row 1: Title Banner spanning the full sheet width cleanly
  const fullTimelineEndCol = GANTT_START_COL + buckets.length - 1;
  const titleSpanEnd = Math.min(GANTT_START_COL + Math.max(buckets.length, 8) - 1, GANTT_START_COL + 15);
  const titleCells: CellDef[] = [
    { col: 1, styleId: sTitleBanner, type: 'str', value: `${title} — Gantt Schedule` },
  ];
  for (let c = 2; c <= TABLE_COL_COUNT; c++) {
    titleCells.push({ col: c, styleId: sTitleBanner, type: 'empty' });
  }
  ganttMerges.push(`A1:${columnIndexToLetter(TABLE_COL_COUNT)}1`);

  if (buckets.length > 0) {
    const scaleLabel = scale === 'daily' ? 'Daily' : scale === 'weekly' ? 'Weekly' : 'Monthly';
    titleCells.push({
      col: GANTT_START_COL,
      styleId: sTitleMeta,
      type: 'str',
      value: `${formatReadableDate(minStartISO)} – ${formatReadableDate(maxEndISO)}  ·  ${scaleLabel} View  ·  Exported ${formatReadableDate(todayISO)}`,
    });
    for (let c = GANTT_START_COL + 1; c <= Math.max(titleSpanEnd, fullTimelineEndCol); c++) {
      titleCells.push({ col: c, styleId: sTitleMeta, type: 'empty' });
    }
    if (titleSpanEnd > GANTT_START_COL) {
      ganttMerges.push(`${columnIndexToLetter(GANTT_START_COL)}1:${columnIndexToLetter(titleSpanEnd)}1`);
    }
  }
  ganttRows.push({ rowNum: 1, height: 32, cells: titleCells });

  // Row 2: Live Formula KPI Strip spanning cleanly across table & timeline
  const kpiSummaryCached = `${totalCount} tasks · ${completedCount} done · ${workingCount} active · ${overdueCount} overdue`;
  const kpiSummaryFormula =
    `COUNTA(A${GANTT_FIRST_DATA_ROW}:A${GANTT_LAST_DATA_ROW})&" tasks · "` +
    `&COUNTIF(C${GANTT_FIRST_DATA_ROW}:C${GANTT_LAST_DATA_ROW},"Completed")&" done · "` +
    `&COUNTIF(C${GANTT_FIRST_DATA_ROW}:C${GANTT_LAST_DATA_ROW},"Working")&" active · "` +
    `&COUNTIF(C${GANTT_FIRST_DATA_ROW}:C${GANTT_LAST_DATA_ROW},"Overdue")&" overdue"`;

  const row2Cells: CellDef[] = [
    { col: 1, styleId: sKpiLabel, type: 'str', value: 'OVERVIEW' },
    {
      col: 2,
      styleId: sKpiText,
      type: 'formula-str',
      formula: kpiSummaryFormula,
      value: kpiSummaryCached,
    },
    { col: 3, styleId: sKpiText, type: 'empty' },
    {
      col: 4,
      styleId: sKpiDate,
      type: 'formula-num',
      formula: `MIN(D${GANTT_FIRST_DATA_ROW}:D${GANTT_LAST_DATA_ROW})`,
      value: isoToExcelSerial(minStartISO),
    },
    {
      col: 5,
      styleId: sKpiDate,
      type: 'formula-num',
      formula: `MAX(E${GANTT_FIRST_DATA_ROW}:E${GANTT_LAST_DATA_ROW})`,
      value: isoToExcelSerial(maxEndISO),
    },
    {
      col: 6,
      styleId: sKpiInt,
      type: 'formula-num',
      formula: 'MAX(1,E2-D2+1)',
      value: spanDays,
    },
    {
      col: 7,
      styleId: sKpiPct,
      type: 'formula-num',
      formula: `IFERROR(AVERAGE(G${GANTT_FIRST_DATA_ROW}:G${GANTT_LAST_DATA_ROW}),0)`,
      value: Number(avgProgress.toFixed(4)),
    },
  ];
  for (let c = GANTT_START_COL; c <= Math.max(titleSpanEnd, fullTimelineEndCol); c++) {
    row2Cells.push({ col: c, styleId: sKpiText, type: 'empty' });
  }
  ganttRows.push({ rowNum: 2, height: 22, cells: row2Cells });
  ganttMerges.push('B2:C2');

  // Row 3: Section & Month Super-Header Row
  const row3Cells: CellDef[] = [
    { col: 1, styleId: sSectionHeader, type: 'str', value: 'TASK SCHEDULE' },
  ];
  for (let c = 2; c <= TABLE_COL_COUNT; c++) {
    row3Cells.push({ col: c, styleId: sSectionHeader, type: 'empty' });
  }
  ganttMerges.push(`A3:${columnIndexToLetter(TABLE_COL_COUNT)}3`);

  // Group timeline buckets by month/year label
  let groupIdx = 0;
  let bIdx = 0;
  while (bIdx < buckets.length) {
    const groupLabel = buckets[bIdx]!.groupLabel;
    const startCol = GANTT_START_COL + bIdx;
    let endIdx = bIdx;
    while (endIdx + 1 < buckets.length && buckets[endIdx + 1]!.groupLabel === groupLabel) {
      endIdx += 1;
    }
    const endCol = GANTT_START_COL + endIdx;
    const mStyle = groupIdx % 2 === 0 ? sMonthEven : sMonthOdd;
    row3Cells.push({ col: startCol, styleId: mStyle, type: 'str', value: groupLabel });
    for (let c = startCol + 1; c <= endCol; c++) {
      row3Cells.push({ col: c, styleId: mStyle, type: 'empty' });
    }
    if (endCol > startCol) {
      ganttMerges.push(`${columnIndexToLetter(startCol)}3:${columnIndexToLetter(endCol)}3`);
    }
    groupIdx += 1;
    bIdx = endIdx + 1;
  }
  ganttRows.push({ rowNum: 3, height: 21, cells: row3Cells });

  // Row 4: Table Column Headers + Timeline Day/Week/Month Labels
  const row4Cells: CellDef[] = [
    { col: 1, styleId: sTableHeader, type: 'str', value: 'WBS' },
    { col: 2, styleId: sTableHeaderLeft, type: 'str', value: 'Task Name' },
    { col: 3, styleId: sTableHeader, type: 'str', value: 'Status' },
    { col: 4, styleId: sTableHeader, type: 'str', value: 'Start Date' },
    { col: 5, styleId: sTableHeader, type: 'str', value: 'End Date' },
    { col: 6, styleId: sTableHeader, type: 'str', value: 'Days' },
    { col: 7, styleId: sTableHeader, type: 'str', value: 'Progress' },
  ];
  buckets.forEach((bucket, idx) => {
    const col = GANTT_START_COL + idx;
    const headerStyle = bucket.isToday
      ? sDayHeaderToday
      : bucket.isWeekend
        ? sDayHeaderWeekend
        : sDayHeader;
    row4Cells.push({ col, styleId: headerStyle, type: 'str', value: bucket.label });
  });
  ganttRows.push({ rowNum: 4, height: 24, cells: row4Cells });

  // Track auto-fit widths for Gantt table columns A..G
  let maxWbsW = measureWidth('WBS', { bold: true });
  let maxNameW = measureWidth('Task Name', { bold: true });

  // Data rows (Row 5+)
  flat.forEach((task, rowIdx) => {
    const rowNum = GANTT_FIRST_DATA_ROW + rowIdx;
    const wbs = wbsMap.get(task.id) ?? `#${task.id}`;
    const displayStatus = resolveDisplayStatus(task, todayISO);
    const isPhase = task.hasChildren;
    const deadline = isTaskDeadline(task);
    const isCritical = criticalPath.criticalTaskIds.has(task.id);
    const variant: 'phase' | 'even' | 'odd' = isPhase ? 'phase' : rowIdx % 2 === 0 ? 'even' : 'odd';
    const indent = Math.min(task.level, 4);
    const displayName = deadline ? `◆ ${task.name}` : task.name;
    const durationDays = getInclusiveDurationDays(task.start, task.end);
    const pct = Math.max(0, Math.min(100, task.progress ?? 0)) / 100;
    const baselineEntry = hasBaseline ? baseline?.entries[task.id] : undefined;

    maxWbsW = Math.max(maxWbsW, measureWidth(wbs, { bold: isPhase }));
    maxNameW = Math.max(maxNameW, measureWidth(displayName, { bold: isPhase, indent }));

    const progressColor =
      pct >= 1 ? '166534' : pct > 0 ? '1E40AF' : '64748B';

    const cells: CellDef[] = [
      {
        col: 1,
        styleId: makeRowCellStyle(variant, { align: 'center', color: isPhase ? '1E3A8A' : '64748B' }),
        type: 'str',
        value: wbs,
      },
      {
        col: 2,
        styleId: makeRowCellStyle(variant, { align: 'left', indent, italic: deadline && !isPhase }),
        type: 'str',
        value: displayName,
      },
      {
        col: 3,
        styleId: statusStyles[displayStatus],
        type: 'str',
        value: displayStatus,
      },
      {
        col: 4,
        styleId: makeRowCellStyle(variant, { align: 'center', numFmtId: NUM_FMT_DATE }),
        type: 'num',
        value: isoToExcelSerial(task.start),
      },
      {
        col: 5,
        styleId: makeRowCellStyle(variant, { align: 'center', numFmtId: NUM_FMT_DATE }),
        type: 'num',
        value: isoToExcelSerial(task.end),
      },
      {
        col: 6,
        styleId: makeRowCellStyle(variant, { align: 'center', numFmtId: NUM_FMT_INT }),
        type: 'formula-num',
        formula: `MAX(1,E${rowNum}-D${rowNum}+1)`,
        value: durationDays,
      },
      {
        col: 7,
        styleId: makeRowCellStyle(variant, {
          align: 'center',
          numFmtId: NUM_FMT_PERCENT,
          bold: pct > 0 || isPhase,
          color: progressColor,
        }),
        type: 'num',
        value: pct,
      },
    ];

    // Identify indices of buckets that overlap [task.start, task.end]
    const coveredIndices: number[] = [];
    buckets.forEach((bucket, idx) => {
      const overlapsTask =
        diffDaysISO(task.start, bucket.endISO) >= 0 && diffDaysISO(bucket.startISO, task.end) >= 0;
      if (overlapsTask) coveredIndices.push(idx);
    });
    const coveredSet = new Set(coveredIndices);
    const totalCovered = Math.max(1, coveredIndices.length);

    buckets.forEach((bucket, idx) => {
      const col = GANTT_START_COL + idx;
      if (coveredSet.has(idx)) {
        const slicePos = (coveredIndices.indexOf(idx) + 1) / totalCovered;
        const bar = resolveBarCellStyle(task, displayStatus, isCritical, slicePos);
        cells.push(
          bar.symbol
            ? { col, styleId: bar.styleId, type: 'str', value: bar.symbol }
            : { col, styleId: bar.styleId, type: 'empty' },
        );
        return;
      }

      const overlapsBaseline = Boolean(
        baselineEntry &&
          diffDaysISO(baselineEntry.start, bucket.endISO) >= 0 &&
          diffDaysISO(bucket.startISO, baselineEntry.end) >= 0,
      );
      if (overlapsBaseline) {
        cells.push({ col, styleId: sBaselineGhost, type: 'empty' });
        return;
      }

      const emptyStyle = bucket.isToday
        ? sEmptyToday
        : bucket.isWeekend
          ? sEmptyWeekend
          : isPhase
            ? sEmptyPhase
            : sEmptyWeekday;
      cells.push({ col, styleId: emptyStyle, type: 'empty' });
    });

    ganttRows.push({ rowNum, height: isPhase ? 23 : 20, cells });
  });

  const bucketColWidth = scale === 'daily' ? 3.8 : scale === 'weekly' ? 7.2 : 6.4;
  const ganttColWidths: number[] = [
    clampWidth(maxWbsW, 9.5, 14), // A: WBS
    clampWidth(maxNameW, 28, 46), // B: Task Name
    14.5, // C: Status
    14.5, // D: Start Date (mmm d, yyyy -> zero ####)
    14.5, // E: End Date
    8.5, // F: Days
    11, // G: Progress
    ...buckets.map(() => bucketColWidth),
  ];

  const sheet1Xml = renderWorksheetXml({
    rows: ganttRows,
    colWidths: ganttColWidths,
    merges: ganttMerges,
    autoFilterRef: `A4:${columnIndexToLetter(TABLE_COL_COUNT)}${GANTT_LAST_DATA_ROW}`,
    freeze: { xSplit: TABLE_COL_COUNT, ySplit: 4 },
    tabSelected: true,
    showGridLines: true,
    landscape: true,
  });

  // =========================================================================
  // SHEET 2: Task Details (Full Auto-Fitted Register with Dependencies & Baseline)
  // =========================================================================
  const detailHeaders = [
    'WBS',
    'Type',
    'Phase',
    'Parent Task',
    'Task Name',
    'Status',
    'Start Date',
    'End Date',
    'Duration (Days)',
    'Progress',
    'Critical Path',
    'Depends On',
    ...(hasBaseline ? ['Baseline Start', 'Baseline End', 'Slip (Days)'] : []),
    'Description',
  ];
  const detailColCount = detailHeaders.length;
  const detailColWidths = detailHeaders.map((h) => measureWidth(h, { bold: true }));
  const detailRows: RowDef[] = [];
  const detailMerges: string[] = [`A1:${columnIndexToLetter(detailColCount)}1`];

  // Row 1: Banner
  const detailTitleCells: CellDef[] = [
    { col: 1, styleId: sTitleBanner, type: 'str', value: `${title} — Complete Task Register` },
  ];
  for (let c = 2; c <= detailColCount; c++) {
    detailTitleCells.push({ col: c, styleId: sTitleBanner, type: 'empty' });
  }
  detailRows.push({ rowNum: 1, height: 30, cells: detailTitleCells });

  // Row 2: Column Headers
  detailRows.push({
    rowNum: 2,
    height: 24,
    cells: detailHeaders.map((h, i) => ({
      col: i + 1,
      styleId: i === 2 || i === 3 || i === 4 || i === 11 || i === detailColCount - 1 ? sTableHeaderLeft : sTableHeader,
      type: 'str',
      value: h,
    })),
  });

  const DETAIL_FIRST_ROW = 3;
  const DETAIL_LAST_ROW = Math.max(DETAIL_FIRST_ROW, DETAIL_FIRST_ROW + flat.length - 1);

  flat.forEach((task, idx) => {
    const rowNum = DETAIL_FIRST_ROW + idx;
    const isPhase = task.hasChildren;
    const deadline = isTaskDeadline(task);
    const variant: 'phase' | 'even' | 'odd' = isPhase ? 'phase' : idx % 2 === 0 ? 'even' : 'odd';
    const wbs = wbsMap.get(task.id) ?? `#${task.id}`;
    const typeLabel = isPhase
      ? 'Phase'
      : deadline
        ? 'Milestone'
        : task.isSubtask
          ? 'Subtask'
          : 'Task';
    const phaseName = resolveRootPhaseName(task.id);
    const parentName =
      task.parentId !== null && task.parentId !== undefined
        ? (byId.get(task.parentId)?.name ?? '')
        : '';
    const displayStatus = resolveDisplayStatus(task, todayISO);
    const durationDays = getInclusiveDurationDays(task.start, task.end);
    const pct = Math.max(0, Math.min(100, task.progress ?? 0)) / 100;
    const isCritical = criticalPath.criticalTaskIds.has(task.id);
    const resolvedDeps = (task.dependencies ?? [])
      .map((depId) => {
        const dep = byId.get(depId);
        if (!dep) return null;
        const depWbs = wbsMap.get(dep.id);
        return depWbs ? `${depWbs} ${dep.name}` : dep.name;
      })
      .filter((v): v is string => Boolean(v))
      .join('; ');
    const baselineEntry = hasBaseline ? baseline?.entries[task.id] : undefined;
    const slipDays = hasBaseline ? computeTaskBaselineSlipDays(task, baseline) : null;
    const desc = (task.description ?? '').trim();
    const indent = Math.min(task.level, 4);

    const rowCells: CellDef[] = [
      {
        col: 1,
        styleId: makeRowCellStyle(variant, { align: 'center', color: isPhase ? '1E3A8A' : '64748B' }),
        type: 'str',
        value: wbs,
      },
      {
        col: 2,
        styleId: makeRowCellStyle(variant, { align: 'center', color: '475569' }),
        type: 'str',
        value: typeLabel,
      },
      {
        col: 3,
        styleId: makeRowCellStyle(variant, { align: 'left' }),
        type: 'str',
        value: phaseName,
      },
      {
        col: 4,
        styleId: makeRowCellStyle(variant, { align: 'left', color: '475569' }),
        type: 'str',
        value: parentName,
      },
      {
        col: 5,
        styleId: makeRowCellStyle(variant, { align: 'left', indent }),
        type: 'str',
        value: task.name,
      },
      {
        col: 6,
        styleId: statusStyles[displayStatus],
        type: 'str',
        value: displayStatus,
      },
      {
        col: 7,
        styleId: makeRowCellStyle(variant, { align: 'center', numFmtId: NUM_FMT_DATE }),
        type: 'num',
        value: isoToExcelSerial(task.start),
      },
      {
        col: 8,
        styleId: makeRowCellStyle(variant, { align: 'center', numFmtId: NUM_FMT_DATE }),
        type: 'num',
        value: isoToExcelSerial(task.end),
      },
      {
        col: 9,
        styleId: makeRowCellStyle(variant, { align: 'center', numFmtId: NUM_FMT_INT }),
        type: 'formula-num',
        formula: `MAX(1,H${rowNum}-G${rowNum}+1)`,
        value: durationDays,
      },
      {
        col: 10,
        styleId: makeRowCellStyle(variant, {
          align: 'center',
          numFmtId: NUM_FMT_PERCENT,
          bold: pct > 0 || isPhase,
          color: pct >= 1 ? '166534' : pct > 0 ? '1E40AF' : '64748B',
        }),
        type: 'num',
        value: pct,
      },
      {
        col: 11,
        styleId: isCritical ? sCriticalYes : sCriticalNo,
        type: 'str',
        value: isCritical ? 'Yes' : 'No',
      },
      {
        col: 12,
        styleId: makeRowCellStyle(variant, { align: 'left', color: '475569' }),
        type: 'str',
        value: resolvedDeps,
      },
    ];

    let nextCol = 13;
    if (hasBaseline) {
      rowCells.push(
        baselineEntry?.start
          ? {
              col: nextCol,
              styleId: makeRowCellStyle(variant, { align: 'center', numFmtId: NUM_FMT_DATE }),
              type: 'num',
              value: isoToExcelSerial(baselineEntry.start),
            }
          : { col: nextCol, styleId: makeRowCellStyle(variant, { align: 'center' }), type: 'empty' },
      );
      nextCol += 1;

      rowCells.push(
        baselineEntry?.end
          ? {
              col: nextCol,
              styleId: makeRowCellStyle(variant, { align: 'center', numFmtId: NUM_FMT_DATE }),
              type: 'num',
              value: isoToExcelSerial(baselineEntry.end),
            }
          : { col: nextCol, styleId: makeRowCellStyle(variant, { align: 'center' }), type: 'empty' },
      );
      const baseEndColLetter = columnIndexToLetter(nextCol);
      nextCol += 1;

      const slipColor =
        slipDays !== null && slipDays > 0
          ? 'BE123C'
          : slipDays !== null && slipDays < 0
            ? '166534'
            : '64748B';
      rowCells.push(
        baselineEntry?.end && slipDays !== null
          ? {
              col: nextCol,
              styleId: makeRowCellStyle(variant, {
                align: 'center',
                numFmtId: NUM_FMT_SLIP,
                bold: slipDays !== 0,
                color: slipColor,
              }),
              type: 'formula-num',
              formula: `H${rowNum}-${baseEndColLetter}${rowNum}`,
              value: slipDays,
            }
          : { col: nextCol, styleId: makeRowCellStyle(variant, { align: 'center' }), type: 'empty' },
      );
      nextCol += 1;
    }

    rowCells.push({
      col: nextCol,
      styleId: makeRowCellStyle(variant, { align: 'left', color: '475569', wrapText: true }),
      type: 'str',
      value: desc,
    });

    // Update auto-fit widths
    detailColWidths[0] = Math.max(detailColWidths[0]!, measureWidth(wbs, { bold: isPhase }));
    detailColWidths[1] = Math.max(detailColWidths[1]!, measureWidth(typeLabel));
    detailColWidths[2] = Math.max(detailColWidths[2]!, measureWidth(phaseName, { bold: isPhase }));
    detailColWidths[3] = Math.max(detailColWidths[3]!, measureWidth(parentName));
    detailColWidths[4] = Math.max(detailColWidths[4]!, measureWidth(task.name, { bold: isPhase, indent }));
    detailColWidths[5] = Math.max(detailColWidths[5]!, measureWidth(displayStatus, { bold: true }));
    detailColWidths[11] = Math.max(detailColWidths[11]!, measureWidth(resolvedDeps));
    detailColWidths[detailColCount - 1] = Math.max(
      detailColWidths[detailColCount - 1]!,
      measureWidth(desc),
    );

    detailRows.push({ rowNum, height: isPhase ? 23 : 20, cells: rowCells });
  });

  // Finalize guaranteed no-#### widths on Sheet 2
  const finalDetailWidths = detailColWidths.map((w, i) => {
    if (i === 0) return clampWidth(w, 8.5, 14);
    if (i === 1) return clampWidth(w, 12, 16);
    if (i === 2 || i === 3) return clampWidth(w, 14, 28);
    if (i === 4) return clampWidth(w, 24, 46);
    if (i === 5) return 14.5;
    if (i === 6 || i === 7) return 14.5; // Dates
    if (i === 8) return 15; // Duration
    if (i === 9) return 11.5; // Progress
    if (i === 10) return 13.5; // Critical Path
    if (i === 11) return clampWidth(w, 16, 36); // Depends On
    if (hasBaseline && (i === 12 || i === 13)) return 15; // Baseline Dates
    if (hasBaseline && i === 14) return 12.5; // Slip
    return clampWidth(w, 18, 48); // Description
  });

  const sheet2Xml = renderWorksheetXml({
    rows: detailRows,
    colWidths: finalDetailWidths,
    merges: detailMerges,
    autoFilterRef: `A2:${columnIndexToLetter(detailColCount)}${DETAIL_LAST_ROW}`,
    freeze: { ySplit: 2 },
    tabSelected: false,
    showGridLines: true,
    landscape: true,
  });

  // =========================================================================
  // SHEET 3: Summary & Legend (Dynamic Cross-Sheet Formulas + Phase Progress Bars)
  // =========================================================================
  const summaryRows: RowDef[] = [];
  const summaryMerges: string[] = ['A1:G1', 'A3:B3', 'D3:E3'];

  const sCardSection = styles.register({
    font: { size: 10, color: 'FFFFFF', bold: true },
    fill: '1E293B',
    border: cardBorder,
    alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
  });
  const sCardLabel = styles.register({
    font: { size: 10, color: '475569', bold: true },
    fill: 'F8FAFC',
    border: cardBorder,
    alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
  });
  const sCardNum = styles.register({
    font: { size: 10, color: '0F172A', bold: true },
    fill: 'FFFFFF',
    border: cardBorder,
    numFmtId: NUM_FMT_INT,
    alignment: { horizontal: 'right', vertical: 'center' },
  });
  const sCardPct = styles.register({
    font: { size: 10, color: '1D4ED8', bold: true },
    fill: 'FFFFFF',
    border: cardBorder,
    numFmtId: NUM_FMT_PERCENT,
    alignment: { horizontal: 'right', vertical: 'center' },
  });
  const sCardDate = styles.register({
    font: { size: 10, color: '0F172A', bold: true },
    fill: 'FFFFFF',
    border: cardBorder,
    numFmtId: NUM_FMT_DATE,
    alignment: { horizontal: 'right', vertical: 'center' },
  });
  const sCardText = styles.register({
    font: { size: 10, color: '0F172A', bold: true },
    fill: 'FFFFFF',
    border: cardBorder,
    alignment: { horizontal: 'right', vertical: 'center' },
  });
  const sProgressBarText = styles.register({
    font: { size: 10, color: '2563EB', bold: true, name: 'Consolas' },
    fill: 'FFFFFF',
    border: hairlineGrid,
    alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
  });
  const sProgressBarDone = styles.register({
    font: { size: 10, color: '059669', bold: true, name: 'Consolas' },
    fill: 'FFFFFF',
    border: hairlineGrid,
    alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
  });

  // Row 1: Banner
  summaryRows.push({
    rowNum: 1,
    height: 32,
    cells: [
      { col: 1, styleId: sTitleBanner, type: 'str', value: `${title} — Executive Summary & Legend` },
      { col: 2, styleId: sTitleBanner, type: 'empty' },
      { col: 3, styleId: sTitleBanner, type: 'empty' },
      { col: 4, styleId: sTitleBanner, type: 'empty' },
      { col: 5, styleId: sTitleBanner, type: 'empty' },
      { col: 6, styleId: sTitleBanner, type: 'empty' },
      { col: 7, styleId: sTitleBanner, type: 'empty' },
    ],
  });

  // Row 3: Section Headers
  summaryRows.push({
    rowNum: 3,
    height: 22,
    cells: [
      { col: 1, styleId: sCardSection, type: 'str', value: 'TASK BREAKDOWN' },
      { col: 2, styleId: sCardSection, type: 'empty' },
      { col: 4, styleId: sCardSection, type: 'str', value: 'SCHEDULE METRICS' },
      { col: 5, styleId: sCardSection, type: 'empty' },
    ],
  });

  const completionRate = totalCount > 0 ? completedCount / totalCount : 0;
  const criticalCount = flat.filter((t) => criticalPath.criticalTaskIds.has(t.id)).length;
  const milestoneCount = flat.filter((t) => isTaskDeadline(t)).length;
  const phaseCount = tasks.length;
  const ganttRef = `'Gantt Chart'`;
  const detailRef = `'Task Details'`;

  const kpiPairs: Array<[CellDef[], CellDef[]]> = [
    [
      [
        { col: 1, styleId: sCardLabel, type: 'str', value: 'Total Tasks' },
        {
          col: 2,
          styleId: sCardNum,
          type: 'formula-num',
          formula: `COUNTA(${ganttRef}!A${GANTT_FIRST_DATA_ROW}:A${GANTT_LAST_DATA_ROW})`,
          value: totalCount,
        },
      ],
      [
        { col: 4, styleId: sCardLabel, type: 'str', value: 'Project Start' },
        {
          col: 5,
          styleId: sCardDate,
          type: 'formula-num',
          formula: `MIN(${ganttRef}!D${GANTT_FIRST_DATA_ROW}:D${GANTT_LAST_DATA_ROW})`,
          value: isoToExcelSerial(minStartISO),
        },
      ],
    ],
    [
      [
        { col: 1, styleId: sCardLabel, type: 'str', value: 'Completed' },
        {
          col: 2,
          styleId: statusStyles.Completed,
          type: 'formula-num',
          formula: `COUNTIF(${ganttRef}!C${GANTT_FIRST_DATA_ROW}:C${GANTT_LAST_DATA_ROW},"Completed")`,
          value: completedCount,
        },
      ],
      [
        { col: 4, styleId: sCardLabel, type: 'str', value: 'Project End' },
        {
          col: 5,
          styleId: sCardDate,
          type: 'formula-num',
          formula: `MAX(${ganttRef}!E${GANTT_FIRST_DATA_ROW}:E${GANTT_LAST_DATA_ROW})`,
          value: isoToExcelSerial(maxEndISO),
        },
      ],
    ],
    [
      [
        { col: 1, styleId: sCardLabel, type: 'str', value: 'In Progress (Working)' },
        {
          col: 2,
          styleId: statusStyles.Working,
          type: 'formula-num',
          formula: `COUNTIF(${ganttRef}!C${GANTT_FIRST_DATA_ROW}:C${GANTT_LAST_DATA_ROW},"Working")`,
          value: workingCount,
        },
      ],
      [
        { col: 4, styleId: sCardLabel, type: 'str', value: 'Total Span (Days)' },
        {
          col: 5,
          styleId: sCardNum,
          type: 'formula-num',
          formula: 'MAX(1,E5-E4+1)',
          value: spanDays,
        },
      ],
    ],
    [
      [
        { col: 1, styleId: sCardLabel, type: 'str', value: 'Not Started' },
        {
          col: 2,
          styleId: statusStyles['Not Started'],
          type: 'formula-num',
          formula: `COUNTIF(${ganttRef}!C${GANTT_FIRST_DATA_ROW}:C${GANTT_LAST_DATA_ROW},"Not Started")`,
          value: notStartedCount,
        },
      ],
      [
        { col: 4, styleId: sCardLabel, type: 'str', value: 'Top-Level Phases' },
        { col: 5, styleId: sCardNum, type: 'num', value: phaseCount },
      ],
    ],
    [
      [
        { col: 1, styleId: sCardLabel, type: 'str', value: 'Overdue' },
        {
          col: 2,
          styleId: statusStyles.Overdue,
          type: 'formula-num',
          formula: `COUNTIF(${ganttRef}!C${GANTT_FIRST_DATA_ROW}:C${GANTT_LAST_DATA_ROW},"Overdue")`,
          value: overdueCount,
        },
      ],
      [
        { col: 4, styleId: sCardLabel, type: 'str', value: 'Milestones' },
        {
          col: 5,
          styleId: sCardNum,
          type: 'formula-num',
          formula: `COUNTIF(${detailRef}!B${DETAIL_FIRST_ROW}:B${DETAIL_LAST_ROW},"Milestone")`,
          value: milestoneCount,
        },
      ],
    ],
    [
      [
        { col: 1, styleId: sCardLabel, type: 'str', value: 'Completion Rate' },
        {
          col: 2,
          styleId: sCardPct,
          type: 'formula-num',
          formula: 'IFERROR(B5/B4,0)',
          value: Number(completionRate.toFixed(4)),
        },
      ],
      [
        { col: 4, styleId: sCardLabel, type: 'str', value: 'Critical Path Tasks' },
        {
          col: 5,
          styleId: sCardNum,
          type: 'formula-num',
          formula: `COUNTIF(${detailRef}!K${DETAIL_FIRST_ROW}:K${DETAIL_LAST_ROW},"Yes")`,
          value: criticalCount,
        },
      ],
    ],
    [
      [
        { col: 1, styleId: sCardLabel, type: 'str', value: 'Average Progress' },
        {
          col: 2,
          styleId: sCardPct,
          type: 'formula-num',
          formula: `IFERROR(AVERAGE(${ganttRef}!G${GANTT_FIRST_DATA_ROW}:G${GANTT_LAST_DATA_ROW}),0)`,
          value: Number(avgProgress.toFixed(4)),
        },
      ],
      [
        { col: 4, styleId: sCardLabel, type: 'str', value: 'Diagram Scale' },
        {
          col: 5,
          styleId: sCardText,
          type: 'str',
          value: scale === 'daily' ? 'Daily' : scale === 'weekly' ? 'Weekly' : 'Monthly',
        },
      ],
    ],
  ];

  kpiPairs.forEach(([leftCells, rightCells], i) => {
    summaryRows.push({ rowNum: 4 + i, height: 21, cells: [...leftCells, ...rightCells] });
  });

  // Phase Breakdown Table starting at Row 12
  const PHASE_TITLE_ROW = 12;
  const PHASE_HEADER_ROW = 13;
  summaryMerges.push(`A${PHASE_TITLE_ROW}:G${PHASE_TITLE_ROW}`);
  summaryRows.push({
    rowNum: PHASE_TITLE_ROW,
    height: 22,
    cells: [
      { col: 1, styleId: sCardSection, type: 'str', value: 'PHASE PROGRESS BREAKDOWN' },
      { col: 2, styleId: sCardSection, type: 'empty' },
      { col: 3, styleId: sCardSection, type: 'empty' },
      { col: 4, styleId: sCardSection, type: 'empty' },
      { col: 5, styleId: sCardSection, type: 'empty' },
      { col: 6, styleId: sCardSection, type: 'empty' },
      { col: 7, styleId: sCardSection, type: 'empty' },
    ],
  });

  summaryRows.push({
    rowNum: PHASE_HEADER_ROW,
    height: 23,
    cells: [
      { col: 1, styleId: sTableHeader, type: 'str', value: 'WBS' },
      { col: 2, styleId: sTableHeaderLeft, type: 'str', value: 'Phase' },
      { col: 3, styleId: sTableHeader, type: 'str', value: 'Start Date' },
      { col: 4, styleId: sTableHeader, type: 'str', value: 'End Date' },
      { col: 5, styleId: sTableHeader, type: 'str', value: 'Days' },
      { col: 6, styleId: sTableHeader, type: 'str', value: 'Progress' },
      { col: 7, styleId: sTableHeaderLeft, type: 'str', value: 'Visual Bar' },
    ],
  });

  let maxPhaseNameW = measureWidth('Phase', { bold: true });
  tasks.forEach((phase, idx) => {
    const rowNum = PHASE_HEADER_ROW + 1 + idx;
    const wbs = wbsMap.get(phase.id) ?? `#${idx + 1}`;
    const pct = Math.max(0, Math.min(100, phase.progress ?? 0)) / 100;
    const filledBlocks = Math.round(pct * 10);
    const barCached = `${'█'.repeat(filledBlocks)}${'░'.repeat(10 - filledBlocks)}`;
    const variant: 'even' | 'odd' = idx % 2 === 0 ? 'even' : 'odd';
    const done = isTaskCompleted(phase);

    maxPhaseNameW = Math.max(maxPhaseNameW, measureWidth(phase.name, { bold: true }));

    summaryRows.push({
      rowNum,
      height: 21,
      cells: [
        {
          col: 1,
          styleId: makeRowCellStyle(variant, { align: 'center', bold: true, color: '1E3A8A' }),
          type: 'str',
          value: wbs,
        },
        {
          col: 2,
          styleId: makeRowCellStyle(variant, { align: 'left', bold: true }),
          type: 'str',
          value: phase.name,
        },
        {
          col: 3,
          styleId: makeRowCellStyle(variant, { align: 'center', numFmtId: NUM_FMT_DATE }),
          type: 'num',
          value: isoToExcelSerial(phase.start),
        },
        {
          col: 4,
          styleId: makeRowCellStyle(variant, { align: 'center', numFmtId: NUM_FMT_DATE }),
          type: 'num',
          value: isoToExcelSerial(phase.end),
        },
        {
          col: 5,
          styleId: makeRowCellStyle(variant, { align: 'center', numFmtId: NUM_FMT_INT }),
          type: 'formula-num',
          formula: `MAX(1,D${rowNum}-C${rowNum}+1)`,
          value: getInclusiveDurationDays(phase.start, phase.end),
        },
        {
          col: 6,
          styleId: makeRowCellStyle(variant, {
            align: 'center',
            numFmtId: NUM_FMT_PERCENT,
            bold: true,
            color: done ? '166534' : pct > 0 ? '1E40AF' : '64748B',
          }),
          type: 'num',
          value: pct,
        },
        {
          col: 7,
          styleId: done ? sProgressBarDone : sProgressBarText,
          type: 'formula-str',
          formula: `REPT("█",ROUND(F${rowNum}*10,0))&REPT("░",10-ROUND(F${rowNum}*10,0))`,
          value: barCached,
        },
      ],
    });
  });

  // Color Legend Section below Phase Breakdown
  const LEGEND_TITLE_ROW = PHASE_HEADER_ROW + tasks.length + 2;
  summaryMerges.push(`A${LEGEND_TITLE_ROW}:E${LEGEND_TITLE_ROW}`);
  summaryRows.push({
    rowNum: LEGEND_TITLE_ROW,
    height: 22,
    cells: [
      { col: 1, styleId: sCardSection, type: 'str', value: 'GANTT DIAGRAM COLOR LEGEND' },
      { col: 2, styleId: sCardSection, type: 'empty' },
      { col: 3, styleId: sCardSection, type: 'empty' },
      { col: 4, styleId: sCardSection, type: 'empty' },
      { col: 5, styleId: sCardSection, type: 'empty' },
    ],
  });

  const legendItems: Array<{ styleId: number; symbol?: string; label: string; detail: string }> = [
    {
      styleId: makeBarStyle('10B981', false),
      label: 'Completed Task',
      detail: '100% finished task or subtask',
    },
    {
      styleId: makeBarStyle('2563EB', false),
      label: 'In Progress (Completed Portion)',
      detail: 'Portion of active task already completed',
    },
    {
      styleId: makeBarStyle('93C5FD', false),
      label: 'In Progress (Remaining Portion)',
      detail: 'Remaining scheduled work on an active task',
    },
    {
      styleId: makeBarStyle('94A3B8', false),
      label: 'Not Started Task',
      detail: 'Scheduled task with 0% progress',
    },
    {
      styleId: makeBarStyle('E11D48', false),
      label: 'Overdue Task',
      detail: 'Incomplete task past its scheduled end date',
    },
    {
      styleId: makeBarStyle('1E3A8A', false),
      label: 'Phase Summary Bar',
      detail: 'Parent phase spanning its grouped subtasks',
    },
    {
      styleId: makeBarStyle('2563EB', true),
      label: 'Critical Path Outline',
      detail: 'Red top & bottom border marks zero-slack schedule drivers',
    },
    {
      styleId: makeMilestoneStyle('FEF3C7', 'D97706', false),
      symbol: '◆',
      label: 'Milestone / Deadline',
      detail: 'Single-day milestone marker (green when completed)',
    },
    ...(hasBaseline
      ? [
          {
            styleId: sBaselineGhost,
            label: 'Saved Baseline Window',
            detail: 'Original planned dates outside the current bar',
          },
        ]
      : []),
    {
      styleId: sEmptyToday,
      label: 'Today Column',
      detail: 'Vertical highlight marking the export date',
    },
  ];

  legendItems.forEach((item, idx) => {
    const rowNum = LEGEND_TITLE_ROW + 1 + idx;
    summaryMerges.push(`C${rowNum}:E${rowNum}`);
    summaryRows.push({
      rowNum,
      height: 20,
      cells: [
        item.symbol
          ? { col: 1, styleId: item.styleId, type: 'str', value: item.symbol }
          : { col: 1, styleId: item.styleId, type: 'empty' },
        {
          col: 2,
          styleId: makeRowCellStyle('even', { align: 'left', bold: true }),
          type: 'str',
          value: item.label,
        },
        {
          col: 3,
          styleId: makeRowCellStyle('even', { align: 'left', color: '475569' }),
          type: 'str',
          value: item.detail,
        },
        { col: 4, styleId: makeRowCellStyle('even'), type: 'empty' },
        { col: 5, styleId: makeRowCellStyle('even'), type: 'empty' },
      ],
    });
  });

  const sheet3Xml = renderWorksheetXml({
    rows: summaryRows,
    colWidths: [
      24, // A: Label / WBS / Swatch
      clampWidth(maxPhaseNameW, 28, 42), // B: Value / Phase Name / Legend Title
      15, // C: Spacer / Start Date
      22, // D: Metric Label / End Date
      16, // E: Metric Value / Days
      12, // F: Progress
      18, // G: Visual Bar
    ],
    merges: summaryMerges,
    tabSelected: false,
    showGridLines: true,
    landscape: true,
  });

  // =========================================================================
  // Assemble Open Packaging Conventions (OPC) XML Files & ZIP Container
  // =========================================================================
  const contentTypesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '</Types>';

  const rootRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';

  const workbookXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="14000" activeTab="0"/></bookViews>' +
    '<sheets>' +
    '<sheet name="Gantt Chart" sheetId="1" r:id="rId1"/>' +
    '<sheet name="Task Details" sheetId="2" r:id="rId2"/>' +
    '<sheet name="Summary &amp; Legend" sheetId="3" r:id="rId3"/>' +
    '</sheets>' +
    '<calcPr calcId="191029" fullCalcOnLoad="1"/>' +
    '</workbook>';

  const workbookRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>' +
    '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>';

  const stylesXml = styles.toXml();

  const fileEntries: Array<[string, string]> = [
    ['[Content_Types].xml', contentTypesXml],
    ['_rels/.rels', rootRelsXml],
    ['xl/workbook.xml', workbookXml],
    ['xl/_rels/workbook.xml.rels', workbookRelsXml],
    ['xl/styles.xml', stylesXml],
    ['xl/worksheets/sheet1.xml', sheet1Xml],
    ['xl/worksheets/sheet2.xml', sheet2Xml],
    ['xl/worksheets/sheet3.xml', sheet3Xml],
  ];

  const files = new Map<string, string>(fileEntries);
  const bytes = buildStoredZip(
    fileEntries.map(([path, content]) => ({ path, content })),
  );

  return {
    bytes,
    files,
    scale,
    timelineColumnCount: buckets.length,
  };
}
