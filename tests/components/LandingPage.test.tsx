import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LandingPage } from '@/pages/LandingPage';
import { DEFAULT_PREFERENCES } from '@/types';

vi.mock('@/store/authStore', () => ({
  useAuthStore: () => ({
    login: vi.fn().mockResolvedValue(undefined),
    error: null,
    cancelled: false,
    loading: false,
    clearError: vi.fn(),
  }),
}));

describe('LandingPage mobile sign-in toggle & default theme', () => {
  beforeEach(() => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  it('uses light as the default application theme', () => {
    expect(DEFAULT_PREFERENCES.theme).toBe('light');
  });

  it('highlights the interactive Telegram bot and alerts on the landing page', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    expect(screen.getAllByText(/^telegram bot & alerts$/i).length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByText(/interactive telegram bot to browse tasks, mark done, and get deadline alerts/i),
    ).toBeInTheDocument();
  });

  it('hides the sign-in card on mobile until topbar Sign in is clicked, then swaps back cleanly on Back', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    const signInToggle = screen.getByRole('button', { name: /^sign in$/i });
    const overviewPanel = screen.getByTestId('landing-overview-panel');
    const signInPanel = screen.getByTestId('landing-signin-panel');
    const footerWrap = screen.getByTestId('landing-footer-wrap');

    // Default mobile state: editorial overview + footer shown, sign-in card hidden below lg
    expect(overviewPanel.className).not.toContain('hidden');
    expect(footerWrap.className).not.toContain('hidden');
    expect(signInPanel.className).toContain('hidden lg:block');

    // Click topbar Sign in -> hides overview & footer on mobile, reveals sign-in card
    fireEvent.click(signInToggle);

    expect(overviewPanel.className).toContain('hidden lg:block');
    expect(footerWrap.className).toContain('hidden lg:block');
    expect(signInPanel.className).not.toContain('hidden');
    expect(screen.getByText(/sign in to your/i)).toBeInTheDocument();

    // Click Back -> restores overview & footer, hides sign-in card again on mobile
    const backButton = screen.getByRole('button', { name: /^back$/i });
    fireEvent.click(backButton);

    expect(overviewPanel.className).not.toContain('hidden');
    expect(footerWrap.className).not.toContain('hidden');
    expect(signInPanel.className).toContain('hidden lg:block');
  });
});
