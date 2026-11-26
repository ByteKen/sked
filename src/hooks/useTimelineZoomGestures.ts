import { useEffect, useRef, type RefObject } from 'react';
import { clampTimelineZoom, computeWheelZoom } from '@/domain/timeline';

export interface UseTimelineZoomGesturesOptions {
  containerRef: RefObject<HTMLDivElement | null>;
  zoom: number;
  active?: boolean;
  onZoomAtAnchor: (nextZoom: number, anchorOffsetPx: number) => void;
}

function getTouchDistance(a: Touch, b: Touch): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function getTouchMidpointX(a: Touch, b: Touch): number {
  return (a.clientX + b.clientX) / 2;
}

/**
 * Adds Figma-style cursor-anchored `Ctrl/Cmd + Scroll` (and trackpad pinch)
 * plus mobile two-finger pinch-to-zoom directly on the timeline viewport
 * without triggering browser page zoom.
 */
export function useTimelineZoomGestures({
  containerRef,
  zoom,
  active = true,
  onZoomAtAnchor,
}: UseTimelineZoomGesturesOptions): void {
  const zoomRef = useRef(zoom);
  const onZoomAtAnchorRef = useRef(onZoomAtAnchor);

  useEffect(() => {
    zoomRef.current = zoom;
    onZoomAtAnchorRef.current = onZoomAtAnchor;
  }, [zoom, onZoomAtAnchor]);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    let pinchStartDistance: number | null = null;
    let pinchStartZoom = zoomRef.current;

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.deltaY === 0) return;

      e.preventDefault();
      e.stopPropagation();

      const rect = container.getBoundingClientRect();
      const anchorOffsetPx = Math.max(0, e.clientX - rect.left);
      const nextZoom = computeWheelZoom(zoomRef.current, e.deltaY, e.deltaMode);
      zoomRef.current = nextZoom;
      onZoomAtAnchorRef.current(nextZoom, anchorOffsetPx);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const first = e.touches[0];
        const second = e.touches[1];
        if (!first || !second) return;
        const dist = getTouchDistance(first, second);
        if (dist > 0) {
          pinchStartDistance = dist;
          pinchStartZoom = zoomRef.current;
        }
      } else {
        pinchStartDistance = null;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || pinchStartDistance === null) return;
      const first = e.touches[0];
      const second = e.touches[1];
      if (!first || !second) return;

      e.preventDefault();

      const currentDistance = getTouchDistance(first, second);
      if (currentDistance <= 0) return;

      const scale = currentDistance / pinchStartDistance;
      const nextZoom = clampTimelineZoom(pinchStartZoom * scale);
      zoomRef.current = nextZoom;
      const rect = container.getBoundingClientRect();
      const midX = getTouchMidpointX(first, second);
      const anchorOffsetPx = Math.max(0, midX - rect.left);

      onZoomAtAnchorRef.current(nextZoom, anchorOffsetPx);
    };

    const handleTouchEndOrCancel = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinchStartDistance = null;
      }
    };

    // Prevent Safari's proprietary viewport pinch zoom inside the timeline
    const handleSafariGesture = (e: Event) => {
      e.preventDefault();
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEndOrCancel, { passive: true });
    container.addEventListener('touchcancel', handleTouchEndOrCancel, { passive: true });
    container.addEventListener('gesturestart', handleSafariGesture, { passive: false });
    container.addEventListener('gesturechange', handleSafariGesture, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEndOrCancel);
      container.removeEventListener('touchcancel', handleTouchEndOrCancel);
      container.removeEventListener('gesturestart', handleSafariGesture);
      container.removeEventListener('gesturechange', handleSafariGesture);
    };
  }, [containerRef, active]);
}
