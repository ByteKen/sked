import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FocusDashboardPanel } from '@/components/dashboard/FocusDashboardPanel';
import { WorkspaceCard } from '@/components/workspace/WorkspaceCard';
import { buildPortfolioFocusSummary } from '@/domain/projectHealth';
import type { Task, Workspace, WorkspaceMap } from '@/types';

const wsAlpha: Workspace = {
  id: 'ws_a',
  title: 'Alpha Launch',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
};

const wsBeta: Workspace = {
  id: 'ws_b',
  title: 'Website Refresh',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
};

const workspaces: WorkspaceMap = {
  ws_a: wsAlpha,
  ws_b: wsBeta,
};

const tasksByWs: Record<string, Task[]> = {
  ws_a: [
    { id: 1, name: 'Fix Checkout Bug', start: '2026-05-01', end: '2026-05-06', progress: 20 },
    { id: 2, name: 'Publish Release Notes', start: '2026-05-10', end: '2026-05-10', progress: 0 },
  ],
  ws_b: [
    { id: 10, name: 'Hero Copy Review', start: '2026-05-11', end: '2026-05-13', progress: 40, isWorking: true },
  ],
};

describe('Phase 3 FocusDashboardPanel & WorkspaceCard health indicators', () => {
  it('filters cross-workspace focus buckets via KPI cards and triggers quick status & deep-link actions', async () => {
    const user = userEvent.setup();
    const onOpenTask = vi.fn();
    const onUpdateTaskStatus = vi.fn();
    const summary = buildPortfolioFocusSummary(workspaces, tasksByWs, '2026-05-10');

    render(
      <FocusDashboardPanel
        summary={summary}
        onOpenTask={onOpenTask}
        onUpdateTaskStatus={onUpdateTaskStatus}
      />,
    );

    // All 3 priority items visible initially
    expect(screen.getByTestId('focus-item-ws_a-1')).toBeInTheDocument();
    expect(screen.getByTestId('focus-item-ws_a-2')).toBeInTheDocument();
    expect(screen.getByTestId('focus-item-ws_b-10')).toBeInTheDocument();

    // Filter to Overdue via tab
    await user.click(screen.getByRole('tab', { name: /overdue/i }));
    expect(screen.getByTestId('focus-item-ws_a-1')).toBeInTheDocument();
    expect(screen.queryByTestId('focus-item-ws_b-10')).not.toBeInTheDocument();

    // Mark Done directly from Focus Dashboard
    await user.click(screen.getByRole('button', { name: /mark fix checkout bug complete/i }));
    expect(onUpdateTaskStatus).toHaveBeenCalledWith('ws_a', 1, 'completed');

    // Start Working directly from Focus Dashboard
    await user.click(screen.getByRole('button', { name: /start working on fix checkout bug/i }));
    expect(onUpdateTaskStatus).toHaveBeenCalledWith('ws_a', 1, 'working');

    // Open task deep-link in workspace
    await user.click(screen.getByRole('button', { name: /open fix checkout bug in alpha launch/i }));
    expect(onOpenTask).toHaveBeenCalledWith('ws_a', 1);
  });

  it('shows calm All Caught Up state when no tasks are overdue or due within 7 days', () => {
    const summary = buildPortfolioFocusSummary(
      { ws_a: wsAlpha },
      {
        ws_a: [
          { id: 1, name: 'Shipped', start: '2026-05-01', end: '2026-05-05', progress: 100, isDone: true },
        ],
      },
      '2026-05-10',
    );

    render(
      <FocusDashboardPanel
        summary={summary}
        onOpenTask={vi.fn()}
        onUpdateTaskStatus={vi.fn()}
      />,
    );

    expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
  });

  it('renders live project health badge and overdue telemetry on WorkspaceCard', () => {
    const summary = buildPortfolioFocusSummary(workspaces, tasksByWs, '2026-05-10');

    render(
      <WorkspaceCard
        workspace={wsAlpha}
        stats={{ total: 2, completed: 0, working: 0, inProgress: 1, notStarted: 1, completionPercent: 10 }}
        health={summary.healthByWorkspaceId.ws_a}
        accentIndex={0}
        isEditing={false}
        editingName=""
        inputError={null}
        onOpen={vi.fn()}
        onStartEdit={vi.fn()}
        onChangeEditName={vi.fn()}
        onSaveEdit={vi.fn()}
        onCancelEdit={vi.fn()}
        onShare={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText('Off Track')).toBeInTheDocument();
    expect(screen.getByText('1 overdue')).toBeInTheDocument();
    expect(screen.getByText('1 due today')).toBeInTheDocument();
  });
});
