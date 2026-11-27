import { describe, expect, it } from 'vitest';
import {
  buildTasksXlsxWorkbook,
  columnIndexToLetter,
  isoToExcelSerial,
} from '@/domain/xlsxExport';
import { computeCrc32 } from '@/domain/xlsxZip';
import type { Task, WorkspaceBaseline } from '@/types';

const sampleTasks: Task[] = [
  {
    id: 1,
    name: 'Planning',
    description: 'Initial scope & discovery',
    start: '2026-01-05',
    end: '2026-01-14',
    progress: 100,
    children: [
      {
        id: 2,
        name: 'Kickoff Milestone',
        start: '2026-01-05',
        end: '2026-01-05',
        progress: 100,
        isDeadline: true,
        parentId: 1,
      },
      {
        id: 3,
        name: 'Identify Beneficiary',
        start: '2026-01-06',
        end: '2026-01-14',
        progress: 100,
        parentId: 1,
      },
    ],
  },
  {
    id: 4,
    name: 'Build & QA',
    start: '2026-01-15',
    end: '2026-01-24',
    progress: 50,
    dependencies: [1],
    children: [
      {
        id: 5,
        name: 'API Implementation',
        start: '2026-01-15',
        end: '2026-01-19',
        progress: 60,
        parentId: 4,
      },
      {
        id: 6,
        name: 'Final Release Review',
        start: '2026-01-20',
        end: '2026-01-24',
        progress: 0,
        parentId: 4,
        dependencies: [5],
      },
    ],
  },
];

function parseStoredZipEntries(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder('utf-8');
  const entries = new Map<string, string>();

  // Locate End of Central Directory (EOCD)
  const eocdOffset = bytes.length - 22;
  expect(view.getUint32(eocdOffset, true)).toBe(0x06054b50);
  const entryCount = view.getUint16(eocdOffset + 8, true);
  let cdOffset = view.getUint32(eocdOffset + 16, true);

  for (let i = 0; i < entryCount; i++) {
    expect(view.getUint32(cdOffset, true)).toBe(0x02014b50);
    const crc = view.getUint32(cdOffset + 16, true);
    const compSize = view.getUint32(cdOffset + 20, true);
    const uncompSize = view.getUint32(cdOffset + 24, true);
    const nameLen = view.getUint16(cdOffset + 28, true);
    const localOffset = view.getUint32(cdOffset + 42, true);
    const name = decoder.decode(bytes.subarray(cdOffset + 46, cdOffset + 46 + nameLen));

    // Verify local file header & CRC-32 checksum
    expect(view.getUint32(localOffset, true)).toBe(0x04034b50);
    const localNameLen = view.getUint16(localOffset + 26, true);
    const dataStart = localOffset + 30 + localNameLen;
    const payload = bytes.subarray(dataStart, dataStart + compSize);
    expect(compSize).toBe(uncompSize);
    expect(computeCrc32(payload)).toBe(crc);

    entries.set(name, decoder.decode(payload));
    cdOffset += 46 + nameLen;
  }

  return entries;
}

describe('buildTasksXlsxWorkbook (native Excel Gantt export)', () => {
  it('converts Excel column indices and serial dates accurately', () => {
    expect(columnIndexToLetter(1)).toBe('A');
    expect(columnIndexToLetter(26)).toBe('Z');
    expect(columnIndexToLetter(27)).toBe('AA');
    expect(columnIndexToLetter(703)).toBe('AAA');

    // Excel 1900 date system: 2026-01-01 = 46023
    expect(isoToExcelSerial('2026-01-01')).toBe(46023);
    expect(isoToExcelSerial('2026-01-02')).toBe(46024);
  });

  it('produces a valid PKZIP .xlsx archive with 3 sheets, colors, auto-fit widths, formulas, and a daily Gantt diagram', () => {
    const baseline: WorkspaceBaseline = {
      savedAt: '2026-01-01T00:00:00Z',
      entries: {
        1: { start: '2026-01-05', end: '2026-01-12' },
        4: { start: '2026-01-15', end: '2026-01-22' },
      },
    };

    const result = buildTasksXlsxWorkbook(sampleTasks, {
      workspaceTitle: 'Plotwise & Roadmap',
      baseline,
      todayISO: '2026-01-17',
    });

    expect(result.scale).toBe('daily');
    expect(result.timelineColumnCount).toBeGreaterThanOrEqual(20);

    // Verify ZIP binary integrity (headers, central directory, EOCD, CRC-32)
    const extracted = parseStoredZipEntries(result.bytes);
    expect(extracted.size).toBe(8);
    expect(extracted.has('[Content_Types].xml')).toBe(true);
    expect(extracted.has('_rels/.rels')).toBe(true);
    expect(extracted.has('xl/workbook.xml')).toBe(true);
    expect(extracted.has('xl/_rels/workbook.xml.rels')).toBe(true);
    expect(extracted.has('xl/styles.xml')).toBe(true);
    expect(extracted.has('xl/worksheets/sheet1.xml')).toBe(true);
    expect(extracted.has('xl/worksheets/sheet2.xml')).toBe(true);
    expect(extracted.has('xl/worksheets/sheet3.xml')).toBe(true);

    // Verify mandatory Excel built-in fills (none + gray125) and custom solid colors
    const stylesXml = extracted.get('xl/styles.xml')!;
    expect(stylesXml).toContain(
      '<fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>',
    );
    expect(stylesXml).toContain('rgb="FF0F172A"'); // Title banner fill
    expect(stylesXml).toContain('rgb="FF10B981"'); // Completed bar color
    expect(stylesXml).toContain('rgb="FF2563EB"'); // Active bar color
    expect(stylesXml).toContain('rgb="FFDCFCE7"'); // Completed status pill

    // Verify Sheet 1 (Gantt Chart) structure: XML-escaped title, freeze panes, auto-fit widths, formulas, milestone diamond
    const sheet1 = extracted.get('xl/worksheets/sheet1.xml')!;
    expect(sheet1).toContain('Plotwise &amp; Roadmap — Gantt Schedule');
    expect(sheet1).toContain('xSplit="7" ySplit="4" topLeftCell="H5"');
    expect(sheet1).toContain('<autoFilter ref="A4:G10"/>');
    expect(sheet1).toContain('<f>MAX(1,E5-D5+1)</f><v>10</v>');
    expect(sheet1).toContain('JAN 2026');
    expect(sheet1).toContain('◆');
    // Date columns must have width >= 14.5 so Excel never displays ########
    expect(sheet1).toContain('<col min="4" max="4" width="14.5" customWidth="1"/>');
    expect(sheet1).toContain('<col min="5" max="5" width="14.5" customWidth="1"/>');

    // Verify Sheet 2 (Task Details) has resolved dependencies, critical path, and live baseline slip formulas
    const sheet2 = extracted.get('xl/worksheets/sheet2.xml')!;
    expect(sheet2).toContain('Baseline Start');
    expect(sheet2).toContain('Slip (Days)');
    expect(sheet2).toContain('#1 Planning');
    expect(sheet2).toContain('<f>H3-N3</f><v>2</v>');

    // Verify Sheet 3 (Summary & Legend) has cross-sheet formulas and REPT visual progress bars
    const sheet3 = extracted.get('xl/worksheets/sheet3.xml')!;
    expect(sheet3).toContain("COUNTA('Gantt Chart'!A5:A10)");
    expect(sheet3).toContain('REPT("█",ROUND(F14*10,0))&amp;REPT("░",10-ROUND(F14*10,0))');
    expect(sheet3).toContain('GANTT DIAGRAM COLOR LEGEND');

    // Parse all 8 XML parts via browser DOMParser (jsdom) to confirm 100% well-formed XML
    for (const [path, xml] of extracted.entries()) {
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      const parserErrors = doc.getElementsByTagName('parsererror');
      expect(parserErrors.length, `XML parse error in ${path}`).toBe(0);
    }
  });

  it('switches automatically to weekly and monthly Gantt diagram scales for long multi-month/multi-year projects', () => {
    const yearLong: Task[] = [
      { id: 1, name: 'Year 1', start: '2026-01-01', end: '2026-12-31', progress: 40 },
    ];
    const weekly = buildTasksXlsxWorkbook(yearLong, { todayISO: '2026-06-01' });
    expect(weekly.scale).toBe('weekly');
    expect(weekly.timelineColumnCount).toBeGreaterThanOrEqual(52);
    expect(weekly.timelineColumnCount).toBeLessThanOrEqual(56);

    const multiYear: Task[] = [
      { id: 1, name: '3-Year Plan', start: '2026-01-01', end: '2028-12-31', progress: 20 },
    ];
    const monthly = buildTasksXlsxWorkbook(multiYear, { todayISO: '2026-06-01' });
    expect(monthly.scale).toBe('monthly');
    expect(monthly.timelineColumnCount).toBe(36);
  });
});
