import { create } from 'zustand';
import { nanoid } from 'nanoid';

export interface Toast {
  id: string;
  message: string;
  tone?: 'default' | 'success' | 'danger';
  actionLabel?: string;
  onAction?: () => void;
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => string;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: ({ duration = 5000, ...rest }) => {
    const id = nanoid();
    set((s) => ({ toasts: [...s.toasts, { id, duration, ...rest }] }));
    if (duration > 0) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      }, duration);
    }
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
