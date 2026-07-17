'use client';

import { useState, useCallback } from 'react';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface UseToastReturn {
  toasts: Toast[];
  showToast: (message: string, variant?: ToastVariant) => void;
  removeToast: (id: string) => void;
}

/**
 * Toast state management hook.
 * Auto-dismisses after 4 seconds.
 */
export function useToast(): UseToastReturn {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string): void => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = 'info'): void => {
      const id = `toast_${Date.now()}_${Math.random()}`;
      setToasts((prev) => [...prev, { id, message, variant }]);
      setTimeout(() => removeToast(id), 4000);
    },
    [removeToast],
  );

  return { toasts, showToast, removeToast };
}
