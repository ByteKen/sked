import type { Transition, Variants } from 'framer-motion';

export const STUDIO_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

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
