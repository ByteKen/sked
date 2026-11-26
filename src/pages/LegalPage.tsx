import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Scales, ShieldCheck } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { AppFooter } from '@/components/layout/AppFooter';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/utils/cn';
import { FADE_UP_ITEM, SPRING_SNAPPY, STAGGER_CONTAINER } from '@/utils/motion';

export interface LegalPageProps {
  section: 'terms' | 'privacy';
}

interface LegalSection {
  title: string;
  body: string[];
}

const TERMS_SECTIONS: LegalSection[] = [
  {
    title: '1. Acceptance of Terms',
    body: [
      'By accessing or using Gantt, you agree to be bound by these Terms of Use. If you do not agree with these terms, please discontinue use of the service.',
      'Gantt is open to individuals and teams using any valid Google account, without organizational or domain restrictions.',
    ],
  },
  {
    title: '2. Your Workspaces & Content Ownership',
    body: [
      'You retain full ownership of all workspaces, project schedules, tasks, milestones, and exported files you create inside Gantt.',
      'You grant us only the limited technical permission required to store, sync, render, and—when you explicitly enable a public link—display your schedules to recipients who hold that link.',
    ],
  },
  {
    title: '3. Public Shareable Links',
    body: [
      'When you enable a public read-only link on a workspace, anyone with the unique URL can view live updates to that schedule and optionally duplicate a copy into their own workspace.',
      'You are responsible for ensuring that shared schedules do not include confidential or sensitive data you do not intend to share. You may disable or regenerate a share link at any time, immediately invalidating the previous URL.',
    ],
  },
  {
    title: '4. Acceptable Use',
    body: [
      'You agree not to abuse, disrupt, reverse-engineer, or attempt unauthorized access to other users’ workspaces, cloud storage, or infrastructure.',
      'We reserve the right to suspend accounts or revoke public share links that violate applicable laws or endanger platform stability.',
    ],
  },
  {
    title: '5. Availability & Disclaimer',
    body: [
      'Gantt is provided on an "as is" and "as available" basis without warranties of any kind. You can export JSON, CSV, PNG, or PDF backups of your timelines at any time for local archiving.',
    ],
  },
];

const PRIVACY_SECTIONS: LegalSection[] = [
  {
    title: '1. Information We Collect',
    body: [
      'Account Profile: When you sign in with Google, we receive your basic profile identifiers (user ID, display name, and email address) solely to authenticate you and isolate your private workspaces.',
      'Workspace Data: We store the workspaces, task hierarchies, dates, progress, dependencies, and display preferences you create so they stay synced across your devices.',
    ],
  },
  {
    title: '2. How Your Data Is Stored & Protected',
    body: [
      'Your private workspace documents are stored in Google Firebase Cloud Firestore with owner-only security rules—no other user can read or modify your private workspaces.',
      'Theme preferences are also cached locally in your browser storage to prevent flash-of-unstyled-theme on page load.',
    ],
  },
  {
    title: '3. Public Share Links & Visibility',
    body: [
      'By default, every workspace is strictly private. A separate public read-only snapshot is created only when you explicitly turn on Public Read-Only Link in the Share modal.',
      'Public share links use unguessable randomly generated identifiers and block directory listing. Turning sharing off or deleting the workspace permanently removes the public share document.',
    ],
  },
  {
    title: '4. Data Portability & Account Deletion',
    body: [
      'You can export any workspace to JSON, CSV, PNG, or PDF directly from the workspace header at any time.',
      'Deleting tasks or workspaces removes them from Firestore immediately. You can also permanently delete your entire account—along with all workspaces, tasks, synced preferences, and active public share links—at any time from Settings → Delete Account. We never sell your personal information or project data to third parties.',
    ],
  },
];

export function LegalPage({ section }: LegalPageProps) {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isTerms = section === 'terms';
  const items = isTerms ? TERMS_SECTIONS : PRIVACY_SECTIONS;

  return (
    <div className="relative min-h-screen flex flex-col studio-atmosphere text-slate-900 dark:text-slate-50">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 studio-grain" />

      {/* Studio Top Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 dark:border-white/[0.08] bg-white/85 dark:bg-[#090B10]/85 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 sm:h-[72px] flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3 group">
            <BrandLogo size="md" className="group-hover:scale-[1.04] transition-transform" />
            <span className="font-mono text-sm sm:text-[15px] font-bold uppercase tracking-[0.2em] text-slate-900 dark:text-slate-100">
              GANTT
            </span>
          </Link>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl text-xs sm:text-sm font-semibold border border-slate-200/90 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              <ArrowLeft weight="bold" className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              <span>{isAuthenticated ? 'Back to Workspaces' : 'Back to Home'}</span>
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Legal Document */}
      <main className="relative z-10 flex-1 max-w-4xl w-full mx-auto px-5 sm:px-8 py-12 sm:py-16">
        <motion.div
          key={section}
          variants={STAGGER_CONTAINER}
          initial="hidden"
          animate="visible"
        >
          {/* Tab Switcher */}
          <motion.div variants={FADE_UP_ITEM} className="mb-8 flex justify-center sm:justify-start">
            <div className="inline-flex items-center p-1 rounded-xl bg-slate-200/65 dark:bg-white/[0.05] border border-slate-200/90 dark:border-white/[0.08]">
              {(
                [
                  { id: 'terms', to: '/terms', label: 'Terms of Use', icon: Scales },
                  { id: 'privacy', to: '/privacy', label: 'Privacy Policy', icon: ShieldCheck },
                ] as const
              ).map((tab) => {
                const active = section === tab.id;
                const Icon = tab.icon;
                return (
                  <Link
                    key={tab.id}
                    to={tab.to}
                    className={cn(
                      'relative inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors',
                      active
                        ? 'text-white'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="legal-tab-pill"
                        transition={SPRING_SNAPPY}
                        className="absolute inset-0 rounded-lg bg-brand-600 dark:bg-brand-500 shadow-brand-glow-sm"
                      />
                    )}
                    <span className="relative z-10 inline-flex items-center gap-2">
                      <Icon weight="duotone" className="w-4 h-4" />
                      {tab.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </motion.div>

          {/* Editorial Title */}
          <motion.div variants={FADE_UP_ITEM} className="mb-10">
            <h1 className="text-3xl sm:text-5xl font-bold tracking-[-0.03em] text-slate-900 dark:text-white leading-tight">
              {isTerms ? 'Terms of ' : 'Privacy '}
              <span className="font-serif-editorial italic font-normal text-[38px] sm:text-[56px] text-brand-600 dark:text-brand-400">
                {isTerms ? 'Use' : 'Policy'}
              </span>
            </h1>
            <p className="mt-3 font-mono text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              Last updated · November 2026
            </p>
          </motion.div>

          {/* Document Body */}
          <motion.div
            variants={FADE_UP_ITEM}
            className="rounded-2xl border border-slate-200/90 dark:border-white/[0.09] bg-white/90 dark:bg-surface-dark/90 shadow-surface-md dark:shadow-dark-md p-6 sm:p-10 space-y-8"
          >
            {items.map((item) => (
              <section key={item.title} className="space-y-2.5">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                  {item.title}
                </h2>
                {item.body.map((paragraph, idx) => (
                  <p
                    key={idx}
                    className="text-sm sm:text-[15px] leading-relaxed text-slate-600 dark:text-slate-300"
                  >
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}
          </motion.div>
        </motion.div>
      </main>

      <AppFooter />
    </div>
  );
}
