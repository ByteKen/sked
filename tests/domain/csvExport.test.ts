import { describe, expect, it } from 'vitest';
import { buildTasksCsvContent } from '@/domain/csvExport';
import type { Task, WorkspaceBaseline } from '@/types';

const sampleTasks: Task[] = [
  {
    id: 16,
    name: 'Planning',
    description: '- Initial kickoff, scope & goals',
    start: '2026-01-01',
    end: '2026-01-10',
    progress: 100,
    isDone: true,
    children: [
      {
        id: 17,
        name: 'Create Schedule',
        start: '2026-01-01',
        end: '2026-01-01',
        progress: 100,
        isDone: true,
        isDeadline: true,
        parentId: 16,
      },
      {
        id: 18,
        name: 'Define Scope',
        start: '2026-01-02',
        end: '2026-01-10',
        progress: 100,
        isDone: true,
        parentId: 16,
      },
    ],
  },
  {
    id: 22,
    name: 'Build MVP',
    description: '=SUM(A1:A2)',
    start: '2026-01-11',
    end: '2026-01-20',
    progress: 40,
    isWorking: true,
    dependencies: [16],
  },
];

describe('buildTasksCsvContent', () => {
  it('starts cleanly on row 1 with headers, WBS codes, human-readable status & dependency names, and neutralizes formula triggers', () => {
    const csv = buildTasksCsvContent(sampleTasks);
    const rows = csv.split('\r\n');

    // Row 1 is strictly the table header (no preamble rows breaking Excel filters/tables)
    expect(rows[0]).toBe(
      'WBS,Type,Phase,Parent Task,Task Name,Status,Start Date,End Date,Duration (Days),Progress (%),Critical Path,Depends On,Description',
    );

    // Phase row: #1, Phase, Planning, empty parent, Completed, 10d, neutralized "- Initial..." description
    expect(rows[1]).toBe(
      '#1,Phase,Planning,,Planning,Completed,2026-01-01,2026-01-10,10,100,Yes,,"\'- Initial kickoff, scope & goals"',
    );

    // Milestone subtask row: #1.1, Milestone, Planning, Planning
    expect(rows[2]).toBe(
      '#1.1,Milestone,Planning,Planning,Create Schedule,Completed,2026-01-01,2026-01-01,1,100,No,,',
    );

    // Regular subtask row: #1.2, Subtask (not directly linked to Build MVP -> non-critical)
    expect(rows[3]).toBe(
      '#1.2,Subtask,Planning,Planning,Define Scope,Completed,2026-01-02,2026-01-10,9,100,No,,',
    );

    // Dependent top-level task resolves dependency ID 16 -> "#1 Planning" and neutralizes "=SUM(A1:A2)"
    expect(rows[4]).toBe(
      "#2,Task,Build MVP,,Build MVP,Working Now,2026-01-11,2026-01-20,10,40,Yes,#1 Planning,'=SUM(A1:A2)",
    );
  });

  it('includes Baseline Start, Baseline End, and Schedule Slip (Days) columns when a baseline exists', () => {
    const baseline: WorkspaceBaseline = {
      savedAt: '2026-01-01T00:00:00Z',
      entries: {
        22: { start: '2026-01-11', end: '2026-01-16' },
      },
    };

    const csv = buildTasksCsvContent(sampleTasks, { baseline });
    const rows = csv.split('\r\n');

    expect(rows[0]).toContain('Baseline Start,Baseline End,Schedule Slip (Days),Description');
    expect(rows[4]).toContain(',2026-01-11,2026-01-16,4,');
  });
});
