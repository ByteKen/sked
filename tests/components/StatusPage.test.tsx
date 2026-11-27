import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppFooter } from '@/components/layout/AppFooter';
import type { SystemStatusResponse } from '@/domain/systemStatus';
import { StatusPage } from '@/pages/StatusPage';
import { useAuthStore } from '@/store/authStore';

const mockFetchSystemStatus = vi.fn();

vi.mock('@/services/statusService', () => ({
  fetchSystemStatus: (...args: unknown[]) => mockFetchSystemStatus(...args),
}));

const sampleStatus: SystemStatusResponse = {
  ok: true,
  plan: 'spark',
  databaseId: '(default)',
  checkedAtISO: '2026-11-27T12:00:00.000Z',
  resetAtISO: '2026-11-28T08:00:00.000Z',
  cached: false,
  overallLevel: 'operational',
  metrics: {
    writes: {
      key: 'writes',
      label: 'Writes',
      usedToday: 465,
      limit: 20_000,
      percentUsed: 2.3,
      peak7d: 465,
      peak7dDateISO: '2026-11-27',
      isTodayPeak: true,
      level: 'operational',
      daily7d: [
        { dateISO: '2026-11-21', label: 'Nov 21', count: 50 },
        { dateISO: '2026-11-22', label: 'Nov 22', count: 120 },
        { dateISO: '2026-11-23', label: 'Nov 23', count: 80 },
        { dateISO: '2026-11-24', label: 'Nov 24', count: 95 },
        { dateISO: '2026-11-25', label: 'Nov 25', count: 180 },
        { dateISO: '2026-11-26', label: 'Nov 26', count: 210 },
        { dateISO: '2026-11-27', label: 'Nov 27', count: 465 },
      ],
    },
    reads: {
      key: 'reads',
      label: 'Reads',
      usedToday: 591,
      limit: 50_000,
      percentUsed: 1.2,
      peak7d: 591,
      peak7dDateISO: '2026-11-27',
      isTodayPeak: true,
      level: 'operational',
      daily7d: [
        { dateISO: '2026-11-21', label: 'Nov 21', count: 110 },
        { dateISO: '2026-11-22', label: 'Nov 22', count: 240 },
        { dateISO: '2026-11-23', label: 'Nov 23', count: 190 },
        { dateISO: '2026-11-24', label: 'Nov 24', count: 220 },
        { dateISO: '2026-11-25', label: 'Nov 25', count: 310 },
        { dateISO: '2026-11-26', label: 'Nov 26', count: 420 },
        { dateISO: '2026-11-27', label: 'Nov 27', count: 591 },
      ],
    },
    deletes: {
      key: 'deletes',
      label: 'Deletes',
      usedToday: 5,
      limit: 20_000,
      percentUsed: 0,
      peak7d: 12,
      peak7dDateISO: '2026-11-25',
      isTodayPeak: false,
      level: 'operational',
      daily7d: [
        { dateISO: '2026-11-21', label: 'Nov 21', count: 0 },
        { dateISO: '2026-11-22', label: 'Nov 22', count: 2 },
        { dateISO: '2026-11-23', label: 'Nov 23', count: 1 },
        { dateISO: '2026-11-24', label: 'Nov 24', count: 0 },
        { dateISO: '2026-11-25', label: 'Nov 25', count: 12 },
        { dateISO: '2026-11-26', label: 'Nov 26', count: 4 },
        { dateISO: '2026-11-27', label: 'Nov 27', count: 5 },
      ],
    },
  },
  storage: {
    usedBytes: 104_635,
    limitBytes: 1_073_741_824,
    percentUsed: 0.01,
    level: 'operational',
    sampledAtISO: '2026-11-27T11:00:00.000Z',
  },
  services: {
    firestore: 'operational',
    monitoring: 'operational',
    telegramBot: 'configured',
  },
};

describe('AppFooter Status link visibility & StatusPage', () => {
  beforeEach(() => {
    mockFetchSystemStatus.mockReset();
    window.scrollTo = vi.fn();
    useAuthStore.setState({ user: null, isAuthenticated: false, loading: false, error: null });
  });

  it('shows the Status footer link next to Privacy Policy only when logged in', () => {
    const { rerender } = render(
      <MemoryRouter>
        <AppFooter />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /privacy policy/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /status/i })).not.toBeInTheDocument();

    act(() => {
      useAuthStore.setState({
        isAuthenticated: true,
        user: {
          id: 'u1',
          name: 'Ken',
          email: 'ken@example.com',
          photoURL: null,
          loginTime: '2026-11-27T00:00:00Z',
        },
      });
    });

    rerender(
      <MemoryRouter>
        <AppFooter />
      </MemoryRouter>,
    );
    const fullStatusLink = screen.getByRole('link', { name: /status/i });
    expect(fullStatusLink).toHaveAttribute('href', '/status');

    rerender(
      <MemoryRouter>
        <AppFooter compact />
      </MemoryRouter>,
    );
    const compactStatusLink = screen.getByRole('link', { name: /status/i });
    expect(compactStatusLink).toHaveAttribute('href', '/status');
  });

  it('renders live Firestore Spark quotas, 7-day trend switcher, and manual refresh on StatusPage', async () => {
    mockFetchSystemStatus.mockResolvedValue(sampleStatus);

    render(
      <MemoryRouter>
        <StatusPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('All Systems Operational')).toBeInTheDocument();
    });

    expect(screen.getByTestId('quota-row-writes')).toHaveTextContent('465');
    expect(screen.getByTestId('quota-row-writes')).toHaveTextContent('2.3%');
    expect(screen.getByTestId('quota-row-writes')).toHaveTextContent('20K / day');
    expect(screen.getByTestId('quota-row-writes')).toHaveTextContent(
      'Highest daily usage in the last 7 days',
    );

    expect(screen.getByTestId('quota-row-reads')).toHaveTextContent('591');
    expect(screen.getByTestId('quota-row-reads')).toHaveTextContent('1.2%');
    expect(screen.getByTestId('quota-row-reads')).toHaveTextContent('50K / day');

    expect(screen.getByTestId('quota-row-deletes')).toHaveTextContent('5');
    expect(screen.getByTestId('quota-row-deletes')).toHaveTextContent('7-day peak: 12');

    expect(screen.getByTestId('quota-row-storage')).toHaveTextContent('102.2 KiB');
    expect(screen.getByTestId('quota-row-storage')).toHaveTextContent('< 0.1%');
    expect(screen.getByTestId('quota-row-storage')).toHaveTextContent('1 GiB total');

    // Switch 7-day chart tab from Reads to Writes
    fireEvent.click(screen.getByRole('tab', { name: /writes/i }));
    expect(screen.getByText(/Last 7 Days · Writes/i)).toBeInTheDocument();

    // Click Refresh -> calls API with forceRefresh: true
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    await waitFor(() => {
      expect(mockFetchSystemStatus).toHaveBeenCalledWith({ forceRefresh: true });
    });
  });

  it('displays an actionable error state with retry when the status API fails', async () => {
    mockFetchSystemStatus.mockRejectedValueOnce(new Error('Monitoring Viewer role missing'));

    render(
      <MemoryRouter>
        <StatusPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Monitoring Viewer role missing');
    });

    mockFetchSystemStatus.mockResolvedValueOnce(sampleStatus);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => {
      expect(screen.getByText('All Systems Operational')).toBeInTheDocument();
    });
  });
});
