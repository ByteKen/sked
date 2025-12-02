// Toast utility functions - separated for Fast Refresh compatibility
import { useState, useEffect, useCallback } from 'react';

let toastId = 0;
let toastListeners = [];

export const toast = {
  show: (options) => {
    const id = ++toastId;
    const toastData = { id, ...options };
    toastListeners.forEach(listener => listener({ type: 'add', toast: toastData }));
    return id;
  },
  error: (message, description) => toast.show({ type: 'error', message, description }),
  success: (message, description) => toast.show({ type: 'success', message, description }),
  warning: (message, description) => toast.show({ type: 'warning', message, description }),
  info: (message, description) => toast.show({ type: 'info', message, description }),
  dismiss: (id) => {
    toastListeners.forEach(listener => listener({ type: 'remove', id }));
  },
  subscribe: (listener) => {
    toastListeners.push(listener);
    return () => {
      toastListeners = toastListeners.filter(l => l !== listener);
    };
  }
};

// Hook to manage toast state
export function useToast() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const unsubscribe = toast.subscribe((action) => {
      if (action.type === 'add') {
        setToasts(prev => [...prev, action.toast]);
      } else if (action.type === 'remove') {
        setToasts(prev => prev.filter(t => t.id !== action.id));
      }
    });
    return unsubscribe;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, removeToast };
}
