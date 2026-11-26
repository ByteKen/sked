import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { SharedChart } from '@/types';

const mockSubscribe = vi.fn();

vi.mock('@/services/shareRepository', () => ({
  subscribeToSharedChart: (...args: unknown[]) => mockSubscribe(...args),
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
});
