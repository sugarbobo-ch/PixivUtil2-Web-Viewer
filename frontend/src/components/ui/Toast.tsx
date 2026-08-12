import React, { useEffect } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { IconButton } from './Button';

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface ToastProps {
  isOpen: boolean;
  message: string;
  variant?: ToastVariant;
  onClose: () => void;
  autoDismissMs?: number;
}

const variantIconMap: Record<ToastVariant, React.ReactNode> = {
  info: <Info className="h-5 w-5 text-sky-500 shrink-0" aria-hidden="true" />,
  success: <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" aria-hidden="true" />,
  warning: <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" aria-hidden="true" />,
  error: <AlertCircle className="h-5 w-5 text-rose-500 shrink-0" aria-hidden="true" />,
};

export const Toast: React.FC<ToastProps> = ({
  isOpen,
  message,
  variant = 'info',
  onClose,
  autoDismissMs = 3000,
}) => {
  useEffect(() => {
    if (!isOpen || !autoDismissMs) return undefined;
    const timer = setTimeout(() => {
      onClose();
    }, autoDismissMs);
    return () => clearTimeout(timer);
  }, [isOpen, autoDismissMs, onClose]);

  if (!isOpen || !message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-[90px] left-1/2 -translate-x-1/2 sm:top-[90px] sm:right-6 sm:left-auto sm:translate-x-0 z-50 flex w-[calc(100%-2rem)] max-w-md items-center justify-between gap-3 rounded-2xl border border-[var(--viewer-border)] bg-[var(--viewer-surface-raised)] p-4 text-sm font-medium text-[var(--viewer-text)] transition-all duration-200"
    >
      <div className="flex items-center gap-3 min-w-0">
        {variantIconMap[variant]}
        <span className="break-words leading-relaxed">{message}</span>
      </div>
      <IconButton
        type="button"
        variant="ghost"
        onClick={onClose}
        aria-label="關閉通知"
        title="關閉通知"
        className="shrink-0"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </IconButton>
    </div>
  );
};
