import { Link } from 'react-router-dom';
import { GithubLogo } from '@phosphor-icons/react';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/utils/cn';

const GITHUB_REPO_URL = 'https://github.com/ByteKen/sked';

export interface AppFooterProps {
  compact?: boolean;
  className?: string;
}

export function AppFooter({ compact = false, className }: AppFooterProps) {
  const year = new Date().getFullYear();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (compact) {
    return (
      <footer
        className={cn(
          'shrink-0 border-t border-slate-200/80 dark:border-white/[0.08] bg-white/80 dark:bg-[#090B10]/90 backdrop-blur-sm',
          className,
        )}
      >
        <div className="px-4 sm:px-6 h-11 flex items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <nav aria-label="Legal links" className="flex items-center gap-5">
            <Link
              to="/terms"
              className="hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Terms of Use
            </Link>
            <Link
              to="/privacy"
              className="hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Privacy Policy
            </Link>
            {isAuthenticated && (
              <Link
                to="/status"
                className="inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Status</span>
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-3.5">
            <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
              © {year} Sked
            </span>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Sked GitHub repository"
              title="View Sked on GitHub"
              className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-slate-500 hover:text-brand-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-brand-400 dark:hover:bg-white/[0.08] transition-colors"
            >
              <GithubLogo weight="duotone" className="w-4 h-4" />
            </a>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer
      className={cn(
        'relative z-10 border-t border-slate-200/80 dark:border-white/[0.08] bg-white/75 dark:bg-[#090B10]/90 backdrop-blur-md',
        className,
      )}
    >
      <div className="max-w-7xl mx-auto px-5 sm:px-8 pt-12 pb-8">
        {/* Upper Editorial Brand Block (Kroma-inspired) */}
        <div className="pb-10 flex flex-col sm:flex-row sm:items-end justify-between gap-8">
          <div className="max-w-md space-y-3.5">
            <div className="flex items-center gap-3">
              <BrandLogo size="sm" />
              <span className="font-mono text-base font-bold uppercase tracking-[0.22em] text-slate-900 dark:text-white">
                SKED
              </span>
              <span className="font-mono text-xs font-medium text-brand-600 dark:text-brand-400">
                v2.0
              </span>
            </div>

            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              An open-source project workspace for Gantt timelines, Kanban boards, task lists,
              real-time collaboration, high-resolution exports, and Telegram alerts.
            </p>
          </div>

          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Sked GitHub repository"
            title="View Sked source code on GitHub"
            className="inline-flex items-center justify-center self-start sm:self-end h-10 w-10 rounded-xl border border-slate-200/90 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] text-slate-600 hover:text-brand-600 hover:border-brand-300 dark:text-slate-300 dark:hover:text-brand-400 dark:hover:border-brand-400/35 dark:hover:bg-white/[0.08] shadow-surface-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <GithubLogo weight="duotone" className="w-5 h-5" />
          </a>
        </div>

        {/* Bottom Hairline & Legal Bar */}
        <div className="pt-6 border-t border-slate-200/80 dark:border-white/[0.08] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <nav
            aria-label="Footer legal links"
            className="flex flex-wrap items-center gap-6 text-xs sm:text-[13px] font-medium text-slate-500 dark:text-slate-400"
          >
            <Link
              to="/terms"
              className="hover:text-slate-900 dark:hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
            >
              Terms of Use
            </Link>
            <Link
              to="/privacy"
              className="hover:text-slate-900 dark:hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
            >
              Privacy Policy
            </Link>
            {isAuthenticated && (
              <Link
                to="/status"
                className="inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
              >
                <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>System Status</span>
              </Link>
            )}
          </nav>

          <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
            © {year} Sked · Open-Source Project Workspace
          </p>
        </div>
      </div>
    </footer>
  );
}
