import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, GithubLogo, Scales, ShieldCheck } from '@phosphor-icons/react';
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

interface LegalListItem {
  label: string;
  detail: string;
}

interface LegalSection {
  id: string;
  title: string;
  paragraphs?: string[];
  bullets?: LegalListItem[];
}

const GITHUB_REPO_URL = 'https://github.com/ByteKen/sked';
const GITHUB_ISSUES_URL = 'https://github.com/ByteKen/sked/issues';

const TERMS_SECTIONS: LegalSection[] = [
  {
    id: 'acceptance',
    title: '1. Acceptance of Terms',
    paragraphs: [
      'By opening or using Sked, you agree to these Terms of Use. If you do not agree, stop using the app.',
      'Sked works with any valid Google account without domain restrictions. You must be at least 13 years old (or the minimum age required to hold a Google account in your country) to use the service.',
    ],
  },
  {
    id: 'service',
    title: '2. What Sked Provides',
    paragraphs: [
      'Sked is a free browser app for planning project timelines, nested subtasks, and milestone dependencies. It includes cloud sync across workspaces, multi-page PDF, PNG, Excel, CSV, and JSON exports, optional public read-only share links, and an optional Telegram bot with deadline alerts.',
    ],
  },
  {
    id: 'ownership',
    title: '3. Your Workspaces & Content',
    paragraphs: [
      'You keep full ownership of every workspace, task, note, and exported file you create in Sked.',
      'You grant us only the limited technical permission needed to store, sync, render, and (when you turn sharing on) display your schedules to people who have the link.',
    ],
  },
  {
    id: 'sharing',
    title: '4. Public Share Links',
    paragraphs: [
      'When you turn on a public read-only link for a workspace, anyone with that URL can view live updates to that chart, see the display name set in your Profile settings ("Shared by"), and copy the schedule into their own workspace.',
      'Do not turn sharing on for confidential or sensitive schedules. You can turn off or regenerate a share link at any time, which disables the old URL right away.',
    ],
  },
  {
    id: 'telegram-alerts',
    title: '5. Telegram Bot & Alerts',
    paragraphs: [
      'Linking a Telegram account is optional. Once connected, you can browse workspaces, mark tasks done, update task progress (which syncs live to your workspace and active share links), and receive scheduled deadline alerts.',
      'Automated reminders depend on Telegram servers and scheduled background jobs, so delivery timing is not guaranteed and should not be your only backup for critical deadlines. You can pause scheduled alerts with /pause, resume with /resume, unlink with /stop in Telegram, or disconnect anytime from Settings -> Bot & Alerts.',
    ],
  },
  {
    id: 'acceptable-use',
    title: '6. Acceptable Use',
    paragraphs: [
      'You agree not to disrupt, scrape, overload, or try to access other people’s workspaces, API endpoints, or cloud storage without permission. You also agree not to share illegal, harmful, or abusive content through public links.',
      'We may disable abusive public links or suspend accounts that break these rules or put the service at risk.',
    ],
  },
  {
    id: 'intellectual-property',
    title: '7. Intellectual Property',
    paragraphs: [
      'Your project schedules belong to you. The Sked source code, interface design, name, and mascot artwork remain the property of the project maintainer, subject to the repository license.',
    ],
  },
  {
    id: 'liability',
    title: '8. Disclaimer & Limitation of Liability',
    paragraphs: [
      'Sked is a free tool provided "as is" and "as available," without warranties of any kind. We do not guarantee uninterrupted uptime, error-free syncing, or on-time Telegram notifications.',
      'To the maximum extent allowed by law, the maintainer is not liable for missed project deadlines, lost schedules, service outages, or indirect or consequential damages resulting from your use of Sked. Export JSON backups regularly if you need offline archives.',
    ],
  },
  {
    id: 'changes-contact',
    title: '9. Changes & Contact',
    paragraphs: [
      'We may update these terms as the app evolves, and the date at the top reflects the latest revision. Continuing to use Sked after an update means you accept the updated terms.',
      'To report an abusive public link or ask a question about these terms, open an issue on the Sked GitHub repository linked below.',
    ],
  },
];

const PRIVACY_SECTIONS: LegalSection[] = [
  {
    id: 'data-collected',
    title: '1. Information We Store',
    paragraphs: ['We store only the information required to run the features you use:'],
    bullets: [
      {
        label: 'Google account info',
        detail:
          'Your Firebase user ID, email address, and default Google display name, used to sign you in and separate your private workspaces from other accounts.',
      },
      {
        label: 'Custom profile name',
        detail:
          'If you set a custom display name in Settings -> Profile, we save it and show it as "Shared by <Name>" on any public share links you enable.',
      },
      {
        label: 'Workspace data',
        detail:
          'Your workspace titles, tasks, subtasks, descriptions, dates, progress, dependencies, and display or export preferences.',
      },
      {
        label: 'Optional Telegram link',
        detail:
          'Only when you connect Telegram Bot & Alerts, we store your Telegram chat ID, username or first name, timezone, reminder schedule, and recent reminder timestamps so the bot does not send duplicate pings.',
      },
    ],
  },
  {
    id: 'how-used',
    title: '2. How We Use Your Data',
    paragraphs: [
      'We use your data only to authenticate your account, sync workspaces across your devices, serve public links you turn on, and power the Telegram bot and reminders you opt into.',
      'We do not run ads, embed third-party analytics trackers, or sell your personal information or project data.',
    ],
  },
  {
    id: 'third-party-services',
    title: '3. Third-Party Services',
    paragraphs: ['Sked relies on a small set of external services to operate:'],
    bullets: [
      {
        label: 'Google Firebase (Auth & Cloud Firestore)',
        detail: 'Handles Google sign-in and stores your private workspaces and settings.',
      },
      {
        label: 'Vercel',
        detail:
          'Hosts the web app and runs the server endpoints that link Telegram and dispatch reminders.',
      },
      {
        label: 'Telegram Bot API',
        detail:
          'Used only if you connect Telegram. Workspace names, task titles, progress, and due dates are exchanged through Telegram when you use bot commands or receive deadline reminders.',
      },
      {
        label: 'Google Fonts',
        detail: 'Delivers interface fonts when your browser loads the app.',
      },
    ],
  },
  {
    id: 'security',
    title: '4. Storage & Security',
    paragraphs: [
      'Private workspaces live in Cloud Firestore behind owner-only security rules, so no other signed-in user can read or change your private documents.',
      'Server-side Telegram subscription records and short-lived linking tokens are blocked from all direct browser access and handled only by the server.',
    ],
  },
  {
    id: 'public-shares',
    title: '5. Public Share Links',
    paragraphs: [
      'Every workspace is private by default. A separate read-only snapshot is created only when you explicitly turn on Public Read-Only Link in the Share modal.',
      'Share links use random unguessable IDs, and directory listing is blocked. Turning sharing off or deleting the workspace deletes the public copy immediately.',
    ],
  },
  {
    id: 'browser-storage',
    title: '6. Browser Storage & Cookies',
    paragraphs: [
      'Sked saves your light/dark theme and sidebar width in browser local storage so the interface loads cleanly without flashing. Firebase Authentication also uses browser storage to keep your login session active.',
      'We do not place advertising cookies or cross-site tracking pixels.',
    ],
  },
  {
    id: 'deletion',
    title: '7. Exports, Retention & Deletion',
    paragraphs: [
      'Your data stays stored while your account remains active. You can export any workspace to Excel, JSON, CSV, PNG, or PDF anytime from the bottom Import / Export menu.',
      'Disconnecting Telegram deletes your chat link immediately. You can also permanently delete your entire account from Settings -> Profile (Delete Account). After a quick Google re-verification prompt, this erases your workspaces, active share links, Telegram subscription, preferences, and Firebase login record.',
    ],
  },
  {
    id: 'children-contact',
    title: '8. Children’s Privacy, Updates & Contact',
    paragraphs: [
      'Sked is not directed at children under 13 (or the minimum age required for a Google account in your country).',
      'When we update this policy, we update the date at the top of this page. For privacy questions or data requests, reach out through the Sked GitHub repository linked below.',
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
              SKED
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
      <main className="relative z-10 flex-1 max-w-5xl w-full mx-auto px-5 sm:px-8 py-12 sm:py-16">
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

          {/* Document Body + Compact Desktop Section Index */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_220px] gap-8 items-start">
            <motion.div
              variants={FADE_UP_ITEM}
              className="rounded-2xl border border-slate-200/90 dark:border-white/[0.09] bg-white/90 dark:bg-surface-dark/90 shadow-surface-md dark:shadow-dark-md p-6 sm:p-10 space-y-8"
            >
              {items.map((item) => (
                <section key={item.id} id={item.id} className="scroll-mt-24 space-y-3">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                    {item.title}
                  </h2>

                  {item.paragraphs?.map((paragraph, idx) => (
                    <p
                      key={idx}
                      className="text-sm sm:text-[15px] leading-relaxed text-slate-600 dark:text-slate-300"
                    >
                      {paragraph}
                    </p>
                  ))}

                  {item.bullets && (
                    <ul className="space-y-2.5 pt-1">
                      {item.bullets.map((bullet) => (
                        <li
                          key={bullet.label}
                          className="text-sm sm:text-[15px] leading-relaxed text-slate-600 dark:text-slate-300 pl-4 relative before:content-[''] before:absolute before:left-0 before:top-[0.62em] before:w-1.5 before:h-1.5 before:rounded-full before:bg-brand-500/75"
                        >
                          <span className="font-semibold text-slate-800 dark:text-slate-100">
                            {bullet.label}:
                          </span>{' '}
                          {bullet.detail}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}

              {/* Repository Contact Bar (No Personal Email Exposed) */}
              <div className="pt-6 border-t border-slate-200/80 dark:border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Questions or reports?
                  </p>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                    Reach the maintainer directly on GitHub.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <a
                    href={GITHUB_ISSUES_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-xs font-semibold border border-slate-200/90 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] text-slate-700 dark:text-slate-200 hover:border-brand-300 hover:text-brand-600 dark:hover:border-brand-400/35 dark:hover:text-brand-400 transition-colors"
                  >
                    <GithubLogo weight="duotone" className="w-4 h-4" />
                    <span>GitHub Issues</span>
                    <ArrowUpRight weight="bold" className="w-3.5 h-3.5 opacity-70" />
                  </a>
                  <a
                    href={GITHUB_REPO_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
                  >
                    <span>View Repository</span>
                    <ArrowUpRight weight="bold" className="w-3.5 h-3.5 opacity-70" />
                  </a>
                </div>
              </div>
            </motion.div>

            {/* Sticky Section Index on Desktop */}
            <motion.aside
              variants={FADE_UP_ITEM}
              aria-label="On this page"
              className="hidden lg:block sticky top-24 rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white/75 dark:bg-surface-dark/75 backdrop-blur-sm p-4"
            >
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500 mb-3">
                On this page
              </p>
              <nav className="space-y-1.5">
                {items.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className="block text-xs leading-snug text-slate-600 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400 py-1 transition-colors"
                  >
                    {item.title}
                  </a>
                ))}
              </nav>
            </motion.aside>
          </div>
        </motion.div>
      </main>

      <AppFooter />
    </div>
  );
}
