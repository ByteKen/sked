import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsModal } from '@/components/modals/SettingsModal';
import { applyAnimationsToDocument, applyThemeToDocument, usePreferencesStore } from '@/store/preferencesStore';
import { DEFAULT_PREFERENCES } from '@/types';

const { mockUpdateDisplayName } = vi.hoisted(() => ({
  mockUpdateDisplayName: vi.fn(),
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({
      user: {
        id: 'u1',
        name: 'Ken Brian',
        email: 'ken@example.com',
        photoURL: null,
        loginTime: '2026-01-01T00:00:00Z',
      },
      updateDisplayName: mockUpdateDisplayName,
      deleteAccount: vi.fn(),
    }),
}));

vi.mock('@/store/workspaceStore', () => ({
  useWorkspaceStore: (selector: (s: unknown) => unknown) =>
    selector({
      workspaces: {
        ws_1: { id: 'ws_1', title: 'Plotwise', isShared: true, shareId: 'sh_123' },
      },
      currentWorkspaceId: 'ws_1',
      syncSharedPreferences: vi.fn(),
    }),
}));

describe('SettingsModal tabbed layout & Profile display name', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePreferencesStore.setState({ ...DEFAULT_PREFERENCES });
    applyThemeToDocument(DEFAULT_PREFERENCES.theme);
    applyAnimationsToDocument(DEFAULT_PREFERENCES.enableAnimations);
    mockUpdateDisplayName.mockResolvedValue({
      ok: true,
      name: 'Ken Studio',
      syncedSharesCount: 1,
    });
  });

  it('renders tabs in exact order (Profile, Display, Export, Bot & Alerts, Shortcuts) and switches cleanly', () => {
    render(
      <MemoryRouter>
        <SettingsModal isOpen onClose={vi.fn()} />
      </MemoryRouter>,
    );

    const renderedTabs = screen.getAllByRole('tab').map((tab) => tab.textContent?.trim());
    expect(renderedTabs).toEqual(['Profile', 'Display', 'Export', 'Bot & Alerts', 'Shortcuts']);

    // Default tab is Profile when signed in
    expect(screen.getByRole('tab', { name: /profile/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();

    // Switch to Display tab
    fireEvent.click(screen.getByRole('tab', { name: /display/i }));
    expect(screen.getByText(/^dark mode$/i)).toBeInTheDocument();

    // Switch to Export tab
    fireEvent.click(screen.getByRole('tab', { name: /export/i }));
    expect(screen.getByText(/pdf & image export styling/i)).toBeInTheDocument();
    expect(screen.queryByText(/studio dark mode/i)).not.toBeInTheDocument();

    // Switch to Bot & Alerts tab
    fireEvent.click(screen.getByRole('tab', { name: /bot & alerts/i }));
    expect(screen.getByText(/telegram bot & alerts/i)).toBeInTheDocument();

    // Switch to Shortcuts tab
    fireEvent.click(screen.getByRole('tab', { name: /shortcuts/i }));
    expect(screen.getByText(/horizontal timeline scroll/i)).toBeInTheDocument();
    expect(screen.getByText(/cursor-anchored zoom/i)).toBeInTheDocument();
    expect(screen.getByText(/mobile pinch-to-zoom/i)).toBeInTheDocument();
  });

  it('previews "Shared by" attribution live and saves an updated display name in Profile tab', async () => {
    render(
      <MemoryRouter>
        <SettingsModal isOpen onClose={vi.fn()} initialTab="profile" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('tab', { name: /profile/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/1 active shared chart/i)).toBeInTheDocument();

    const input = screen.getByLabelText(/display name/i);
    fireEvent.change(input, { target: { value: 'Ken Studio' } });

    // Live attribution preview updates immediately
    expect(screen.getAllByText('Ken Studio').length).toBeGreaterThanOrEqual(2);

    const saveBtn = screen.getByRole('button', { name: /save name/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateDisplayName).toHaveBeenCalledWith('Ken Studio');
    });
  });

  it('exposes all user display toggles in Display tab, updates store & DOM motion state, and resets defaults', async () => {
    render(
      <MemoryRouter>
        <SettingsModal isOpen onClose={vi.fn()} initialTab="display" />
      </MemoryRouter>,
    );

    const toggleCases: Array<{
      ariaName: RegExp;
      key: keyof typeof DEFAULT_PREFERENCES;
    }> = [
      { ariaName: /toggle animations and motion/i, key: 'enableAnimations' },
      { ariaName: /toggle rounded deadline bars/i, key: 'useRoundedSubtasks' },
      { ariaName: /toggle bar hover tooltips/i, key: 'showBarTooltips' },
      { ariaName: /toggle dependency arrows/i, key: 'showDependencyLines' },
      { ariaName: /toggle subtask connectors/i, key: 'showSubtaskConnectors' },
      { ariaName: /toggle task descriptions on timeline/i, key: 'showTaskDescriptions' },
      { ariaName: /toggle progress percentages/i, key: 'showProgressPercentages' },
      { ariaName: /toggle today marker line/i, key: 'showTodayLine' },
      { ariaName: /toggle weekend shading/i, key: 'highlightWeekends' },
      { ariaName: /toggle critical path highlight/i, key: 'showCriticalPathByDefault' },
      { ariaName: /toggle auto-cascade dependencies/i, key: 'autoCascadeDependencies' },
      { ariaName: /toggle in-app reminder banners/i, key: 'enableInAppReminders' },
      { ariaName: /toggle reminder alert chime/i, key: 'reminderSoundEnabled' },
    ];

    for (const { ariaName, key } of toggleCases) {
      const initial = Boolean(usePreferencesStore.getState()[key]);
      const sw = screen.getByRole('switch', { name: ariaName });
      expect(sw).toHaveAttribute('aria-checked', String(initial));
      fireEvent.click(sw);
      expect(usePreferencesStore.getState()[key]).toBe(!initial);
    }

    // Disabling animations sets data-reduce-motion="true" on <html>
    expect(document.documentElement.getAttribute('data-reduce-motion')).toBe('true');

    // Clicking "Reset defaults" restores all preferences and removes reduced-motion attribute
    fireEvent.click(screen.getByRole('button', { name: /reset defaults/i }));
    await waitFor(() => {
      expect(usePreferencesStore.getState().enableAnimations).toBe(true);
      expect(usePreferencesStore.getState().showTodayLine).toBe(true);
      expect(usePreferencesStore.getState().showCriticalPathByDefault).toBe(false);
      expect(usePreferencesStore.getState().enableInAppReminders).toBe(true);
    });
    expect(document.documentElement.getAttribute('data-reduce-motion')).toBeNull();
  });
});
