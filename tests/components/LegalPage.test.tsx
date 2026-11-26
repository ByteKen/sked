import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LegalPage } from '@/pages/LegalPage';

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({
      isAuthenticated: false,
    }),
}));

describe('LegalPage Terms of Use & Privacy Policy', () => {
  it('covers Telegram alerts, limitation of liability, and GitHub contact in Terms of Use without exposing an email', () => {
    render(
      <MemoryRouter initialEntries={['/terms']}>
        <LegalPage section="terms" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /5\. telegram bot & alerts/i })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /8\. disclaimer & limitation of liability/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /github issues/i })).toHaveAttribute(
      'href',
      'https://github.com/ByteKen/ganttapp/issues',
    );
    expect(screen.queryByRole('link', { name: /@/i })).not.toBeInTheDocument();
  });

  it('covers Telegram data, third-party services, and Settings -> Profile account deletion in Privacy Policy', () => {
    render(
      <MemoryRouter initialEntries={['/privacy']}>
        <LegalPage section="privacy" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /3\. third-party services/i })).toBeInTheDocument();
    expect(screen.getByText(/telegram bot api:/i)).toBeInTheDocument();
    expect(screen.getByText(/vercel:/i)).toBeInTheDocument();
    expect(screen.getByText(/settings -> profile \(delete account\)/i)).toBeInTheDocument();
    expect(screen.getByText(/bottom import \/ export menu/i)).toBeInTheDocument();
  });
});
