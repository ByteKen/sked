import { describe, expect, it } from 'vitest';
import {
  buildAgendaFiredKey,
  buildCalendarMonthGrid,
  collectWorkspaceDeadlinesForCalendar,
  computeNextAgendaReminder,
  computeReminderTargetISO,
  doesAgendaItemOccurOnDate,
  expandAgendaItemsForDates,
  findDueAndNextInAppReminders,
  formatAgendaTelegramMessage,
  formatClockTime12h,
  getAgendaDeliveryStatus,
  getAgendaReminderHeading,
  getNextAgendaOccurrenceDate,
  isDeferredBeyondCloudTaskWindow,
  isWithinCloudTaskWindow,
  localDateTimeToUtcMs,
  sanitizeAgendaItems,
  toggleAgendaItemCompletion,
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
    expect(html).toContain('Reminder — Starting in 15 minutes');
    expect(html).toContain('Demo &lt;Final&gt; &amp; Q&amp;A');
    expect(html).toContain('7:00 PM');
    expect(html).toContain('Bring &lt;slides&gt;');
    expect(html).toContain('https://skedspace.vercel.app');

    expect(getAgendaReminderHeading({ reminderOffsetMinutes: 0 }).text).toBe(
      'Reminder — Happening now',
    );
    expect(getAgendaReminderHeading({ reminderOffsetMinutes: 30 }).text).toBe(
      'Reminder — Starting in 30 minutes',
    );

    const unsafe = formatAgendaTelegramMessage(item, 'javascript:alert(1)');
    expect(unsafe).not.toContain('<a href=');

    expect(parseBotCallback('agd:ag_abc123')).toEqual({
      type: 'agenda_done',
      itemId: 'ag_abc123',
    });

    // In-app reminder selector catches due alerts, skips fired/stale ones, and computes next exact delay
    const nowMs = Date.parse('2026-11-28T10:45:10.000Z');
    const futureItem: AgendaItem = {
      ...item,
      id: 'ag_future',
      reminderTargetISO: '2026-11-28T11:00:10.000Z', // 15 minutes in future
    };
    const staleItem: AgendaItem = {
      ...item,
      id: 'ag_stale',
      reminderTargetISO: '2026-11-28T09:00:00.000Z', // >2 min ago -> do not spam on login
    };

    const first = findDueAndNextInAppReminders([item, futureItem, staleItem], new Set(), nowMs);
    expect(first.due.map((i) => i.id)).toEqual(['ag_abc123']);
    expect(first.nextDelayMs).toBe(15 * 60_000);

    const fired = new Set([buildAgendaFiredKey(item)]);
    const second = findDueAndNextInAppReminders([item, futureItem], fired, nowMs);
    expect(second.due).toEqual([]);
    expect(second.nextDelayMs).toBe(15 * 60_000);
  });

  it('evaluates daily, weekday, weekly, monthly (month-end clamped), and yearly repeating agenda items cleanly', () => {
    // Weekdays (Mon-Fri): 2026-11-28 is Saturday -> skips Sat/Sun and lands on Monday 2026-11-30
    expect(
      doesAgendaItemOccurOnDate({ date: '2026-11-28', recurrence: 'weekdays' }, '2026-11-28'),
    ).toBe(false);
    expect(
      doesAgendaItemOccurOnDate({ date: '2026-11-28', recurrence: 'weekdays' }, '2026-11-30'),
    ).toBe(true);
    expect(
      getNextAgendaOccurrenceDate({ date: '2026-11-28', recurrence: 'weekdays' }, '2026-11-28'),
    ).toBe('2026-11-30');

    // Monthly month-end clamping: Jan 31 -> Feb 28 (2026 non-leap) -> Mar 31 -> Apr 30
    const monthly = { date: '2026-01-31', recurrence: 'monthly' as const };
    expect(doesAgendaItemOccurOnDate(monthly, '2026-02-28')).toBe(true);
    expect(doesAgendaItemOccurOnDate(monthly, '2026-03-31')).toBe(true);
    expect(doesAgendaItemOccurOnDate(monthly, '2026-04-30')).toBe(true);
    expect(getNextAgendaOccurrenceDate(monthly, '2026-01-31', false)).toBe('2026-02-28');
    expect(getNextAgendaOccurrenceDate(monthly, '2026-02-28', false)).toBe('2026-03-31');

    // End date stops recurrence cleanly
    const bounded = {
      date: '2026-11-28',
      recurrence: 'daily' as const,
      recurrenceEndDate: '2026-11-30',
    };
    expect(doesAgendaItemOccurOnDate(bounded, '2026-11-30')).toBe(true);
    expect(doesAgendaItemOccurOnDate(bounded, '2026-12-01')).toBe(false);
    expect(getNextAgendaOccurrenceDate(bounded, '2026-11-30', false)).toBeNull();

    // Validation rejects repeat end date before start date
    expect(
      validateAgendaDraft({
        title: 'Daily Standup',
        date: '2026-11-28',
        recurrence: 'daily',
        recurrenceEndDate: '2026-11-20',
        reminderOffsetMinutes: 15,
      }).valid,
    ).toBe(false);

    // Repeating item per-date completion, next Cloud Task chaining, in-app alerts, and agd callback parsing
    const dailyItem: AgendaItem = {
      id: 'ag_rep1',
      title: 'Standup',
      date: '2026-11-28',
      time: '09:00',
      isDone: false,
      recurrence: 'daily',
      completedDates: [],
      reminderOffsetMinutes: 15,
      timezone: 'Asia/Manila',
      reminderTargetISO: '2026-11-28T00:45:00.000Z', // 8:45 AM Manila
      cloudTaskName: null,
      reminderSentAt: null,
      createdAt: '2026-11-28T00:00:00.000Z',
      updatedAt: '2026-11-28T00:00:00.000Z',
    };

    const doneToday = toggleAgendaItemCompletion(dailyItem, '2026-11-28', '2026-11-28T01:00:00.000Z');
    expect(doneToday.isDone).toBe(false);
    expect(doneToday.completedDates).toEqual(['2026-11-28']);

    // Next reminder automatically skips completed 2026-11-28 and lands on 2026-11-29 8:45 AM Manila
    const nextRem = computeNextAgendaReminder({
      date: doneToday.date,
      time: doneToday.time,
      recurrence: doneToday.recurrence,
      completedDates: doneToday.completedDates,
      reminderOffsetMinutes: doneToday.reminderOffsetMinutes,
      timezone: doneToday.timezone,
      nowMs: Date.parse('2026-11-28T00:30:00.000Z'),
    });
    expect(nextRem).toEqual({
      occurrenceDate: '2026-11-29',
      reminderTargetISO: '2026-11-29T00:45:00.000Z',
    });

    // Calendar date expansion marks Nov 28 done and Nov 29 open
    const expanded = expandAgendaItemsForDates([doneToday], ['2026-11-28', '2026-11-29']);
    expect(expanded.get('2026-11-28')?.[0]?.isDone).toBe(true);
    expect(expanded.get('2026-11-29')?.[0]?.isDone).toBe(false);

    // Dynamic in-app scheduler fires on Nov 29 at 8:45:10 AM Manila even without modifying stored target
    const inApp = findDueAndNextInAppReminders(
      [doneToday],
      new Set(),
      Date.parse('2026-11-29T00:45:10.000Z'),
    );
    expect(inApp.due).toHaveLength(1);
    expect(inApp.due[0]?.date).toBe('2026-11-29');

    // Telegram callback with occurrence date parses cleanly
    expect(parseBotCallback('agd:ag_rep1:2026-11-28')).toEqual({
      type: 'agenda_done',
      itemId: 'ag_rep1',
      occurrenceDate: '2026-11-28',
    });

    // Telegram message includes repeat summary
    expect(formatAgendaTelegramMessage(dailyItem, 'https://skedspace.vercel.app', '2026-11-29')).toContain(
      'Repeats every day',
    );
  });
});
