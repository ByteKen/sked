import type { Transition, Variants } from 'framer-motion';

export const STUDIO_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/**
 * GPU-composited progress-fill transition matching STUDIO_EASE.
 * Animates only compositor properties (transform, opacity) and background-color —
 * zero layout reflow and zero per-bar JS animation overhead across large timelines.
 */
export const PROGRESS_FILL_TRANSITION =
  'transition-[transform,opacity,background-color] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none';

/** Clamps a completion percentage into [0, 100] for safe CSS transform math. */
export function clampProgressPercent(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, progress));
}

export const SPRING_SNAPPY: Transition = {
  type: 'spring',
  stiffness: 480,
  damping: 36,
  mass: 0.75,
};

export const SPRING_MODAL: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 32,
  mass: 0.85,
};

export const STAGGER_CONTAINER: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.04,
    },
  },
};

export const FADE_UP_ITEM: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.42,
      ease: STUDIO_EASE,
    },
  },
};

export const POPOVER_VARIANTS: Variants = {
  hidden: { opacity: 0, y: -4, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: SPRING_SNAPPY,
  },
  exit: {
    opacity: 0,
    y: -4,
    scale: 0.97,
    transition: { duration: 0.12, ease: 'easeIn' },
  },
};
