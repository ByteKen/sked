import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  CircleNotch,
  CloudCheck,
  FilePdf,
  GlobeHemisphereWest,
  Info,
  ShareNetwork,
  SignIn,
  Stack,
  WarningCircle,
} from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { AppFooter } from '@/components/layout/AppFooter';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/utils/cn';
import { FADE_UP_ITEM, SPRING_SNAPPY, STAGGER_CONTAINER, STUDIO_EASE } from '@/utils/motion';

const PREVIEW_LANES = [
  { name: 'Discovery & Spec', left: '4%', width: '36%', tone: 'bg-emerald-500/90', tag: '100%' },
  { name: 'System Design', left: '22%', width: '40%', tone: 'bg-brand-500', tag: '78%' },
  { name: 'Engineering Sprint', left: '44%', width: '42%', tone: 'bg-brand-400', tag: '45%' },
  { name: 'Public Release', left: '78%', width: '16%', tone: 'bg-amber-500/90', tag: 'Target' },
];

const CAPABILITIES = [
  { icon: Stack, label: 'Multi-Workspace Sync' },
  { icon: ShareNetwork, label: 'Live Shareable Links' },
  { icon: FilePdf, label: 'PDF · PNG · CSV · JSON' },
  { icon: CalendarCheck, label: 'Subtasks & Dependencies' },
];

const TRUST_HIGHLIGHTS = [
  { icon: GlobeHemisphereWest, text: 'Open to any Google account — zero domain restrictions' },
  { icon: CloudCheck, text: 'Automatic real-time cloud sync across your devices' },
  { icon: ShareNetwork, text: 'Share live read-only links with one-click duplication' },
];

export function LandingPage() {
  const { login, error, cancelled, loading, clearError } = useAuthStore();
  const [mobileSignInOnly, setMobileSignInOnly] = useState(false);

  const handleGoogleSignIn = async () => {
    clearError();
    try {
      await login();
    } catch {
      // Handled via authStore error state
    }
  };

  const handleToggleMobileSignIn = () => {
    setMobileSignInOnly((prev) => {
      const next = !prev;
      if (next && typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return next;
    });
  };

  return (
    <div className="relative min-h-screen flex flex-col studio-atmosphere text-slate-900 dark:text-slate-50 overflow-x-hidden">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 studio-grain" />

      {/* Substantial Studio Top Bar (Single Brand Logo Above the Fold) */}
      <header className="relative z-20 border-b border-slate-200/75 dark:border-white/[0.07] bg-white/75 dark:bg-[#090B10]/75 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 sm:h-[72px] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setMobileSignInOnly(false)}
            className={cn(
              'flex items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-xl',
              mobileSignInOnly ? 'cursor-pointer' : 'cursor-default',
            )}
          >
            <BrandLogo size="md" />
            <span className="font-mono text-sm sm:text-[15px] font-bold uppercase tracking-[0.22em] text-slate-900 dark:text-slate-100">
              GANTT
            </span>
          </button>

          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden lg:inline-flex items-center gap-2 text-xs sm:text-[13px] font-medium text-slate-500 dark:text-slate-400">
              <GlobeHemisphereWest className="w-[18px] h-[18px] text-brand-500" weight="duotone" />
              Open to everyone
            </span>

            {/* Mobile/Tablet Focused Sign-In Toggle */}
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              transition={SPRING_SNAPPY}
              onClick={handleToggleMobileSignIn}
              aria-pressed={mobileSignInOnly}
              className={cn(
                'lg:hidden inline-flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-xl text-xs font-semibold transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                mobileSignInOnly
                  ? 'border border-slate-200/90 bg-white text-slate-700 hover:bg-slate-50 shadow-surface-sm dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.09]'
                  : 'bg-brand-600 hover:bg-brand-500 dark:bg-brand-500 dark:hover:bg-brand-400 text-white shadow-brand-glow-sm',
              )}
            >
              {mobileSignInOnly ? (
                <>
                  <ArrowLeft className="w-3.5 h-3.5" weight="bold" />
                  <span>Back</span>
                </>
              ) : (
                <>
                  <SignIn className="w-4 h-4" weight="bold" />
                  <span>Sign in</span>
                </>
              )}
            </motion.button>

            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Split-Screen Editorial Landing Hero with Vertical Divider */}
      <main className="relative z-10 flex-1 flex items-center">
        <div
          className={cn(
            'max-w-7xl mx-auto w-full px-5 sm:px-8 lg:py-16',
            mobileSignInOnly ? 'py-8' : 'py-12',
          )}
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 items-center gap-10 lg:gap-0">
            {/* Left Side: Editorial Headline + Capabilities + Live Animated Gantt Preview */}
            <motion.div
              data-testid="landing-overview-panel"
              variants={STAGGER_CONTAINER}
              initial="hidden"
              animate="visible"
              className={cn(
                'lg:col-span-7 lg:pr-12 xl:pr-16',
                mobileSignInOnly && 'hidden lg:block',
              )}
            >
              <motion.div variants={FADE_UP_ITEM} className="mb-4 inline-flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">
                  Project Timeline Studio
                </span>
              </motion.div>

              <motion.h1
                variants={FADE_UP_ITEM}
                className="text-4xl sm:text-5xl xl:text-[54px] font-bold tracking-[-0.03em] leading-[1.06] text-slate-900 dark:text-white"
              >
                The modern studio for
                <span className="block font-serif-editorial italic font-normal text-[44px] sm:text-[58px] xl:text-[64px] leading-[1.04] tracking-normal text-brand-600 dark:text-brand-400 mt-1">
                  project timelines &amp; schedules
                </span>
              </motion.h1>

              <motion.p
                variants={FADE_UP_ITEM}
                className="mt-5 text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-xl leading-relaxed"
              >
                Build nested Gantt roadmaps, track milestone dependencies, export crisp PDF or PNG
                charts, and share live read-only links with anyone — right from your browser.
              </motion.p>

              {/* Cohesive Capabilities Row */}
              <motion.div
                variants={FADE_UP_ITEM}
                className="mt-7 grid grid-cols-2 gap-x-6 gap-y-3 max-w-lg text-xs sm:text-[13px] text-slate-700 dark:text-slate-300"
              >
                {CAPABILITIES.map((cap) => {
                  const Icon = cap.icon;
                  return (
                    <span key={cap.label} className="inline-flex items-center gap-2 font-medium">
                      <Icon className="w-4 h-4 text-brand-600 dark:text-brand-400 shrink-0" weight="duotone" />
                      {cap.label}
                    </span>
                  );
                })}
              </motion.div>

              {/* Animated Studio Gantt Preview Frame */}
              <motion.div
                variants={FADE_UP_ITEM}
                className="mt-9 rounded-2xl border border-slate-200/90 dark:border-white/[0.09] bg-white/90 dark:bg-surface-dark/90 shadow-surface-lg dark:shadow-dark-lg p-4 sm:p-5 text-left"
              >
                <div className="flex items-center justify-between pb-3 mb-3.5 border-b border-slate-200/80 dark:border-white/[0.07]">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-white/15" />
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-white/15" />
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-white/15" />
                    <span className="ml-2 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      q2-product-roadmap
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-mono text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/25">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    LIVE · SHARED
                  </span>
                </div>

                <div className="space-y-2.5">
                  {PREVIEW_LANES.map((lane, index) => (
                    <div key={lane.name} className="grid grid-cols-12 items-center gap-3">
                      <span className="col-span-4 text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                        {lane.name}
                      </span>
                      <div className="col-span-8 relative h-7 rounded-lg bg-slate-100/80 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/[0.05] overflow-hidden">
                        <motion.div
                          initial={{ scaleX: 0, opacity: 0 }}
                          animate={{ scaleX: 1, opacity: 1 }}
                          transition={{
                            duration: 0.55,
                            delay: 0.25 + index * 0.09,
                            ease: STUDIO_EASE,
                          }}
                          style={{
                            left: lane.left,
                            width: lane.width,
                            transformOrigin: 'left center',
                          }}
                          className={`absolute top-1 bottom-1 rounded-md ${lane.tone} gantt-bar-polished flex items-center justify-end px-2`}
                        >
                          <span className="font-mono text-[10px] font-semibold text-white">
                            {lane.tag}
                          </span>
                        </motion.div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </motion.div>

            {/* Vertical Divider + Right Side Google Sign-In Panel */}
            <motion.div
              data-testid="landing-signin-panel"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.12, ease: STUDIO_EASE }}
              className={cn(
                'lg:col-span-5 lg:pt-0 lg:border-t-0 lg:pl-12 xl:pl-16 lg:border-l lg:border-slate-200/85 dark:lg:border-white/[0.08]',
                mobileSignInOnly
                  ? 'pt-0 border-t-0'
                  : 'pt-10 border-t border-slate-200/80 dark:border-white/[0.08]',
              )}
            >
              <div className="w-full max-w-md mx-auto rounded-2xl border border-slate-200/90 dark:border-white/[0.1] bg-white/95 dark:bg-surface-dark/95 backdrop-blur-md shadow-surface-lg dark:shadow-dark-lg p-7 sm:p-9">
                <div className="inline-flex items-center gap-2 mb-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">
                    Workspace Access
                  </span>
                </div>

                <h2 className="text-2xl sm:text-[28px] font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
                  Sign in to your{' '}
                  <span className="font-serif-editorial italic font-normal text-[30px] sm:text-[34px] text-brand-600 dark:text-brand-400">
                    workspace
                  </span>
                </h2>
                <p className="mt-2.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Continue with Google to open your synced timelines or start a brand new Gantt
                  project in seconds.
                </p>

                {/* Status Feedback */}
                {cancelled && !error && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-5 flex items-start gap-2.5 p-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04]"
                  >
                    <Info className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" weight="duotone" />
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Sign-in cancelled. Click below whenever you&apos;re ready to continue.
                    </p>
                  </motion.div>
                )}

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    role="alert"
                    className="mt-5 flex items-start gap-2.5 p-3.5 rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10"
                  >
                    <WarningCircle
                      className="w-4 h-4 text-rose-500 shrink-0 mt-0.5"
                      weight="duotone"
                    />
                    <p className="text-xs font-medium text-rose-700 dark:text-rose-200">{error}</p>
                  </motion.div>
                )}

                {/* Primary Google Sign-In CTA */}
                <div className="mt-7">
                  <motion.button
                    type="button"
                    whileHover={{ y: -1, scale: 1.01 }}
                    whileTap={{ scale: 0.985 }}
                    transition={SPRING_SNAPPY}
                    onClick={() => void handleGoogleSignIn()}
                    disabled={loading}
                    className="w-full inline-flex items-center justify-center gap-3 h-12 px-6 rounded-xl bg-brand-600 hover:bg-brand-500 dark:bg-brand-500 dark:hover:bg-brand-400 text-white text-sm font-semibold shadow-brand-glow transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-surface-dark"
                  >
                    {loading ? (
                      <>
                        <CircleNotch className="w-4 h-4 animate-spin" weight="bold" />
                        <span>Signing in...</span>
                      </>
                    ) : (
                      <>
                        <span className="w-5 h-5 rounded-full bg-white flex items-center justify-center shrink-0">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" aria-hidden="true">
                            <path
                              fill="#4285F4"
                              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                            />
                            <path
                              fill="#34A853"
                              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            />
                            <path
                              fill="#FBBC05"
                              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                            />
                            <path
                              fill="#EA4335"
                              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                            />
                          </svg>
                        </span>
                        <span>Continue with Google</span>
                        <ArrowRight className="w-4 h-4 opacity-80" weight="bold" />
                      </>
                    )}
                  </motion.button>
                </div>

                {/* Subtle Divider + Trust Highlights */}
                <div className="my-6 flex items-center gap-3">
                  <span className="flex-1 h-px bg-slate-200/80 dark:bg-white/[0.08]" />
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                    Included Free
                  </span>
                  <span className="flex-1 h-px bg-slate-200/80 dark:bg-white/[0.08]" />
                </div>

                <ul className="space-y-3">
                  {TRUST_HIGHLIGHTS.map((item) => {
                    const Icon = item.icon;
                    return (
                      <li
                        key={item.text}
                        className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300"
                      >
                        <Icon
                          weight="duotone"
                          className="w-4 h-4 text-brand-600 dark:text-brand-400 shrink-0 mt-0.5"
                        />
                        <span>{item.text}</span>
                      </li>
                    );
                  })}
                </ul>

                <p className="mt-6 pt-5 border-t border-slate-200/75 dark:border-white/[0.07] text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  By signing in, you agree to our{' '}
                  <Link
                    to="/terms"
                    className="font-medium text-brand-600 hover:underline dark:text-brand-400"
                  >
                    Terms of Use
                  </Link>{' '}
                  and{' '}
                  <Link
                    to="/privacy"
                    className="font-medium text-brand-600 hover:underline dark:text-brand-400"
                  >
                    Privacy Policy
                  </Link>
                  .
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </main>

      <div data-testid="landing-footer-wrap" className={cn(mobileSignInOnly && 'hidden lg:block')}>
        <AppFooter />
      </div>
    </div>
  );
}
