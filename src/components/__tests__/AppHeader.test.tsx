import { createRef } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppHeader } from '@/components/layout/AppHeader';
import { MobileBottomBar } from '@/components/layout/MobileNav';

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

describe('AppHeader direct workspace & profile menu + unified bottom Import/Export menu', () => {
  const user = {
    id: 'u1',
    name: 'Alex Rivera',
    email: 'alex@example.com',
    photoURL: null,
    loginTime: '2026-01-01T00:00:00Z',
  };

  it('renders workspace selector and streamlined profile menu (Settings, no Import JSON) directly on topbar', async () => {
    const onOpenSettings = vi.fn();
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
          onRequestLogout={onRequestLogout}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('button', { name: /open menu/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /plotwise/i })).toBeInTheDocument();

    const profileTrigger = screen.getByRole('button', {
      name: /open profile menu for alex rivera/i,
    });
    fireEvent.click(profileTrigger);
    expect(profileTrigger).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('alex@example.com')).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: /import json/i })).not.toBeInTheDocument();

    fireEvent.click(profileTrigger);
    expect(profileTrigger).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());

    fireEvent.click(profileTrigger);
    fireEvent.click(screen.getByRole('menuitem', { name: /^settings$/i }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());

    fireEvent.click(profileTrigger);
    fireEvent.click(screen.getByRole('menuitem', { name: /sign out/i }));
    expect(onRequestLogout).toHaveBeenCalledTimes(1);
  });

  it('merges Import JSON and Export formats inside the bottom Export menu', async () => {
    const onOpenImport = vi.fn();
    const onExport = vi.fn();

    render(
      <MobileBottomBar
        workspace={{
          id: 'ws_1',
          title: 'Plotwise',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        }}
        mobileView="chart"
        onChangeView={vi.fn()}
        onAddTask={vi.fn()}
        onOpenShare={vi.fn()}
        onOpenImport={onOpenImport}
        onExport={onExport}
      />,
    );

    const exportBtn = screen.getByRole('button', { name: /import or export tasks/i });
    fireEvent.click(exportBtn);

    expect(screen.getByRole('menuitem', { name: /import json/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /export pdf/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: /import json/i }));
    expect(onOpenImport).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());

    fireEvent.click(exportBtn);
    fireEvent.click(screen.getByRole('menuitem', { name: /export pdf/i }));
    expect(onExport).toHaveBeenCalledWith('pdf');
  });
});
