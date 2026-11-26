import { useCallback, useEffect, useRef } from 'react';

/**
 * Zero-friction bidirectional vertical scroll sync between TaskTreePane and Timeline.
 *
 * Uses active-source locking so programmatic scrollTop updates on the mirrored pane
 * NEVER echo back and fight Chrome/Edge compositor smooth-scrolling momentum.
 */
export function useSyncedScroll() {
  const leftRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);
  const activeSourceRef = useRef<'left' | 'right' | null>(null);
  const releaseTimerRef = useRef<number | null>(null);

  const scheduleRelease = useCallback(() => {
    if (releaseTimerRef.current !== null) {
      window.clearTimeout(releaseTimerRef.current);
    }
    releaseTimerRef.current = window.setTimeout(() => {
      activeSourceRef.current = null;
      releaseTimerRef.current = null;
    }, 120);
  }, []);

  useEffect(() => {
    return () => {
      if (releaseTimerRef.current !== null) {
        window.clearTimeout(releaseTimerRef.current);
      }
    };
  }, []);

  const claimLeft = useCallback(() => {
    activeSourceRef.current = 'left';
    scheduleRelease();
  }, [scheduleRelease]);

  const claimRight = useCallback(() => {
    activeSourceRef.current = 'right';
    scheduleRelease();
  }, [scheduleRelease]);

  const handleLeftScroll = useCallback(() => {
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right) return;
    if (activeSourceRef.current === 'right') return;

    activeSourceRef.current = 'left';
    scheduleRelease();

    if (right.scrollTop !== left.scrollTop) {
      right.scrollTop = left.scrollTop;
    }
  }, [scheduleRelease]);

  const handleRightScroll = useCallback(() => {
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right) return;
    if (activeSourceRef.current === 'left') return;

    activeSourceRef.current = 'right';
    scheduleRelease();

    if (left.scrollTop !== right.scrollTop) {
      left.scrollTop = right.scrollTop;
    }
  }, [scheduleRelease]);

  return {
    leftRef,
    rightRef,
    claimLeft,
    claimRight,
    handleLeftScroll,
    handleRightScroll,
  };
}
