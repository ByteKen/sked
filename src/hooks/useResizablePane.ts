import { useCallback, useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react';

interface UseResizablePaneOptions {
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
}

export function useResizablePane({
  storageKey,
  defaultWidth,
  minWidth,
  maxWidth,
}: UseResizablePaneOptions) {
  const [width, setWidth] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = Number(raw);
        if (!Number.isNaN(parsed)) {
          return Math.min(maxWidth, Math.max(minWidth, parsed));
        }
      }
    } catch {
      // Ignore storage access failures
    }
    return defaultWidth;
  });

  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = width;
      setIsDragging(true);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - startX;
        const clamped = Math.min(maxWidth, Math.max(minWidth, startWidth + delta));
        setWidth(clamped);
      };

      const handlePointerUp = () => {
        setIsDragging(false);
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    },
    [maxWidth, minWidth, width],
  );

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(Math.round(width)));
    } catch {
      // Ignore storage errors
    }
  }, [storageKey, width]);

  const resetWidth = useCallback(() => setWidth(defaultWidth), [defaultWidth]);

  return {
    width,
    isDragging,
    handlePointerDown,
    resetWidth,
  };
}
