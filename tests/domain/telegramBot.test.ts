import { describe, expect, it } from 'vitest';
import {
  buildReminderAlertReplyMarkup,
  buildSummaryView,
  buildTaskDetailView,
  buildTaskListView,
  buildTodayView,
  buildUpcomingView,
  buildWorkspacesView,
  parseBotCallback,
  setBotTaskProgress,
  toggleBotTaskDone,
  type TelegramWorkspaceBundle,
} from '@/domain/telegramBot';
import type { Task } from '@/types';

const sampleTasks: Task[] = [
  {
    id: 1,
    name: 'Planning',
    start: '2026-11-20',
    end: '2026-11-28',
    progress: 50,
    children: [
      {
        id: 2,
        name: 'Create Gantt Chart',
        description: 'Draft initial schedule and milestones',
        start: '2026-11-20',
        end: '2026-11-24',
        progress: 100,
        isDone: true,
        parentId: 1,
      },
      {
        id: 3,
        name: 'Finalize Scope',
        start: '2026-11-25',
        end: '2026-11-26',
        progress: 25,
        isDone: false,
        parentId: 1,
      },
    ],
  },
  {
    id: 4,
    name: 'Overdue Audit',
    start: '2026-11-20',
    end: '2026-11-25',
    progress: 0,
    isDone: false,
  },
];

const workspaceFixture: TelegramWorkspaceBundle = {
  workspaceId: 'ws_plotwise123456',
  workspaceTitle: 'Plotwise',
  tasks: sampleTasks,
  isShared: true,
  shareId: 'sh_abc123',
};

describe('interactive Telegram bot domain logic', () => {
  it('toggles a subtask done and automatically recalculates parent phase progress to 100%', () => {
    const { tasks, updatedTask, nextDone } = toggleBotTaskDone(sampleTasks, 3);
    expect(nextDone).toBe(true);
    expect(updatedTask?.progress).toBe(100);
    expect(updatedTask?.isDone).toBe(true);
    // Parent phase Planning now has 2/2 subtasks completed -> 100%
    expect(tasks[0]!.progress).toBe(100);
    expect(tasks[0]!.isDone).toBe(true);
    // Firestore-safe: no undefined fields anywhere
    expect(JSON.stringify(tasks)).not.toContain('undefined');
  });

  it('updates numeric progress on a leaf task, rolls up parent phase progress, and flips isDone cleanly at 100%', () => {
    const { tasks: partialParentTasks } = setBotTaskProgress(sampleTasks, 3, 50);
    // Planning children are 100% and 50% -> parent rolls up to 75% (not 50%)
    expect(partialParentTasks[0]!.progress).toBe(75);
    expect(partialParentTasks[0]!.isDone).toBe(false);

    const { tasks: halfTasks, updatedTask: half } = setBotTaskProgress(sampleTasks, 4, 50);
    expect(half?.progress).toBe(50);
    expect(half?.isDone).toBe(false);

    const { updatedTask: full } = setBotTaskProgress(halfTasks, 4, 100);
    expect(full?.progress).toBe(100);
    expect(full?.isDone).toBe(true);
  });

  it('cascades completion to subtasks when toggling a parent group', () => {
    const { tasks: allDone } = toggleBotTaskDone(sampleTasks, 1, true);
    expect(allDone[0]!.progress).toBe(100);
    expect(allDone[0]!.children!.every((c) => c.isDone && c.progress === 100)).toBe(true);

    const { tasks: reopened } = toggleBotTaskDone(allDone, 1, false);
    expect(reopened[0]!.progress).toBe(0);
    expect(reopened[0]!.children!.every((c) => !c.isDone && c.progress === 0)).toBe(true);
  });

  it('round-trips compact callback payloads and stays strictly under Telegram 64-byte cap', () => {
    expect(parseBotCallback('ws:ws_plotwise123456:a:2')).toEqual({
      type: 'task_list',
      workspaceId: 'ws_plotwise123456',
      filter: 'active',
      page: 2,
    });
    expect(parseBotCallback('dn:ws_plotwise123456:3:l:0')).toEqual({
      type: 'toggle_done',
      workspaceId: 'ws_plotwise123456',
      taskId: 3,
      filter: 'all',
      page: 0,
    });
    expect(parseBotCallback('pr:ws_plotwise123456:4:75:a:0')).toEqual({
      type: 'set_progress',
      workspaceId: 'ws_plotwise123456',
      taskId: 4,
      progress: 75,
      filter: 'active',
      page: 0,
    });
    expect(parseBotCallback('qd:t:ws_plotwise123456:4')).toEqual({
      type: 'quick_done',
      workspaceId: 'ws_plotwise123456',
      taskId: 4,
      source: 'today',
    });

    const detail = buildTaskDetailView(
      workspaceFixture,
      3,
      'active',
      0,
      '2026-11-26',
      'https://skedspace.vercel.app',
    );
    const allButtons = detail.replyMarkup!.inline_keyboard.flat();
    for (const btn of allButtons) {
      if (btn.callback_data) {
        expect(new TextEncoder().encode(btn.callback_data).length).toBeLessThanOrEqual(64);
      }
    }
    expect(allButtons.some((b) => b.text.includes('Mark as Done'))).toBe(true);
    expect(allButtons.some((b) => b.text.includes('75%'))).toBe(true);
  });

  it('builds interactive workspace list, task list, today, upcoming, summary, and actionable alert keyboards', () => {
    const wsView = buildWorkspacesView([workspaceFixture], '2026-11-26', 'https://skedspace.vercel.app');
    expect(wsView.text).toContain('Plotwise');
    expect(wsView.replyMarkup!.inline_keyboard[0]![0]!.callback_data).toBe('ws:ws_plotwise123456:a:0');

    const activeList = buildTaskListView(
      workspaceFixture,
      'active',
      0,
      '2026-11-26',
      'https://skedspace.vercel.app',
    );
    expect(activeList.text).toContain('Finalize Scope');
    expect(activeList.text).not.toContain('Create Gantt Chart');

    const todayView = buildTodayView([workspaceFixture], '2026-11-26', 'https://skedspace.vercel.app');
    expect(todayView.text).toContain('Overdue Audit');
    expect(todayView.text).toContain('Finalize Scope');
    expect(
      todayView.replyMarkup!.inline_keyboard.flat().some((b) => b.callback_data === 'qd:t:ws_plotwise123456:4'),
    ).toBe(true);

    const upcomingView = buildUpcomingView([workspaceFixture], '2026-11-26', 'https://skedspace.vercel.app');
    expect(upcomingView.text).toContain('Finalize Scope');

    const summaryView = buildSummaryView([workspaceFixture], '2026-11-26', 'https://skedspace.vercel.app');
    expect(summaryView.text).toContain('Sked Progress Summary');
    expect(summaryView.text).toContain('Overdue: <b>1</b>');

    const alertMarkup = buildReminderAlertReplyMarkup(
      [
        {
          key: 'ws_plotwise123456:3:2026-11-26:0',
          workspaceId: 'ws_plotwise123456',
          workspaceTitle: 'Plotwise',
          taskId: 3,
          taskName: 'Finalize Scope',
          parentName: 'Planning',
          endDate: '2026-11-26',
          daysRemaining: 0,
          progress: 25,
        },
      ],
      'https://skedspace.vercel.app',
    );
    expect(alertMarkup.inline_keyboard[0]![0]!.callback_data).toBe('qd:a:ws_plotwise123456:3');
  });
});
