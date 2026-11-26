import { useEffect } from 'react';

interface ShortcutHandlers {
  enabled?: boolean;
  onFocusSearch?: () => void;
  onNewTask?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onGoToToday?: () => void;
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

export function useKeyboardShortcuts({
  enabled = true,
  onFocusSearch,
  onNewTask,
  onZoomIn,
  onZoomOut,
  onGoToToday,
}: ShortcutHandlers): void {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableElement(event.target)) return;

      if (event.key === '/' && onFocusSearch) {
        event.preventDefault();
        onFocusSearch();
      } else if ((event.key === 'n' || event.key === 'N') && onNewTask) {
        event.preventDefault();
        onNewTask();
      } else if ((event.key === '+' || event.key === '=') && onZoomIn) {
        event.preventDefault();
        onZoomIn();
      } else if (event.key === '-' && onZoomOut) {
        event.preventDefault();
        onZoomOut();
      } else if ((event.key === 't' || event.key === 'T') && onGoToToday) {
        event.preventDefault();
        onGoToToday();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onFocusSearch, onNewTask, onZoomIn, onZoomOut, onGoToToday]);
}
