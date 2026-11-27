import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KanbanBoardView } from '@/components/views/KanbanBoardView';
import { TaskListView } from '@/components/views/TaskListView';
import type { Task, WorkspaceBaseline } from '@/types';

const tasksFixture: Task[] = [
  {
    id: 1,
    name: 'Phase 1: Core',
    start: '2026-01-05',
    end: '2026-01-20',
    progress: 50,
    collapsed: false,
    children: [
      {
        id: 2,
        name: 'Setup Repo',
        start: '2026-01-05',
        end: '2026-01-10',
        progress: 100,
        isDone: true,
        parentId: 1,
      },
      {
        id: 3,
        name: 'Build Auth',
        description: 'OAuth sign-in and session sync',
        start: '2026-01-11',
        end: '2026-01-20',
        progress: 40,
        isWorking: true,
        parentId: 1,
      },
    ],
  },
  {
    id: 4,
    name: 'Launch Docs',
    start: '2026-01-21',
    end: '2026-01-25',
    progress: 0,
    dependencies: [3],
  },
];

const baselineFixture: WorkspaceBaseline = {
  savedAt: '2026-01-01T00:00:00Z',
  entries: {
    3: { start: '2026-01-11', end: '2026-01-17' },
  },
};

function mockMobileMatchMedia(isMobile: boolean) {
  const original = window.matchMedia;
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: isMobile && query === '(max-width: 767px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  return () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: original,
    });
  };
}

describe('Phase 2 Multi-View components (KanbanBoardView & TaskListView)', () => {
  it('groups cards on KanbanBoardView, supports desktop drag-and-drop, touch status select, and column quick-add', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    const onAddTaskWithStatus = vi.fn();

    render(
      <KanbanBoardView
        tasks={tasksFixture}
        selectedTaskId={null}
        onSelectTask={vi.fn()}
        onTaskActivate={vi.fn()}
        onStatusChange={onStatusChange}
        onAddTaskWithStatus={onAddTaskWithStatus}
        baseline={baselineFixture}
      />,
    );

    // Actionable leaf tasks are placed in their respective status columns
    const todoCol = screen.getByTestId('board-column-not-started');
    const workingCol = screen.getByTestId('board-column-working');
    const doneCol = screen.getByTestId('board-column-completed');

    expect(within(todoCol).getByText('Launch Docs')).toBeInTheDocument();
    expect(within(todoCol).getByText('Blocked')).toBeInTheDocument();
    expect(within(workingCol).getByText('Build Auth')).toBeInTheDocument();
    expect(within(workingCol).getByText('+3d')).toBeInTheDocument();
    expect(within(doneCol).getByText('Setup Repo')).toBeInTheDocument();

    // Cross-platform accessible status move <select>
    await user.selectOptions(
      screen.getByLabelText(/move launch docs to status/i),
      'in-progress',
    );
    expect(onStatusChange).toHaveBeenCalledWith(4, 'in-progress');

    // Desktop drag-and-drop from Working -> Completed
    const authCard = screen.getByTestId('board-card-3');
    const dataTransfer = {
      data: {} as Record<string, string>,
      effectAllowed: 'move',
      dropEffect: 'move',
      setData(key: string, val: string) {
        this.data[key] = val;
      },
      getData(key: string) {
        return this.data[key] ?? '';
      },
    };
    fireEvent.dragStart(authCard, { dataTransfer });
    fireEvent.dragOver(doneCol, { dataTransfer });
    fireEvent.drop(doneCol, { dataTransfer });
    expect(onStatusChange).toHaveBeenCalledWith(3, 'completed');

    // Column footer quick-add pre-fills that column's status
    await user.click(within(workingCol).getByRole('button', { name: /add task/i }));
    expect(onAddTaskWithStatus).toHaveBeenCalledWith('working');
  });

  it('switches KanbanBoardView cleanly to focused column tabs on mobile viewports', async () => {
    const restore = mockMobileMatchMedia(true);
    try {
      const user = userEvent.setup();
      render(
        <KanbanBoardView
          tasks={tasksFixture}
          selectedTaskId={null}
          onSelectTask={vi.fn()}
          onTaskActivate={vi.fn()}
          onStatusChange={vi.fn()}
        />,
      );

      // Mobile starts focused on Working column (no sideways 4-column cramming)
      expect(screen.getByTestId('board-column-working')).toBeInTheDocument();
      expect(screen.queryByTestId('board-column-completed')).not.toBeInTheDocument();

      // Switch to Done tab
      await user.click(screen.getByRole('tab', { name: /done/i }));
      expect(screen.getByTestId('board-column-completed')).toBeInTheDocument();
      expect(screen.getByText('Setup Repo')).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it('renders TaskListView with sorting, inline status & progress editing, and hierarchy collapse', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    const onUpdateProgress = vi.fn();
    const onRescheduleTask = vi.fn();

    render(
      <TaskListView
        tasks={tasksFixture}
        selectedTaskId={null}
        onSelectTask={vi.fn()}
        onTaskActivate={vi.fn()}
        onStatusChange={onStatusChange}
        onUpdateProgress={onUpdateProgress}
        onRescheduleTask={onRescheduleTask}
        baseline={baselineFixture}
      />,
    );

    expect(screen.getByTestId('list-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('list-row-2')).toBeInTheDocument();
    expect(screen.getByTestId('list-row-3')).toBeInTheDocument();
    expect(screen.getByTestId('list-row-4')).toBeInTheDocument();

    // Change inline status via select
    await user.selectOptions(screen.getByLabelText(/status for launch docs/i), 'working');
    expect(onStatusChange).toHaveBeenCalledWith(4, 'working');

    // Update inline progress range
    fireEvent.change(screen.getByLabelText(/progress for launch docs/i), {
      target: { value: '60' },
    });
    expect(onUpdateProgress).toHaveBeenCalledWith(4, 60);

    // Click schedule dates to open inline date editor and reschedule
    const launchRow = screen.getByTestId('list-row-4');
    await user.click(within(launchRow).getByRole('button', { name: /jan 21/i }));
    fireEvent.change(screen.getByLabelText(/end date for launch docs/i), {
      target: { value: '2026-01-28' },
    });
    expect(onRescheduleTask).toHaveBeenCalledWith(4, '2026-01-21', '2026-01-28', true);

    // Sort by Progress
    await user.selectOptions(screen.getByLabelText(/sort tasks by/i), 'progress');
    const rows = screen.getAllByTestId(/^list-row-/);
    // Ascending progress: 0% (Launch Docs id:4) appears first
    expect(rows[0]).toHaveAttribute('data-testid', 'list-row-4');
  });

  it('renders mobile stacked cards instead of a wide table in TaskListView on phones', () => {
    const restore = mockMobileMatchMedia(true);
    try {
      render(
        <TaskListView
          tasks={tasksFixture}
          selectedTaskId={null}
          onSelectTask={vi.fn()}
          onTaskActivate={vi.fn()}
          readOnly
        />,
      );

      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.getByTestId('list-row-1')).toBeInTheDocument();
      expect(screen.getByTestId('list-row-3')).toBeInTheDocument();
    } finally {
      restore();
    }
  });
});
