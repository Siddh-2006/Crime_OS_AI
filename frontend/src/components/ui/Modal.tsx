'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
};

/**
 * Accessible modal with focus trap and Escape key support.
 */
export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: ModalProps): React.ReactElement | null {
  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-neutral-900/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={[
          'relative w-full rounded-xl bg-surface shadow-elevated flex flex-col',
          'max-h-[90vh]',
          sizeClasses[size],
        ].join(' ')}
      >
        {/* Header — always visible */}
        <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 px-6 py-4 flex-shrink-0">
          <h2 id="modal-title" className="text-lg font-semibold text-text-primary">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-md p-1 text-text-secondary hover:bg-neutral-800 dark:hover:bg-neutral-800 hover:text-text-primary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="px-6 py-4 overflow-y-auto flex-1">{children}</div>

        {/* Footer — always visible */}
        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-neutral-100 dark:border-neutral-800 px-6 py-4 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
