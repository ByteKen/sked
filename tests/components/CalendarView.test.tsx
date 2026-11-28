import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CalendarView } from '@/components/calendar/CalendarView';
import { useAgendaStore } from '@/store/agendaStore';
import type { AgendaItem, Task, WorkspaceMap } from '@/types';

vi.mock('@/config/firebase', () => ({
  auth: { currentUser: { uid: 'user-1' } },
  db: {},
}));

const sampleWorkspaces: WorkspaceMap = {
  ws_1: {
    id: 'ws_1',
    title: 'Biogas Capstone',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-20T00:00:00.000Z',
  },
};

const sampleTasks: Record<string, Task[]> = {
  ws_1: [
    {
      id: 10,
      name: 'Finalize Telemetry PCB',
      start: '2026-11-20',
      end: '2026-11-28',
      progress: 70,
      children: [],
    },
  ],
};

const sampleAgendaItem: AgendaItem = {
  id: 'ag_demo1',
  title: 'Group Demo Dry Run',
  date: '2026-11-28',
  time: '19:00',
  note: 'Test Zoom screen share',
  isDone: false,
  reminderOffsetMinutes: 15,
  timezone: 'Asia/Manila',
  reminderTargetISO: '2026-11-28T10:45:00.000Z',
  cloudTaskName: 'projects/demo/locations/asia-southeast1/queues/sked-reminders/tasks/1',
  reminderSentAt: null,
  createdAt: '2026-11-28T00:00:00.000Z',
  updatedAt: '2026-11-28T00:00:00.000Z',
};

describe('CalendarView & AgendaItemModal', () => {
  const mockSaveItem = vi.fn();
  const mockToggleDone = vi.fn();
  const mockDeleteItem = vi.fn();
  const mockOpenTask = vi.fn();
  const mockUpdateTaskStatus = vi.fn();
  const mockOpenSettings = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockSaveItem.mockResolvedValue({ ok: true, item: sampleAgendaItem });
    mockToggleDone.mockResolvedValue({ ok: true });
    mockDeleteItem.mockResolvedValue({ ok: true });

    useAgendaStore.setState({
      items: [sampleAgendaItem],
      telegramConfig: {
        connected: true,
        username: 'demo_user',
        firstName: 'Demo',
        enabled: true,
        timezone: 'Asia/Manila',
        reminderHour: 9,
        reminderOffsets: [5, 3, 1, 0],
        includeOverdue: true,
        linkedAt: '2026-11-01T00:00:00.000Z',
      },
      loading: false,
      saveItem: mockSaveItem,
      toggleDone: mockToggleDone,
      deleteItem: mockDeleteItem,
    });
  });

  it('displays both personal agenda reminders and workspace deadlines on the selected date', () => {
    render(
      <CalendarView
        workspaces={sampleWorkspaces}
        workspaceTasks={sampleTasks}
        todayISO="2026-11-28"
        onOpenTask={mockOpenTask}
        onUpdateTaskStatus={mockUpdateTaskStatus}
        onOpenSettings={mockOpenSettings}
      />,
    );

    expect(screen.getByText('November 2026')).toBeInTheDocument();
    expect(screen.getByTestId('agenda-item-ag_demo1')).toBeInTheDocument();
    expect(screen.getByText('7:00 PM')).toBeInTheDocument();
    expect(screen.getByText(/Telegram alert · 6:45 PM/i)).toBeInTheDocument();

    expect(screen.getByTestId('calendar-deadline-ws_1-10')).toBeInTheDocument();
    expect(screen.getByText('Biogas Capstone')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Open task/i }));
    expect(mockOpenTask).toHaveBeenCalledWith('ws_1', 10);

    fireEvent.click(screen.getByRole('button', { name: /Mark done/i }));
    expect(mockUpdateTaskStatus).toHaveBeenCalledWith('ws_1', 10, 'completed');
  });

  it('opens the AgendaItemModal and saves a timed personal reminder', async () => {
    render(
      <CalendarView
        workspaces={sampleWorkspaces}
        workspaceTasks={sampleTasks}
        todayISO="2026-11-28"
        onOpenTask={mockOpenTask}
        onUpdateTaskStatus={mockUpdateTaskStatus}
        onOpenSettings={mockOpenSettings}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Add Agenda/i }));
    const titleInput = screen.getByLabelText(/^Title$/i);
    fireEvent.change(titleInput, { target: { value: 'Study Session' } });
    fireEvent.change(screen.getByLabelText(/^Time/i), { target: { value: '19:00' } });

    fireEvent.click(screen.getByRole('button', { name: /Add to Calendar/i }));

    await waitFor(() => {
      expect(mockSaveItem).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Study Session',
          date: '2026-11-28',
          time: '19:00',
          recurrence: 'none',
          reminderOffsetMinutes: 15,
        }),
      );
    });
  });

  it('expands repeating agenda items across calendar days, toggles per-date completion, and saves repeating drafts', async () => {
    const repeatingItem: AgendaItem = {
      ...sampleAgendaItem,
      id: 'ag_daily',
      title: 'Daily Standup',
      date: '2026-11-27',
      time: '09:00',
      recurrence: 'daily',
      completedDates: ['2026-11-27'],
    };

    useAgendaStore.setState({
      items: [repeatingItem],
      telegramConfig: useAgendaStore.getState().telegramConfig,
      loading: false,
      saveItem: mockSaveItem,
      toggleDone: mockToggleDone,
      deleteItem: mockDeleteItem,
    });

    render(
      <CalendarView
        workspaces={sampleWorkspaces}
        workspaceTasks={sampleTasks}
        todayISO="2026-11-28"
        onOpenTask={mockOpenTask}
        onUpdateTaskStatus={mockUpdateTaskStatus}
        onOpenSettings={mockOpenSettings}
      />,
    );

    // Repeating daily item appears on Nov 28 even though series started on Nov 27
    expect(screen.getByTestId('agenda-item-ag_daily')).toBeInTheDocument();
    expect(screen.getByText('Daily')).toBeInTheDocument();

    // Toggling completion passes the specific occurrenceDate ('2026-11-28')
    fireEvent.click(screen.getByRole('button', { name: /Mark "Daily Standup" done/i }));
    expect(mockToggleDone).toHaveBeenCalledWith('ag_daily', '2026-11-28');

    // Creating a weekly repeating item from AgendaItemModal sends recurrence + optional end date
    fireEvent.click(screen.getByRole('button', { name: /Add Agenda/i }));
    fireEvent.change(screen.getByLabelText(/^Title$/i), { target: { value: 'Weekly Retro' } });
    fireEvent.click(screen.getByRole('button', { name: /^Weekly$/i }));
    fireEvent.change(screen.getByLabelText(/End repeat/i), { target: { value: '2026-12-31' } });
    fireEvent.click(screen.getByRole('button', { name: /Add to Calendar/i }));

    await waitFor(() => {
      expect(mockSaveItem).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Weekly Retro',
          date: '2026-11-28',
          recurrence: 'weekly',
          recurrenceEndDate: '2026-12-31',
        }),
      );
    });
  });
});
