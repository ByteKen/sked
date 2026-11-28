import { BrandLogo } from '@/components/ui/BrandLogo';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/utils/cn';

const WORKSPACE_CARD_BAR_PRESETS = [
  [
    { ml: '4%', w: '46%' },
    { ml: '24%', w: '54%' },
    { ml: '50%', w: '38%' },
  ],
  [
    { ml: '8%', w: '38%' },
    { ml: '18%', w: '62%' },
    { ml: '36%', w: '42%' },
  ],
  [
    { ml: '2%', w: '56%' },
    { ml: '30%', w: '44%' },
    { ml: '58%', w: '30%' },
  ],
];

const GANTT_SKELETON_ROWS: Array<{
  isParent: boolean;
  titleW: string;
  barLeft: string;
  barWidth: string;
  fillWidth?: string;
}> = [
  { isParent: true, titleW: 'w-36', barLeft: '4%', barWidth: '34%', fillWidth: '72%' },
  { isParent: false, titleW: 'w-28', barLeft: '4%', barWidth: '14%', fillWidth: '100%' },
  { isParent: false, titleW: 'w-32', barLeft: '16%', barWidth: '16%', fillWidth: '65%' },
  { isParent: false, titleW: 'w-24', barLeft: '30%', barWidth: '8%', fillWidth: '30%' },
  { isParent: true, titleW: 'w-40', barLeft: '24%', barWidth: '42%', fillWidth: '45%' },
  { isParent: false, titleW: 'w-32', barLeft: '24%', barWidth: '19%', fillWidth: '80%' },
  { isParent: false, titleW: 'w-28', barLeft: '41%', barWidth: '17%', fillWidth: '25%' },
  { isParent: false, titleW: 'w-24', barLeft: '55%', barWidth: '11%' },
  { isParent: true, titleW: 'w-36', barLeft: '54%', barWidth: '32%' },
  { isParent: false, titleW: 'w-32', barLeft: '54%', barWidth: '18%' },
  { isParent: false, titleW: 'w-28', barLeft: '70%', barWidth: '16%' },
];

const STATUS_TREND_BAR_HEIGHTS = ['26%', '44%', '34%', '52%', '40%', '68%', '84%'];

const CALENDAR_SKELETON_DAYS = Array.from({ length: 35 }, (_, idx) => idx);
const CALENDAR_SKELETON_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Full-page Home dashboard skeleton shown immediately on reload for returning signed-in
 * users while Firebase Auth restores the session (matches HomePage header, hero, tabs & grid 1:1).
 */
export function HomePageSkeleton({ tab = 'workspaces' }: { tab?: 'workspaces' | 'calendar' } = {}) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading dashboard"
      data-testid="home-page-skeleton"
      className="relative min-h-screen flex flex-col studio-atmosphere text-slate-900 dark:text-slate-50"
    >
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 studio-grain" />

      {/* Top Bar (exact h-16 sm:h-[72px] parity with HomePage) */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 dark:border-white/[0.08] bg-white/85 dark:bg-[#090B10]/85 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 sm:h-[72px] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BrandLogo size="md" />
            <span className="font-mono text-sm sm:text-[15px] font-bold uppercase tracking-[0.22em] text-slate-900 dark:text-slate-100">
              SKED
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <Skeleton className="h-10 w-10 sm:w-36 rounded-xl" />
            <Skeleton className="h-10 w-10 rounded-xl" />
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 w-full max-w-7xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
        <div className="mb-10 sm:mb-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <Skeleton className="h-7 w-72 rounded-full mb-5" />
              <Skeleton className="h-10 sm:h-14 w-64 sm:w-96 rounded-xl" />
              <div className="space-y-1.5 mt-2.5">
                <Skeleton className="h-4 w-72 sm:w-[440px] rounded" />
                <Skeleton className="h-4 w-52 sm:w-72 rounded" />
              </div>
            </div>

            {tab === 'workspaces' && <Skeleton className="h-11 w-40 rounded-xl shrink-0" />}
          </div>

          {/* Workspaces | Calendar Tab Bar Skeleton */}
          <div className="mt-7">
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-white/[0.05] border border-slate-200/90 dark:border-white/[0.08]">
              <Skeleton className="h-9 w-32 rounded-lg" />
              <Skeleton className="h-9 w-28 rounded-lg" />
            </div>
          </div>
        </div>

        {tab === 'calendar' ? <HomeCalendarSkeleton /> : <HomeWorkspacesSkeleton />}
      </main>
    </div>
  );
}

function HomeCalendarSkeleton() {
  return (
    <section aria-label="Loading calendar" className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-white/[0.07]">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-9 w-32 rounded-xl" />
          <Skeleton className="h-6 w-36 rounded-lg" />
        </div>
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-8 w-44 rounded-lg" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
        <div className="rounded-2xl border border-slate-200/90 dark:border-white/[0.09] bg-white dark:bg-surface-dark shadow-surface-sm overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-200/80 dark:border-white/[0.08] bg-slate-50/80 dark:bg-white/[0.02]">
            {CALENDAR_SKELETON_WEEKDAYS.map((day) => (
              <div
                key={day}
                className="py-2.5 text-center font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500"
              >
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 dark:divide-white/[0.06]">
            {CALENDAR_SKELETON_DAYS.map((idx) => (
              <div key={idx} className="min-h-[88px] sm:min-h-[104px] p-2 space-y-2">
                <Skeleton className="h-5 w-5 rounded-full" />
                {idx % 4 === 1 && <Skeleton className="h-3.5 w-4/5 rounded" />}
                {idx % 6 === 2 && <Skeleton className="h-3.5 w-3/5 rounded" />}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 dark:border-white/[0.09] bg-white dark:bg-surface-dark shadow-surface-sm p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-white/[0.06]">
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-20 rounded" />
              <Skeleton className="h-5 w-36 rounded" />
            </div>
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
          <CalendarAgendaSkeleton />
        </div>
      </div>
    </section>
  );
}

/**
 * Full-page Status skeleton shown while restoring auth on `/status` directly.
 */
export function StatusFullPageSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading system status"
      className="relative min-h-screen flex flex-col studio-atmosphere text-slate-900 dark:text-slate-50"
    >
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 studio-grain" />

      <header className="sticky top-0 z-30 border-b border-slate-200/80 dark:border-white/[0.08] bg-white/85 dark:bg-[#090B10]/85 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 h-16 sm:h-[72px] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BrandLogo size="md" />
            <span className="font-mono text-sm sm:text-[15px] font-bold uppercase tracking-[0.22em] text-slate-900 dark:text-slate-100">
              SKED
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-10 w-40 rounded-xl" />
            <Skeleton className="h-10 w-10 rounded-xl" />
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 max-w-5xl w-full mx-auto px-5 sm:px-8 py-10 sm:py-14 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5">
          <div className="space-y-3">
            <Skeleton className="h-6 w-40 rounded-full" />
            <Skeleton className="h-10 sm:h-12 w-56 sm:w-72 rounded-xl" />
            <Skeleton className="h-4 w-72 sm:w-96 rounded" />
          </div>
          <Skeleton className="h-10 w-28 rounded-xl shrink-0" />
        </div>

        <StatusPageSkeleton />
      </main>
    </div>
  );
}

/**
 * Pixel-accurate loading skeleton for HomePage's My Focus panel + Workspaces grid,
 * rendered beneath the live header, greeting, and tab bar so there is zero layout shift.
 */
export function HomeWorkspacesSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading workspaces" data-testid="home-workspaces-skeleton">
      {/* My Focus Panel Skeleton */}
      <section className="mb-10 rounded-2xl border border-slate-200/90 dark:border-white/[0.08] bg-white/95 dark:bg-surface-dark/95 shadow-surface-sm overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 dark:border-white/[0.06] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-3.5 w-20 rounded" />
            <Skeleton className="h-5 w-8 rounded-full" />
          </div>
          <Skeleton className="h-7 w-24 rounded-lg" />
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {/* 4 KPI summary cards matching FocusDashboardPanel */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-slate-50/70 dark:bg-white/[0.02] p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-20 rounded" />
                  <Skeleton className="h-4 w-4 rounded-full" />
                </div>
                <Skeleton className="h-6 w-10 rounded" />
              </div>
            ))}
          </div>

          {/* 3 focus task rows */}
          <div className="divide-y divide-slate-100 dark:divide-white/[0.06] rounded-xl border border-slate-200/75 dark:border-white/[0.06]">
            {[0, 1, 2].map((i) => (
              <div key={i} className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <Skeleton className="w-4 h-4 rounded-full shrink-0" />
                  <Skeleton className={cn('h-3.5 rounded', i === 1 ? 'w-52' : 'w-40')} />
                  <Skeleton className="hidden sm:block h-4 w-20 rounded-md shrink-0" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Workspaces Filter Toolbar Skeleton */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-5 pb-3 border-b border-slate-200/80 dark:border-white/[0.07]">
        <div className="flex items-center gap-3 flex-wrap">
          <Skeleton className="h-3.5 w-32 rounded" />
          <Skeleton className="h-8 w-64 rounded-lg" />
        </div>
        <Skeleton className="h-10 w-full lg:w-72 rounded-xl" />
      </div>

      {/* 3-Column WorkspaceCard Skeleton Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {[0, 1, 2, 3, 4, 5].map((cardIdx) => {
          const bars = WORKSPACE_CARD_BAR_PRESETS[cardIdx % WORKSPACE_CARD_BAR_PRESETS.length]!;
          return (
            <div
              key={cardIdx}
              className="rounded-2xl border border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-surface-dark flex flex-col overflow-hidden"
            >
              {/* Mini-Gantt Cover (exact h-24 parity with WorkspaceCard) */}
              <div className="relative h-24 px-4 py-3.5 bg-slate-50/90 dark:bg-white/[0.025] border-b border-slate-200/70 dark:border-white/[0.06]">
                <div className="space-y-2 pt-0.5">
                  {bars.map((bar, barIdx) => (
                    <div key={barIdx} style={{ marginLeft: bar.ml, width: bar.w }}>
                      <Skeleton className="h-3 w-full rounded-[5px]" />
                    </div>
                  ))}
                </div>
                <Skeleton className="absolute top-2.5 left-2.5 h-5 w-16 rounded-full" />
                <Skeleton className="absolute top-2.5 right-2.5 h-7 w-7 rounded-lg" />
              </div>

              {/* Card Body (exact p-4 parity with WorkspaceCard) */}
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Skeleton className={cn('h-4 rounded', cardIdx % 2 === 0 ? 'w-3/5' : 'w-2/3')} />
                    <Skeleton className="h-4 w-4 rounded shrink-0" />
                  </div>
                  <Skeleton className="h-3 w-28 rounded" />
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/[0.06] space-y-2">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-3 w-14 rounded" />
                    <Skeleton className="h-3 w-8 rounded" />
                  </div>
                  <Skeleton className="h-1.5 w-full rounded-full" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Compact skeleton for the Personal Agenda section inside CalendarView's right day panel.
 */
export function CalendarAgendaSkeleton() {
  return (
    <ul aria-busy="true" aria-label="Loading personal agenda" className="space-y-2">
      {[0, 1, 2].map((idx) => (
        <li
          key={idx}
          className="rounded-xl border border-slate-200/85 dark:border-white/[0.08] bg-slate-50/60 dark:bg-white/[0.025] p-3"
        >
          <div className="flex items-start gap-2.5">
            <Skeleton className="mt-0.5 w-5 h-5 rounded-full shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-1.5">
                <Skeleton className={cn('h-3.5 rounded', idx === 1 ? 'w-36' : 'w-28')} />
                <Skeleton className="h-4 w-14 rounded" />
              </div>
              <Skeleton className="h-4 w-32 rounded-md" />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Skeleton className="w-6 h-6 rounded-lg" />
              <Skeleton className="w-6 h-6 rounded-lg" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Reusable inner Gantt workspace frame skeleton (GanttToolbar + 300px TaskTreePane +
 * 50px sticky TimelineHeader + staggered Gantt bars). Used both inside WorkspacePageSkeleton
 * and inside WorkspacePage while switching workspaces (`tasksLoading`).
 */
export function GanttCanvasSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading timeline"
      className="flex-1 min-h-0 flex flex-col bg-white dark:bg-surface-dark border border-slate-300/80 dark:border-white/10 rounded-none md:rounded-2xl overflow-hidden shadow-surface-md dark:shadow-dark-md"
    >
      {/* GanttToolbar Strip */}
      <div className="shrink-0 border-b border-slate-200/90 dark:border-white/[0.08] bg-[#FAFBFD] dark:bg-surface-dark px-3 md:px-4 py-2 flex items-center justify-between gap-2 overflow-hidden">
        <div className="flex items-center gap-2 shrink-0">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-surface-elevated border border-slate-200/90 dark:border-white/[0.08]">
            <Skeleton className="h-3.5 w-14 rounded" />
            <Skeleton className="hidden sm:block h-1.5 w-14 rounded-full" />
            <Skeleton className="h-3.5 w-7 rounded" />
          </div>
          <Skeleton className="hidden xl:block h-8 w-40 rounded-lg" />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Skeleton className="h-8 w-36 sm:w-52 rounded-lg" />
          <Skeleton className="hidden sm:block h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-16 rounded-lg" />
          <Skeleton className="hidden lg:block h-8 w-20 rounded-lg" />
        </div>
      </div>

      {/* Unified Split Pane: 300px Task Tree + Timeline Canvas */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left TaskTreePane (exact w-[300px] desktop default) */}
        <div className="hidden md:flex flex-col w-[300px] shrink-0 bg-white dark:bg-surface-dark border-r border-slate-200/90 dark:border-white/[0.08]">
          {/* Header (exact h-[50px] parity with HEADER_HEIGHT) */}
          <div className="h-[50px] px-3.5 border-b border-slate-200/90 dark:border-white/[0.08] bg-[#F4F6FA] dark:bg-[#10131C] flex items-center justify-between shrink-0">
            <Skeleton className="h-3 w-28 rounded" />
            <Skeleton className="h-5 w-14 rounded" />
          </div>

          {/* Synchronized Hierarchy Rows */}
          <div className="flex-1 overflow-hidden divide-y divide-slate-100 dark:divide-white/[0.05]">
            {GANTT_SKELETON_ROWS.map((row, idx) => (
              <div
                key={idx}
                className={cn(
                  'h-[44px] px-3 flex items-center gap-2.5',
                  !row.isParent && 'pl-7',
                  idx % 2 === 1 && 'bg-slate-50/50 dark:bg-white/[0.012]',
                )}
              >
                <Skeleton
                  className={cn(
                    'shrink-0',
                    row.isParent ? 'w-3.5 h-3.5 rounded' : 'w-3.5 h-3.5 rounded-full',
                  )}
                />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Skeleton className={cn('h-3 rounded', row.titleW)} />
                    {row.isParent && <Skeleton className="h-3.5 w-8 rounded-md shrink-0" />}
                  </div>
                  <Skeleton className="h-2 w-20 rounded opacity-75" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Timeline Grid & Staggered Gantt Bars */}
        <div className="flex-1 min-w-0 flex flex-col bg-white dark:bg-canvas-dark overflow-hidden">
          {/* Sticky Date Header (exact h-[50px] parity) */}
          <div className="h-[50px] border-b border-slate-200/90 dark:border-white/[0.08] bg-[#F4F6FA] dark:bg-[#10131C] grid grid-cols-6 sm:grid-cols-10 lg:grid-cols-12 divide-x divide-slate-200/70 dark:divide-white/[0.05] shrink-0">
            {Array.from({ length: 12 }).map((_, colIdx) => (
              <div
                key={colIdx}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 px-1',
                  colIdx >= 6 && 'hidden sm:flex',
                  colIdx >= 10 && 'hidden lg:flex',
                  colIdx === 3 && 'bg-brand-100/60 dark:bg-brand-500/15',
                )}
              >
                <Skeleton className="h-2.5 w-6 rounded" />
                <Skeleton className="h-2.5 w-4 rounded" />
              </div>
            ))}
          </div>

          {/* Timeline Body Rows + Vertical Today Line + Gantt Bars */}
          <div className="relative flex-1 overflow-hidden">
            {/* Vertical column gridlines */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 grid grid-cols-6 sm:grid-cols-10 lg:grid-cols-12 divide-x divide-slate-100 dark:divide-white/[0.04]"
            >
              {Array.from({ length: 12 }).map((_, colIdx) => (
                <div
                  key={colIdx}
                  className={cn(
                    colIdx >= 6 && 'hidden sm:block',
                    colIdx >= 10 && 'hidden lg:block',
                    (colIdx === 5 || colIdx === 6) && 'bg-slate-100/45 dark:bg-white/[0.015]',
                  )}
                />
              ))}
            </div>

            {/* Subtle Today reference line */}
            <div
              aria-hidden="true"
              style={{ left: '29%' }}
              className="pointer-events-none absolute top-0 bottom-0 w-[2px] bg-brand-500/35 dark:bg-brand-400/35"
            />

            {/* Horizontal Rows & Staggered Bars */}
            <div className="relative divide-y divide-slate-100 dark:divide-white/[0.05]">
              {GANTT_SKELETON_ROWS.map((row, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'relative h-[44px] flex items-center',
                    idx % 2 === 1 && 'bg-slate-50/45 dark:bg-white/[0.012]',
                  )}
                >
                  <div
                    style={{ left: row.barLeft, width: row.barWidth }}
                    className="absolute flex items-center gap-2"
                  >
                    <div className="relative flex-1 overflow-hidden rounded-[6px]">
                      <Skeleton
                        className={cn(
                          'w-full rounded-[6px]',
                          row.isParent ? 'h-[24px]' : 'h-[22px]',
                        )}
                      />
                      {row.fillWidth && (
                        <span
                          aria-hidden="true"
                          style={{ width: row.fillWidth }}
                          className="absolute inset-y-0 left-0 bg-white/30 dark:bg-white/[0.08]"
                        />
                      )}
                    </div>
                    {!row.isParent && (
                      <Skeleton className="hidden sm:block h-2.5 w-16 rounded shrink-0" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Layout-accurate full-viewport skeleton matching WorkspacePage and SharedChartPage:
 * - Sticky h-16/h-[68px] studio header with view switcher & controls
 * - GanttToolbar strip (completion meter, filters, granularity, zoom)
 * - 300px TaskTreePane paired 1:1 with the 50px sticky TimelineHeader + staggered Gantt bars
 * - Mobile bottom bar on small screens (workspace variant)
 */
export function WorkspacePageSkeleton({
  variant = 'workspace',
}: {
  variant?: 'workspace' | 'shared';
}) {
  return (
    <div
      aria-busy="true"
      aria-label={variant === 'shared' ? 'Loading shared chart' : 'Loading workspace'}
      data-testid={variant === 'shared' ? 'shared-chart-skeleton' : 'workspace-page-skeleton'}
      className="h-dvh overflow-hidden flex flex-col studio-atmosphere text-slate-900 dark:text-slate-50"
    >
      {/* Header Shell (exact h-16 sm:h-[68px] parity with AppHeader / SharedChartPage header) */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 dark:border-white/[0.08] bg-white/90 dark:bg-[#090B10]/90 backdrop-blur-md shrink-0">
        <div className="h-16 sm:h-[68px] px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-3">
          {/* Left: Brand + Workspace selector / Shared chart title */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <BrandLogo size="md" className="shrink-0 opacity-85" />
            {variant === 'workspace' ? (
              <>
                <span className="hidden sm:inline font-mono text-sm font-bold uppercase tracking-[0.2em] text-slate-900/70 dark:text-slate-100/70">
                  SKED
                </span>
                <span className="h-5 sm:h-6 w-px bg-slate-200 dark:bg-white/[0.1] shrink-0" />
                <Skeleton className="h-9 w-36 sm:w-44 rounded-xl" />
              </>
            ) : (
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-36 sm:w-48 rounded" />
                  <Skeleton className="hidden sm:block h-5 w-24 rounded-full" />
                </div>
                <Skeleton className="h-3 w-28 rounded" />
              </div>
            )}
          </div>

          {/* Center: View Switcher (md+) + Search (xl+) */}
          <div className="flex items-center justify-center gap-3 flex-1 min-w-0">
            <div className="hidden md:flex items-center gap-1 p-1 rounded-xl bg-slate-100/90 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/[0.07]">
              <Skeleton className="h-7 w-20 rounded-lg" />
              <Skeleton className="h-7 w-16 rounded-lg" />
              <Skeleton className="h-7 w-14 rounded-lg" />
            </div>
            <Skeleton className="hidden xl:block h-10 flex-1 max-w-xs rounded-xl" />
          </div>

          {/* Right: Action controls */}
          <div className="flex items-center gap-2 shrink-0">
            {variant === 'workspace' ? (
              <>
                <Skeleton className="hidden sm:block h-9 w-20 rounded-xl" />
                <Skeleton className="h-9 w-9 rounded-xl" />
                <Skeleton className="h-9 w-9 sm:w-28 rounded-xl" />
              </>
            ) : (
              <>
                <Skeleton className="hidden sm:block h-10 w-24 rounded-xl" />
                <Skeleton className="h-10 w-28 sm:w-40 rounded-xl" />
                <Skeleton className="h-9 w-9 rounded-xl" />
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Workspace Frame */}
      <main
        className={cn(
          'relative z-0 flex-1 min-h-0 flex flex-col md:p-3',
          variant === 'workspace' ? 'pb-[60px] md:pb-3' : 'pb-0 md:pb-3',
        )}
      >
        <GanttCanvasSkeleton />
      </main>

      {/* Mobile Bottom Nav Skeleton (workspace only) */}
      {variant === 'workspace' && (
        <div className="fixed bottom-0 left-0 right-0 z-30 md:hidden h-[60px] border-t border-slate-200/90 dark:border-white/[0.08] bg-white/95 dark:bg-surface-dark/95 px-3 grid grid-cols-5 items-center">
          <Skeleton className="h-8 w-10 mx-auto rounded-lg" />
          <Skeleton className="h-8 w-10 mx-auto rounded-lg" />
          <Skeleton className="h-11 w-11 mx-auto rounded-full" />
          <Skeleton className="h-8 w-10 mx-auto rounded-lg" />
          <Skeleton className="h-8 w-10 mx-auto rounded-lg" />
        </div>
      )}
    </div>
  );
}

/**
 * Layout-accurate loading skeleton for StatusPage matching:
 * - Platform Quotas card (4 rows: Writes, Reads, Deletes, Storage + footer strip)
 * - 2-column bottom grid: 7-Day Daily Usage bar chart + Service Components list
 */
export function StatusPageSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading system status"
      data-testid="status-page-skeleton"
      className="space-y-8"
    >
      {/* Platform Quotas Card Skeleton */}
      <section className="rounded-2xl border border-slate-200/90 dark:border-white/[0.09] bg-white/90 dark:bg-surface-dark/90 shadow-surface-md dark:shadow-dark-md overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200/80 dark:border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-32 rounded" />
                <Skeleton className="h-4 w-36 rounded-md" />
              </div>
              <Skeleton className="h-3 w-64 sm:w-80 rounded" />
            </div>
          </div>
          <Skeleton className="h-4 w-28 rounded shrink-0" />
        </div>

        {/* 4 Quota Rows (Writes, Reads, Deletes, Storage) */}
        <div className="divide-y divide-slate-200/80 dark:divide-white/[0.07]">
          {[0, 1, 2, 3].map((rowIdx) => (
            <div
              key={rowIdx}
              className="px-6 py-5 grid grid-cols-1 md:grid-cols-[150px_190px_minmax(0,1fr)] items-center gap-3 md:gap-6"
            >
              <div className="flex items-center justify-between md:block">
                <Skeleton className="h-4 w-20 rounded" />
                <Skeleton className="md:hidden h-3.5 w-24 rounded" />
              </div>

              <div className="hidden md:flex items-baseline gap-2">
                <Skeleton className="h-6 w-12 rounded" />
                <Skeleton className="h-3 w-20 rounded" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3.5 w-14 rounded" />
                  <Skeleton className="h-3.5 w-20 rounded" />
                </div>
                <Skeleton className="h-2.5 w-full rounded-full" />
                <Skeleton className="h-3 w-44 rounded" />
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-3.5 bg-slate-50/80 dark:bg-white/[0.02] border-t border-slate-200/80 dark:border-white/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <Skeleton className="h-3 w-52 rounded" />
          <Skeleton className="h-3 w-40 rounded" />
        </div>
      </section>

      {/* Bottom 2-Column Grid: 7-Day Usage Chart + Service Components */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
        <section className="rounded-2xl border border-slate-200/90 dark:border-white/[0.09] bg-white/90 dark:bg-surface-dark/90 shadow-surface-md dark:shadow-dark-md p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-40 rounded" />
              <Skeleton className="h-3 w-56 rounded" />
            </div>
            <Skeleton className="h-8 w-44 rounded-lg" />
          </div>

          <div className="grid grid-cols-7 gap-2 sm:gap-3 items-end h-44 pt-4">
            {STATUS_TREND_BAR_HEIGHTS.map((height, idx) => (
              <div key={idx} className="flex flex-col items-center gap-2 h-full justify-end">
                <Skeleton className="h-3 w-7 rounded" />
                <div className="w-full max-w-[38px] flex-1 flex items-end">
                  <div style={{ height }} className="w-full">
                    <Skeleton className="h-full w-full rounded-t-lg rounded-b-none" />
                  </div>
                </div>
                <Skeleton className="h-3 w-9 rounded" />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200/90 dark:border-white/[0.09] bg-white/90 dark:bg-surface-dark/90 shadow-surface-md dark:shadow-dark-md p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Skeleton className="w-4 h-4 rounded" />
            <Skeleton className="h-4 w-32 rounded" />
          </div>

          <ul className="space-y-3.5">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="w-4 h-4 rounded" />
                  <Skeleton className="h-3.5 w-24 rounded" />
                </div>
                <Skeleton className="h-3.5 w-20 rounded" />
              </li>
            ))}
          </ul>

          <div className="pt-3 border-t border-slate-200/70 dark:border-white/[0.07] space-y-1.5">
            <Skeleton className="h-3 w-full rounded" />
            <Skeleton className="h-3 w-4/5 rounded" />
          </div>
        </section>
      </div>
    </div>
  );
}
