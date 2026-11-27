import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { SharedChart } from '@/types';

const mockSubscribe = vi.fn();
const mockCommitCollab = vi.fn();
const mockCheckEditorAccess = vi.fn();

vi.mock('@/services/shareRepository', () => ({
  subscribeToSharedChart: (...args: unknown[]) => mockSubscribe(...args),
  commitCollaborativeChartMutation: (...args: unknown[]) => mockCommitCollab(...args),
  checkSharedChartEditorAccess: (...args: unknown[]) => mockCheckEditorAccess(...args),
}));

vi.mock('@/config/firebase', () => ({
  auth: {},
  googleProvider: {},
  db: {},
}));

import { SharedChartPage } from '@/pages/SharedChartPage';
import { useAuthStore } from '@/store/authStore';

const sampleSharedChart: SharedChart = {
  shareId: 'PubLink123456789',
  ownerId: 'owner-1',
  ownerName: 'Alex Rivera',
  workspaceId: 'ws_1',
  title: 'Q2 Platform Migration',
  tasks: [
    {
      id: 1,
      name: 'TypeScript Upgrade',
      start: '2026-04-01',
      end: '2026-04-15',
      progress: 60,
      children: [],
    },
  ],
  preferences: {
    useRoundedSubtasks: false,
    taskLabelPosition: 'inside',
    subtaskLabelPosition: 'outside',
    barHeight: 'compact',
    showDependencyLines: true,
    showSubtaskConnectors: true,
  },
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-02T00:00:00.000Z',
};

describe('SharedChartPage (/share/:shareId)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckEditorAccess.mockResolvedValue(false);
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      loading: false,
      error: null,
      cancelled: false,
    });
  });

  it('renders a live public chart for anonymous viewers without requiring sign-in', () => {
    mockSubscribe.mockImplementation(
      (_id: string, onData: (chart: SharedChart | null) => void) => {
        onData(sampleSharedChart);
        return vi.fn();
      },
    );

    render(
      <MemoryRouter initialEntries={['/share/PubLink123456789']}>
        <Routes>
          <Route path="/share/:shareId" element={<SharedChartPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Q2 Platform Migration')).toBeInTheDocument();
    expect(screen.getByText(/Shared by Alex Rivera/i)).toBeInTheDocument();
    expect(screen.getByText(/Live · Read-only/i)).toBeInTheDocument();
    expect(screen.getAllByText('TypeScript Upgrade').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: /Duplicate/i })).toBeInTheDocument();

    // Public viewer can switch cleanly to Board and List views in read-only mode
    fireEvent.click(screen.getByRole('tab', { name: /board/i }));
    expect(screen.getByTestId('board-card-1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /list/i }));
    expect(screen.getByTestId('list-row-1')).toBeInTheDocument();
  });

  it('shows a graceful unavailable state when sharing is revoked or invalid', () => {
    mockSubscribe.mockImplementation(
      (_id: string, onData: (chart: SharedChart | null) => void) => {
        onData(null);
        return vi.fn();
      },
    );

    render(
      <MemoryRouter initialEntries={['/share/RevokedId1234567']}>
        <Routes>
          <Route path="/share/:shareId" element={<SharedChartPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Chart Unavailable')).toBeInTheDocument();
  });

  it('unlocks live collaborative editing via private sharedChartAccess without exposing editorEmails on public docs', async () => {
    const collabChart: SharedChart = {
      ...sampleSharedChart,
      hasEditors: true,
      lastEditedBy: {
        uid: 'owner-1',
        name: 'Alex Rivera',
        at: '2026-04-02T00:00:00.000Z',
      },
    };

    mockSubscribe.mockImplementation(
      (_id: string, onData: (chart: SharedChart | null) => void) => {
        onData(collabChart);
        return vi.fn();
      },
    );
    mockCheckEditorAccess.mockResolvedValue(true);
    mockCommitCollab.mockResolvedValue({ tasks: collabChart.tasks, nextId: 2, version: 2 });

    useAuthStore.setState({
      user: {
        id: 'editor-2',
        name: 'Maya Chen',
        email: 'MAYA@example.com',
        photoURL: null,
        loginTime: '2026-04-02T00:00:00.000Z',
      },
      isAuthenticated: true,
      loading: false,
      error: null,
      cancelled: false,
    });

    render(
      <MemoryRouter initialEntries={['/share/PubLink123456789']}>
        <Routes>
          <Route path="/share/:shareId" element={<SharedChartPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Live · Editing/i)).toBeInTheDocument();
    });
    expect(mockCheckEditorAccess).toHaveBeenCalledWith('PubLink123456789', 'MAYA@example.com');
    expect(screen.getByRole('button', { name: /^New Task$/i })).toBeInTheDocument();

    // Switch to Board view and move task status -> commits via atomic collaborative transaction without email PII
    fireEvent.click(screen.getByRole('tab', { name: /board/i }));
    fireEvent.change(screen.getByLabelText(/move typescript upgrade to status/i), {
      target: { value: 'completed' },
    });
    await waitFor(() => {
      expect(mockCommitCollab).toHaveBeenCalledTimes(1);
    });
    const callArg = mockCommitCollab.mock.calls[0]?.[0] as { editor?: Record<string, unknown> };
    expect(callArg?.editor).toEqual({ uid: 'editor-2', name: 'Maya Chen' });
  });
});
