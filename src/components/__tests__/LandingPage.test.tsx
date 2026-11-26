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

  it('hides editorial overview and footer on mobile when clicking topbar Sign in and restores them on Back', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    const signInToggle = screen.getByRole('button', { name: /^sign in$/i });
    const overviewPanel = screen.getByTestId('landing-overview-panel');
    const signInPanel = screen.getByTestId('landing-signin-panel');
    const footerWrap = screen.getByTestId('landing-footer-wrap');

    expect(overviewPanel.className).not.toContain('hidden');
    expect(footerWrap.className).not.toContain('hidden');
    expect(signInPanel).toBeInTheDocument();

    fireEvent.click(signInToggle);

    expect(overviewPanel.className).toContain('hidden lg:block');
    expect(footerWrap.className).toContain('hidden lg:block');
    expect(screen.getByText(/sign in to your/i)).toBeInTheDocument();

    const backButton = screen.getByRole('button', { name: /^back$/i });
    fireEvent.click(backButton);

    expect(overviewPanel.className).not.toContain('hidden');
    expect(footerWrap.className).not.toContain('hidden');
  });
});
