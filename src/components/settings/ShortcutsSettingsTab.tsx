import { Keyboard, MagnifyingGlassPlus } from '@phosphor-icons/react';

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
    description: 'Jump focus into the workspace task search bar',
    keys: ['/'],
  },
  {
    label: 'Jump to Today',
    description: 'Center the timeline smoothly on today’s marker',
    keys: ['T'],
  },
  {
    label: 'Close modal or menu',
    description: 'Dismiss any active dialog or dropdown popover',
    keys: ['Esc'],
  },
];

const TIMELINE_GESTURES: ShortcutRow[] = [
  {
    label: 'Cursor-anchored zoom',
    description: 'Zoom smoothly around your mouse pointer or trackpad pinch',
    keys: ['Ctrl / ⌘', 'Scroll'],
  },
  {
    label: 'Mobile pinch-to-zoom',
    description: 'Pinch or spread two fingers directly on the timeline',
    keys: ['2-Finger Pinch'],
  },
  {
    label: 'Step zoom in / out',
    description: 'Adjust timeline zoom in 25% increments',
    keys: ['+', '-'],
  },
  {
    label: 'Resize task panel',
    description: 'Drag the center divider (double-click to reset width)',
    keys: ['Drag Divider'],
  },
];

function ShortcutGroup({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items: ShortcutRow[];
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
          {title}
        </h3>
      </div>

      <div className="rounded-xl border border-slate-200/90 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.025] divide-y divide-slate-200/75 dark:divide-white/[0.06]">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between gap-4 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {item.label}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {item.description}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {item.keys.map((key) => (
                <kbd
                  key={key}
                  className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-lg border border-slate-200/90 dark:border-white/[0.12] bg-white dark:bg-surface-elevated font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-200 shadow-surface-sm whitespace-nowrap"
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
      <ShortcutGroup
        title="Keyboard Shortcuts"
        icon={<Keyboard weight="duotone" className="w-4 h-4 text-brand-600 dark:text-brand-400" />}
        items={KEYBOARD_SHORTCUTS}
      />

      <ShortcutGroup
        title="Timeline Zoom & Gestures"
        icon={
          <MagnifyingGlassPlus
            weight="duotone"
            className="w-4 h-4 text-brand-600 dark:text-brand-400"
          />
        }
        items={TIMELINE_GESTURES}
      />
    </div>
  );
}
