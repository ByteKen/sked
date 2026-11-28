interface ShortcutRow {
  label: string;
  description: string;
  keys: string[];
}

const KEYBOARD_SHORTCUTS: ShortcutRow[] = [
  {
    label: 'Create new task',
    description: 'Open the new task modal immediately',
    keys: ['N'],
  },
  {
    label: 'Search tasks',
    description: 'Focus the workspace task search bar',
    keys: ['/'],
  },
  {
    label: 'Switch workspace view',
    description: 'Jump between Timeline, Board, and List views',
    keys: ['1', '2', '3'],
  },
  {
    label: 'Jump to Today',
    description: 'Center the timeline smoothly on today’s marker',
    keys: ['T'],
  },
  {
    label: 'Auto-fit timeline',
    description: 'Fit the full date range into the current viewport',
    keys: ['F'],
  },
  {
    label: 'Reset zoom to 100%',
    description: 'Restore timeline zoom back to default scale',
    keys: ['0'],
  },
  {
    label: 'Step zoom in / out',
    description: 'Adjust timeline zoom in 25% increments',
    keys: ['+', '-'],
  },
  {
    label: 'Close modal or menu',
    description: 'Dismiss any active dialog or popover',
    keys: ['Esc'],
  },
];

const TIMELINE_GESTURES: ShortcutRow[] = [
  {
    label: 'Horizontal timeline scroll',
    description: 'Scroll horizontally across dates with a mouse wheel',
    keys: ['Shift', 'Scroll'],
  },
  {
    label: 'Cursor-anchored zoom',
    description: 'Zoom smoothly around your mouse pointer or trackpad',
    keys: ['Ctrl / ⌘', 'Scroll'],
  },
  {
    label: 'Mobile pinch-to-zoom',
    description: 'Pinch or spread two fingers directly on the timeline',
    keys: ['2-Finger Pinch'],
  },
  {
    label: 'Drag bar to reschedule',
    description: 'Drag on desktop or hold on mobile; Esc to cancel',
    keys: ['Drag / Hold', 'Esc'],
  },
  {
    label: 'Resize task panel',
    description: 'Drag the center divider (double-click to reset)',
    keys: ['Drag Divider'],
  },
];

function ShortcutGroup({ title, items }: { title: string; items: ShortcutRow[] }) {
  return (
    <section>
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500 pb-1">
        {title}
      </h4>

      <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between gap-4 py-2.5"
          >
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-slate-900 dark:text-slate-100 leading-snug">
                {item.label}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                {item.description}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {item.keys.map((key) => (
                <kbd
                  key={key}
                  className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-md border border-slate-200/90 dark:border-white/[0.12] bg-slate-50 dark:bg-surface-elevated font-mono text-[10px] font-semibold text-slate-700 dark:text-slate-200 shadow-[0_1px_0_rgba(15,23,42,0.06)] whitespace-nowrap"
                >
                  {key}
                </kbd>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ShortcutsSettingsTab() {
  return (
    <div className="space-y-6">
      <ShortcutGroup title="Keyboard Shortcuts" items={KEYBOARD_SHORTCUTS} />
      <ShortcutGroup title="Timeline Zoom & Gestures" items={TIMELINE_GESTURES} />
    </div>
  );
}
