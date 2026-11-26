import { createRef } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppHeader } from '@/components/layout/AppHeader';

vi.mock('@/store/workspaceStore', () => ({
  useWorkspaceStore: (selector: (s: unknown) => unknown) =>
    selector({
      workspaces: {
        ws_1: {
          id: 'ws_1',
          title: 'Plotwise',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      },
      currentWorkspaceId: 'ws_1',
      createWorkspace: vi.fn(),
      updateWorkspace: vi.fn(),
      deleteWorkspace: vi.fn(),
    }),
}));

describe('AppHeader direct workspace & profile menu', () => {
  const user = {
    id: 'u1',
    name: 'Alex Rivera',
    email: 'alex@example.com',
    photoURL: null,
    loginTime: '2026-01-01T00:00:00Z',
  };

  it('renders workspace selector and profile menu directly on the topbar without a sidebar drawer button', async () => {
    const onOpenSettings = vi.fn();
    const onOpenImport = vi.fn();
    const onRequestLogout = vi.fn();

    render(
      <MemoryRouter>
        <AppHeader
          user={user}
          searchTerm=""
          searchInputRef={createRef<HTMLInputElement>()}
          onSearchChange={vi.fn()}
          onGoHome={vi.fn()}
          onOpenSettings={onOpenSettings}
          onOpenImport={onOpenImport}
          onRequestLogout={onRequestLogout}
        />
      </MemoryRouter>,
    );

    // No hamburger menu button
    expect(screen.queryByRole('button', { name: /open menu/i })).not.toBeInTheDocument();

    // Workspace selector directly in topbar
    expect(screen.getByRole('button', { name: /plotwise/i })).toBeInTheDocument();

    // Profile menu opens & closes cleanly on repeated click
    const profileTrigger = screen.getByRole('button', {
      name: /open profile menu for alex rivera/i,
    });
    fireEvent.click(profileTrigger);
    expect(profileTrigger).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu');
    expect(menu).toBeInTheDocument();
    expect(within(menu).getByText('alex@example.com')).toBeInTheDocument();

    fireEvent.click(profileTrigger);
    expect(profileTrigger).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());

    // Triggering menu actions works and closes menu
    fireEvent.click(profileTrigger);
    fireEvent.click(screen.getByRole('menuitem', { name: /settings & alerts/i }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());

    fireEvent.click(profileTrigger);
    fireEvent.click(screen.getByRole('menuitem', { name: /import json/i }));
    expect(onOpenImport).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());

    fireEvent.click(profileTrigger);
    fireEvent.click(screen.getByRole('menuitem', { name: /sign out/i }));
    expect(onRequestLogout).toHaveBeenCalledTimes(1);
  });
});
