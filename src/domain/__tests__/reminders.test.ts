import { describe, expect, it } from 'vitest';
import {
  buildReminderKey,
  collectDueReminders,
  collectUpcomingDeadlines,
  diffCalendarDaysISO,
  escapeTelegramHtml,
  formatTelegramReminderMessage,
  getLocalDatePartsInTimezone,
  normalizeReminderOffsets,
  pruneSentReminders,
  type WorkspaceTasksBundle,
} from '@/domain/reminders';

const sampleWorkspaces: WorkspaceTasksBundle[] = [
  {
    workspaceId: 'ws_1',
    workspaceTitle: 'Q4 Launch <Beta>',
    tasks: [
      {
        id: 1,
        name: 'Phase 1: Backend',
        start: '2026-11-20',
        end: '2026-12-01',
        progress: 50,
        children: [
          {
            id: 2,
            name: 'Publish Firestore Rules',
            description: 'Verify sharedCharts & telegramSubscriptions rules before deploy',
            start: '2026-11-25',
            end: '2026-11-27',
            progress: 0,
            parentId: 1,
          },
          {
            id: 3,
            name: 'Already Completed Task',
            start: '2026-11-25',
            end: '2026-11-27',
            progress: 100,
            isDone: true,
            parentId: 1,
          },
        ],
      },
      {
        id: 4,
        name: 'Due Today Milestone',
        start: '2026-11-26',
        end: '2026-11-26',
        progress: 20,
        isDeadline: true,
      },
      {
        id: 5,
        name: 'Yesterday Slippage',
        start: '2026-11-20',
        end: '2026-11-25',
        progress: 80,
      },
    ],
  },
];

describe('deadline reminders domain engine', () => {
  it('computes exact local date and hour across distinct timezones', () => {
    // 2026-11-26 16:30 UTC is already Nov 27 00:30 in Manila (UTC+8) and Nov 26 11:30 in New York (UTC-5)
    const instant = new Date('2026-11-26T16:30:00.000Z');
    const manila = getLocalDatePartsInTimezone(instant, 'Asia/Manila');
    const newYork = getLocalDatePartsInTimezone(instant, 'America/New_York');
    const fallback = getLocalDatePartsInTimezone(instant, 'Invalid/Zone');

    expect(manila).toEqual({ dateISO: '2026-11-27', hour: 0, timeZone: 'Asia/Manila' });
    expect(newYork).toEqual({ dateISO: '2026-11-26', hour: 11, timeZone: 'America/New_York' });
    expect(fallback).toEqual({ dateISO: '2026-11-26', hour: 16, timeZone: 'UTC' });
  });

  it('calculates exact calendar day deltas across month and leap-year boundaries', () => {
    expect(diffCalendarDaysISO('2026-11-26', '2026-12-01')).toBe(5);
    expect(diffCalendarDaysISO('2026-11-26', '2026-11-27')).toBe(1);
    expect(diffCalendarDaysISO('2026-11-26', '2026-11-26')).toBe(0);
    expect(diffCalendarDaysISO('2026-11-26', '2026-11-25')).toBe(-1);
    expect(diffCalendarDaysISO('2028-02-28', '2028-03-01')).toBe(2); // 2028 is leap year
  });

  it('matches exact offsets (5d, 1d, 0d, overdue), skips completed & already-sent keys', () => {
    const alreadySentKey = buildReminderKey('ws_1', 4, '2026-11-26', 0);

    const due = collectDueReminders({
      workspaces: sampleWorkspaces,
      todayISO: '2026-11-26',
      reminderOffsets: [5, 1, 0],
      includeOverdue: true,
      sentReminders: {
        [alreadySentKey]: '2026-11-26T01:00:00.000Z',
      },
    });

    // Should include: id 5 (-1 overdue), id 2 (+1 day subtask), id 1 (+5 days parent)
    // Should exclude: id 3 (completed), id 4 (already sent)
    expect(due.map((d) => ({ id: d.taskId, days: d.daysRemaining, parent: d.parentName }))).toEqual(
      [
        { id: 5, days: -1, parent: null },
        { id: 2, days: 1, parent: 'Phase 1: Backend' },
        { id: 1, days: 5, parent: null },
      ],
    );

    // Rescheduling id 4 from 2026-11-26 to 2026-11-27 produces a fresh key so it notifies again
    const rescheduledKey = buildReminderKey('ws_1', 4, '2026-11-27', 1);
    expect(rescheduledKey).not.toBe(alreadySentKey);
  });

  it('formats escaped Telegram HTML messages cleanly with descriptions and workspace links', () => {
    const due = collectDueReminders({
      workspaces: sampleWorkspaces,
      todayISO: '2026-11-26',
      reminderOffsets: [1],
      includeOverdue: false,
    });

    const html = formatTelegramReminderMessage(due, 'https://gantt.example.com/');
    expect(html).toContain('Q4 Launch &lt;Beta&gt;');
    expect(html).toContain('https://gantt.example.com/workspace/ws_1');
    expect(html).toContain('Tomorrow (1 day left)');
    expect(html).toContain('Phase 1: Backend');
    expect(html).toContain('Publish Firestore Rules');
    expect(html).toContain('sharedCharts &amp; telegramSubscriptions');
    expect(escapeTelegramHtml('<script>"&')).toBe('&lt;script&gt;&quot;&amp;');
  });

  it('normalizes offsets, lists upcoming tasks, and prunes stale dedupe keys', () => {
    expect(normalizeReminderOffsets([1, 5, 99, 1, 0])).toEqual([5, 1, 0]);
    expect(normalizeReminderOffsets([])).toEqual([5, 3, 1, 0]);

    const upcoming = collectUpcomingDeadlines(sampleWorkspaces, '2026-11-26', 14);
    expect(upcoming.map((u) => u.taskId)).toEqual([5, 4, 2, 1]);

    const now = new Date('2026-11-26T12:00:00.000Z');
    const pruned = pruneSentReminders(
      {
        old: '2026-11-01T00:00:00.000Z',
        recent: '2026-11-20T00:00:00.000Z',
      },
      now,
      14,
    );
    expect(pruned).toEqual({ recent: '2026-11-20T00:00:00.000Z' });
  });
});
