import { useEffect, useRef, type RefObject } from 'react';

const focusableSelector = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const getFocusableElements = (root: HTMLElement | null) => (
  Array.from(root?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])
    .filter(element => (
      !element.hasAttribute('aria-hidden')
      && element.getClientRects().length > 0
    ))
);

interface UseModalFocusTrapOptions {
  isOpen: boolean;
  dialogRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  disabled?: boolean;
}

/**
 * Keep keyboard focus inside an open modal and return it to the trigger when
 * the modal closes. Nested confirmation dialogs can temporarily disable the
 * outer trap without causing the outer dialog to steal focus back.
 */
export const useModalFocusTrap = ({
  isOpen,
  dialogRef,
  initialFocusRef,
  disabled = false,
}: UseModalFocusTrapOptions) => {
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      const element = previouslyFocusedElement.current;
      previouslyFocusedElement.current = null;
      if (element && document.contains(element)) {
        window.requestAnimationFrame(() => element.focus({ preventScroll: true }));
      }
      return undefined;
    }

    previouslyFocusedElement.current = document.activeElement instanceof HTMLElement
      && document.activeElement !== document.body
      && document.activeElement !== document.documentElement
      ? document.activeElement
      : null;

    const frame = window.requestAnimationFrame(() => {
      const initialElement = initialFocusRef?.current;
      if (initialElement && document.contains(initialElement)) {
        initialElement.focus({ preventScroll: true });
        return;
      }

      getFocusableElements(dialogRef.current)[0]?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [dialogRef, initialFocusRef, isOpen]);

  useEffect(() => {
    if (!isOpen || disabled) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusableElements = getFocusableElements(dialog);
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (!dialog.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [dialogRef, disabled, isOpen]);
};
