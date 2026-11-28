import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AgendaReminderBanner } from '@/components/calendar/AgendaReminderBanner';
import { useAgendaStore } from '@/store/agendaStore';
import { useAuthStore } from '@/store/authStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { DEFAULT_PREFERENCES, type AgendaItem } from '@/types';

const mockPlayChime = vi.fn((..._args: unknown[]) => true);

vi.mock('@/utils/reminderSound', () => ({
  isReminderSoundEnabled: () => true,
  setReminderSoundEnabled: vi.fn(),
  subscribeReminderSoundPreference: () => () => {},
  playReminderChime: (...args: unknown[]) => mockPlayChime(...args),
}));

vi.mock('@/config/firebase', () => ({
  auth: { currentUser: { uid: 'user-1' } },
  googleProvider: {},
  db: {},
}));

describe('AgendaReminderBanner', () => {
  const mockToggleDone = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    usePreferencesStore.setState({ ...DEFAULT_PREFERENCES });
    mockToggleDone.mockResolvedValue({ ok: true });

    useAuthStore.setState({
      user: {
        id: 'user-1',
        email: 'user@example.com',
        name: 'Alex',
        photoURL: null,
        loginTime: new Date().toISOString(),
      },
      isAuthenticated: true,
      loading: false,
      error: null,
      cancelled: false,
    });
  });

  it('displays an in-app alert with chime for a due reminder and supports Mark Done', async () => {
    const dueItem: AgendaItem = {
      id: 'ag_live_1',
      title: 'Capstone Pitch',
      date: '2026-11-28',
      time: '19:00',
      note: 'Room 304',
      isDone: false,
      reminderOffsetMinutes: 15,
      timezone: 'Asia/Manila',
      reminderTargetISO: new Date(Date.now() - 5_000).toISOString(),
      cloudTaskName: null,
      reminderSentAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    useAgendaStore.setState({
      items: [dueItem],
      telegramConfig: null,
      loading: false,
      toggleDone: mockToggleDone,
    });

    render(
      <MemoryRouter>
        <AgendaReminderBanner />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('in-app-reminder-ag_live_1')).toBeInTheDocument();
    expect(screen.getByText('Reminder — Starting in 15 minutes')).toBeInTheDocument();
    expect(screen.getByText('Capstone Pitch')).toBeInTheDocument();
    expect(screen.getByText('7:00 PM')).toBeInTheDocument();
    expect(mockPlayChime).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Mark Done/i }));

    await waitFor(() => {
      expect(mockToggleDone).toHaveBeenCalledWith('ag_live_1');
    });
  });

  it('does not show banners or play chimes when enableInAppReminders is disabled', () => {
    usePreferencesStore.setState({ ...DEFAULT_PREFERENCES, enableInAppReminders: false });

    const dueItem: AgendaItem = {
      id: 'ag_live_muted',
      title: 'Silent Event',
      date: '2026-11-28',
      time: '19:00',
      note: '',
      isDone: false,
      reminderOffsetMinutes: 15,
      timezone: 'Asia/Manila',
      reminderTargetISO: new Date(Date.now() - 5_000).toISOString(),
      cloudTaskName: null,
      reminderSentAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    useAgendaStore.setState({
      items: [dueItem],
      telegramConfig: null,
      loading: false,
      toggleDone: mockToggleDone,
    });

    render(
      <MemoryRouter>
        <AgendaReminderBanner />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId('in-app-reminder-ag_live_muted')).not.toBeInTheDocument();
    expect(mockPlayChime).not.toHaveBeenCalled();
  });
});
