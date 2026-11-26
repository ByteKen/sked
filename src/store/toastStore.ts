import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  description?: string;
  duration: number;
}

interface ToastState {
  toasts: ToastItem[];
  addToast: (input: Omit<ToastItem, 'id' | 'duration'> & { duration?: number }) => number;
  dismissToast: (id: number) => void;
  clearAll: () => void;
}

let nextToastId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: ({ type, message, description, duration = 4000 }) => {
    const id = nextToastId++;
    set((state) => ({
      toasts: [...state.toasts.slice(-4), { id, type, message, description, duration }],
    }));
    return id;
  },
  dismissToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
  clearAll: () => set({ toasts: [] }),
}));

export const toast = {
  success: (message: string, description?: string, duration?: number) =>
    useToastStore.getState().addToast({ type: 'success', message, description, duration }),
  error: (message: string, description?: string, duration?: number) =>
    useToastStore.getState().addToast({ type: 'error', message, description, duration }),
  warning: (message: string, description?: string, duration?: number) =>
    useToastStore.getState().addToast({ type: 'warning', message, description, duration }),
  info: (message: string, description?: string, duration?: number) =>
    useToastStore.getState().addToast({ type: 'info', message, description, duration }),
  dismiss: (id: number) => useToastStore.getState().dismissToast(id),
};
