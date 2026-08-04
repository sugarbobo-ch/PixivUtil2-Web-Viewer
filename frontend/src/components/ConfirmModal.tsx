import React, { useEffect, useRef } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

type ConfirmModalVariant = 'danger' | 'primary';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmModalVariant;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = '確定刪除',
  cancelLabel = '取消',
  variant = 'danger',
  onConfirm,
  onCancel,
}) => {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    previouslyFocusedElement.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    cancelButtonRef.current?.focus({ preventScroll: true });

    return () => {
      previouslyFocusedElement.current?.focus({ preventScroll: true });
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onCancel();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onCancel]);

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onCancel();
  };

  if (!isOpen) return null;

  const isPrimary = variant === 'primary';
  const HeaderIcon = isPrimary ? RefreshCw : AlertTriangle;
  const ActionIcon = isPrimary ? RefreshCw : Trash2;
  const iconClassName = isPrimary ? 'settings-modal__primary-icon' : 'settings-modal__danger-icon';
  const actionClassName = isPrimary ? 'settings-modal__primary-button' : 'settings-modal__danger-button';

  return (
    <div
      role="presentation"
      onClick={handleBackdropClick}
      className="settings-modal__confirm-overlay fixed inset-0 z-[70] flex items-center justify-center p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-message"
        className="settings-modal__confirm-panel w-full max-w-md space-y-4 rounded-2xl p-6 shadow-2xl"
      >
        <div className="flex items-center gap-3">
          <div className={`${iconClassName} rounded-lg p-2.5`}>
            <HeaderIcon className="w-6 h-6" aria-hidden="true" />
          </div>
          <h3 id="confirm-modal-title" className="settings-modal__confirm-title text-lg font-bold">{title}</h3>
        </div>

        <p id="confirm-modal-message" className="settings-modal__confirm-text text-sm leading-relaxed">{message}</p>

        <div className="flex items-center justify-end gap-3 border-t border-[var(--settings-border)] pt-3">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            className="settings-modal__secondary-button min-h-11 rounded-xl px-4 py-2 text-xs font-semibold transition-[background-color,transform] active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            className={`${actionClassName} inline-flex min-h-11 items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-[background-color,transform] active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2`}
          >
            <ActionIcon className="w-4 h-4" aria-hidden="true" />
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
