'use client';

import React from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import type { Toast, ToastVariant } from '@/hooks/useToast';

const variantConfig: Record<
  ToastVariant,
  { icon: React.ReactNode; bgClass: string; borderClass: string; iconClass: string }
> = {
  success: {
    icon: <CheckCircle size={18} />,
    bgClass: 'bg-surface',
    borderClass: 'border-semantic-success/50',
    iconClass: 'text-semantic-success',
  },
  error: {
    icon: <XCircle size={18} />,
    bgClass: 'bg-surface',
    borderClass: 'border-semantic-critical/50',
    iconClass: 'text-semantic-critical',
  },
  warning: {
    icon: <AlertTriangle size={18} />,
    bgClass: 'bg-surface',
    borderClass: 'border-semantic-pending/50',
    iconClass: 'text-semantic-pending',
  },
  info: {
    icon: <Info size={18} />,
    bgClass: 'bg-surface',
    borderClass: 'border-semantic-info/50',
    iconClass: 'text-semantic-info',
  },
};

interface ToastItemProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

function ToastItem({ toast, onRemove }: ToastItemProps): React.ReactElement {
  const config = variantConfig[toast.variant];

  return (
    <div
      role="alert"
      className={[
        'flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-elevated backdrop-blur-xl',
        'animate-slide-right',
        config.bgClass,
        config.borderClass,
      ].join(' ')}
    >
      <span className={['mt-0.5 flex-shrink-0', config.iconClass].join(' ')}>
        {config.icon}
      </span>
      <p className="flex-1 text-sm font-medium leading-snug text-text-primary">{toast.message}</p>
      <button
        onClick={() => onRemove(toast.id)}
        aria-label="Dismiss notification"
        className="flex-shrink-0 rounded-lg p-0.5 text-text-secondary opacity-70 hover:opacity-100 transition-opacity"
      >
        <X size={14} />
      </button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

/**
 * Toast notification container — renders in fixed bottom-right corner.
 */
export function ToastContainer({ toasts, onRemove }: ToastContainerProps): React.ReactElement {
  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex w-full max-w-sm flex-col gap-2"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}
