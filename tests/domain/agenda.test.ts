import { describe, expect, it } from 'vitest';
import {
  buildCalendarMonthGrid,
  collectWorkspaceDeadlinesForCalendar,
  computeReminderTargetISO,
  formatAgendaTelegramMessage,
  formatClockTime12h,
  getAgendaDeliveryStatus,
  isDeferredBeyondCloudTaskWindow,
  isWithinCloudTaskWindow,
  localDateTimeToUtcMs,
  sanitizeAgendaItems,
  validateAgendaDraft,
} from '@/domain/agenda';
import { parseBotCallback } from '@/domain/telegramBot';
import type { AgendaItem, Task, WorkspaceMap } from '@/types';

describe('agenda & calendar pure domain policy', () => {
  it('converts local calendar date + time accurately to UTC across timezones and applies lead-time offsets', () => {
    // 2026-11-28 19:00 in Asia/Manila (UTC+8) = 2026-11-28T11:00:00.000Z; 15m before = 10:45:00Z (6:45 PM local)
    expect(localDateTimeToUtcMs('2026-11-28', '19:00', 'Asia/Manila')).toBe(
      Date.parse('2026-11-28T11:00:00.000Z'),
    );
    expect(
      computeReminderTargetISO({
        date: '2026-11-28',
        time: '19:00',
        reminderOffsetMinutes: 15,
        timezone: 'Asia/Manila',
      }),
    ).toBe('2026-11-28T10:45:00.000Z');

    // Half-hour timezone: Asia/Kolkata (UTC+5:30): 19:00 -> 13:30Z; 30m before -> 13:00Z
    expect(
      computeReminderTargetISO({
        date: '2026-11-28',
        time: '19:00',
        reminderOffsetMinutes: 30,
        timezone: 'Asia/Kolkata',
      }),
    ).toBe('2026-11-28T13:00:00.000Z');

    // Negative DST timezone: America/New_York summer EDT (UTC-4): 19:00 -> 23:00Z; 1h before -> 22:00Z
    expect(
      computeReminderTargetISO({
        date: '2026-07-15',
        time: '19:00',
        reminderOffsetMinutes: 60,
        timezone: 'America/New_York',
      }),
    ).toBe('2026-07-15T22:00:00.000Z');

    // All-day item (no time) falls back to defaultReminderHour (09:00 local)
    expect(
      computeReminderTargetISO({
        date: '2026-11-28',
        time: null,
        reminderOffsetMinutes: 0,
        timezone: 'Asia/Manila',
        defaultReminderHour: 9,
      }),
    ).toBe('2026-11-28T01:00:00.000Z');

    // Disabled alert returns null
    expect(
      computeReminderTargetISO({
        date: '2026-11-28',
        time: '19:00',
        reminderOffsetMinutes: null,
        timezone: 'Asia/Manila',
      }),
    ).toBeNull();
  });

  it('classifies Cloud Tasks 29-day scheduling window vs deferred long-horizon items cleanly', () => {
    const nowMs = Date.parse('2026-11-28T00:00:00.000Z');
    const inTwoHours = new Date(nowMs + 2 * 3_600_000).toISOString();
    const inFortyDays = new Date(nowMs + 40 * 86_400_000).toISOString();
    const yesterday = new Date(nowMs - 86_400_000).toISOString();

    expect(isWithinCloudTaskWindow(inTwoHours, nowMs)).toBe(true);
    expect(isDeferredBeyondCloudTaskWindow(inTwoHours, nowMs)).toBe(false);

    expect(isWithinCloudTaskWindow(inFortyDays, nowMs)).toBe(false);
    expect(isDeferredBeyondCloudTaskWindow(inFortyDays, nowMs)).toBe(true);

    expect(isWithinCloudTaskWindow(yesterday, nowMs)).toBe(false);
  });

  it('validates drafts, sanitizes Firestore-safe agenda arrays, and formats 12h clock times', () => {
    expect(
      validateAgendaDraft({ title: 'A', date: '2026-11-28', reminderOffsetMinutes: 15 }).valid,
    ).toBe(false);
    expect(
      validateAgendaDraft({ title: 'Demo', date: '2026-02-30', reminderOffsetMinutes: 15 }).valid,
    ).toBe(false);
    expect(
      validateAgendaDraft({
        title: 'Demo',
        date: '2026-11-28',
        time: '25:99',
        reminderOffsetMinutes: 15,
      }).valid,
    ).toBe(false);
    expect(
      validateAgendaDraft({
        title: 'Group Demo',
        date: '2026-11-28',
        time: '19:00',
        reminderOffsetMinutes: 15,
      }).valid,
    ).toBe(true);

    expect(formatClockTime12h('00:05')).toBe('12:05 AM');
    expect(formatClockTime12h('12:30')).toBe('12:30 PM');
    expect(formatClockTime12h('19:00')).toBe('7:00 PM');

    const cleaned = sanitizeAgendaItems([
      {
        id: 'ag_2',
        title: 'Evening Sync',
        date: '2026-11-28',
        time: '19:00',
        reminderOffsetMinutes: 15,
        timezone: 'Asia/Manila',
      },
      {
        id: 'ag_1',
        title: 'Morning Review',
        date: '2026-11-28',
        time: '09:00',
        reminderOffsetMinutes: null,
        timezone: 'Asia/Manila',
      },
      { id: '', title: 'Invalid', date: '2026-11-28' },
    ]);

    expect(cleaned.map((i) => i.id)).toEqual(['ag_1', 'ag_2']);
    expect(JSON.stringify(cleaned)).not.toContain('undefined');
  });

  it('builds month calendar grids and collects nested workspace task deadlines', () => {
    const cells = buildCalendarMonthGrid(2026, 10, '2026-11-28'); // Nov 2026 (0-indexed 10)
    expect(cells.length === 35 || cells.length === 42).toBe(true);
    expect(cells.find((c) => c.dateISO === '2026-11-28')?.isToday).toBe(true);
    expect(cells.filter((c) => c.inCurrentMonth)).toHaveLength(30);

    const workspaces: WorkspaceMap = {
      ws_1: { id: 'ws_1', title: 'Capstone', createdAt: '2026-11-01', updatedAt: '2026-11-20' },
    };
    const workspaceTasks: Record<string, Task[]> = {
      ws_1: [
        {
          id: 1,
          name: 'Phase 1',
          start: '2026-11-20',
          end: '2026-11-29',
          progress: 50,
          children: [
            {
              id: 2,
              name: 'Submit Draft',
              start: '2026-11-25',
              end: '2026-11-27',
              progress: 40,
              parentId: 1,
            },
          ],
        },
      ],
    };

    const deadlines = collectWorkspaceDeadlinesForCalendar(workspaces, workspaceTasks, '2026-11-28');
    expect(deadlines).toHaveLength(2);
    expect(deadlines[0]).toMatchObject({
      taskId: 2,
      parentName: 'Phase 1',
      isOverdue: true,
    });
    expect(deadlines[1]).toMatchObject({
      taskId: 1,
      parentName: null,
      isOverdue: false,
    });
  });

  it('formats escaped Telegram agenda messages, derives delivery status, and parses agd callbacks', () => {
    const item: AgendaItem = {
      id: 'ag_abc123',
      title: 'Demo <Final> & Q&A',
      date: '2026-11-28',
      time: '19:00',
      note: 'Bring <slides>',
      isDone: false,
      reminderOffsetMinutes: 15,
      timezone: 'Asia/Manila',
      reminderTargetISO: '2026-11-28T10:45:00.000Z',
      cloudTaskName: 'projects/p/locations/asia-southeast1/queues/sked-reminders/tasks/123',
      reminderSentAt: null,
      createdAt: '2026-11-28T00:00:00.000Z',
      updatedAt: '2026-11-28T00:00:00.000Z',
    };

    expect(getAgendaDeliveryStatus(item, true, Date.parse('2026-11-28T09:00:00.000Z'))).toBe(
      'scheduled',
    );
    expect(getAgendaDeliveryStatus(item, false, Date.parse('2026-11-28T09:00:00.000Z'))).toBe(
      'unlinked',
    );

    const html = formatAgendaTelegramMessage(item, 'https://skedspace.vercel.app/');
    expect(html).toContain('Starting in 15 minutes');
    expect(html).toContain('Demo &lt;Final&gt; &amp; Q&amp;A');
    expect(html).toContain('7:00 PM');
    expect(html).toContain('Bring &lt;slides&gt;');
    expect(html).toContain('https://skedspace.vercel.app');

    const unsafe = formatAgendaTelegramMessage(item, 'javascript:alert(1)');
    expect(unsafe).not.toContain('<a href=');

    expect(parseBotCallback('agd:ag_abc123')).toEqual({
      type: 'agenda_done',
      itemId: 'ag_abc123',
    });
  });
});
