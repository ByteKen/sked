import { describe, expect, it } from 'vitest';
import { buildPortfolioFocusSummary, computeWorkspaceHealth } from '@/domain/projectHealth';
import type { Task, Workspace, WorkspaceMap } from '@/types';

const makeWorkspace = (id: string, title: string, extra: Partial<Workspace> = {}): Workspace => ({
  id,
  title,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
  ...extra,
});

describe('projectHealth & cross-workspace focus domain logic', () => {
  it('classifies empty, completed, on-track, at-risk, and off-track workspaces deterministically', () => {
    const today = '2026-05-10';

    // 1. Empty workspace
    const empty = computeWorkspaceHealth(makeWorkspace('ws_empty', 'Empty'), [], today);
    expect(empty.summary.health).toBe('empty');

    // 2. Completed workspace
    const done = computeWorkspaceHealth(
      makeWorkspace('ws_done', 'Done'),
      [{ id: 1, name: 'Ship', start: '2026-05-01', end: '2026-05-05', progress: 100, isDone: true }],
      today,
    );
    expect(done.summary.health).toBe('completed');
    expect(done.focusItems).toHaveLength(0);

    // 3. On-track workspace (future due dates, no slip)
    const onTrack = computeWorkspaceHealth(
      makeWorkspace('ws_ok', 'On Track'),
      [{ id: 1, name: 'Design', start: '2026-05-10', end: '2026-05-15', progress: 25, isWorking: true }],
      today,
    );
    expect(onTrack.summary.health).toBe('on-track');
    expect(onTrack.summary.workingCount).toBe(1);
    expect(onTrack.focusItems[0]?.bucket).toBe('working');

    // 4. At-risk workspace (1 task overdue by 2 days)
    const atRisk = computeWorkspaceHealth(
      makeWorkspace('ws_risk', 'At Risk'),
      [{ id: 1, name: 'QA', start: '2026-05-05', end: '2026-05-08', progress: 30 }],
      today,
    );
    expect(atRisk.summary.health).toBe('at-risk');
    expect(atRisk.summary.overdueCount).toBe(1);

    // 5. Off-track workspace (baseline slip >= 7d or > 3d overdue)
    const offTrack = computeWorkspaceHealth(
      makeWorkspace('ws_off', 'Off Track', {
        baseline: {
          savedAt: '2026-04-01T00:00:00Z',
          entries: { 1: { start: '2026-05-01', end: '2026-05-05' } },
        },
      }),
      [{ id: 1, name: 'Backend', start: '2026-05-01', end: '2026-05-15', progress: 20 }],
      today,
    );
    expect(offTrack.summary.health).toBe('off-track');
    expect(offTrack.summary.maxBaselineSlipDays).toBe(10);
  });

  it('aggregates tasks across workspaces into prioritized buckets without double-counting parent phases', () => {
    const today = '2026-05-10';
    const workspaces: WorkspaceMap = {
      ws_a: makeWorkspace('ws_a', 'Alpha Launch'),
      ws_b: makeWorkspace('ws_b', 'Mobile Refresh'),
    };
    const tasksByWs: Record<string, Task[]> = {
      ws_a: [
        {
          id: 1,
          name: 'Phase 1',
          start: '2026-05-01',
          end: '2026-05-08',
          progress: 0,
          children: [
            { id: 2, name: 'Late API', start: '2026-05-01', end: '2026-05-06', progress: 10, parentId: 1 },
            { id: 3, name: 'Today Spec', start: '2026-05-08', end: '2026-05-10', progress: 50, parentId: 1 },
          ],
        },
      ],
      ws_b: [
        { id: 10, name: 'Active Build', start: '2026-05-09', end: '2026-05-20', progress: 40, isWorking: true },
        { id: 11, name: 'Soon Review', start: '2026-05-12', end: '2026-05-14', progress: 0 },
        { id: 12, name: 'Far Future', start: '2026-06-01', end: '2026-06-10', progress: 0 },
      ],
    };

    const portfolio = buildPortfolioFocusSummary(workspaces, tasksByWs, today);

    // Parent phase (id: 1) is NOT double-counted as an overdue leaf task
    expect(portfolio.counts.overdue).toBe(1);
    expect(portfolio.counts.today).toBe(1);
    expect(portfolio.counts.working).toBe(1);
    expect(portfolio.counts.upcoming).toBe(1); // Far Future (>7d) excluded from upcoming horizon

    // Prioritized order: Overdue -> Today -> Working -> Upcoming
    expect(portfolio.prioritizedQueue.map((i) => i.taskName)).toEqual([
      'Late API',
      'Today Spec',
      'Active Build',
      'Soon Review',
    ]);

    expect(portfolio.healthByWorkspaceId.ws_a?.health).toBe('off-track'); // Late API is 4d overdue (>3d)
    expect(portfolio.healthByWorkspaceId.ws_b?.health).toBe('on-track');
    expect(portfolio.counts.offTrackWorkspaces).toBe(1);
  });
});
