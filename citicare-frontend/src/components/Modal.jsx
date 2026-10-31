import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useModalStack } from '../context/ModalStackContext';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  bodyClassName,
  hideClose = false,
  closeOnBackdrop = true,
  closeOnEsc = true,
  preventClose = false,
  ariaLabel,
  ariaDescribedBy,
  panelClassName = '',
  backdropClassName = '',
  initialFocus = 'auto',
}) => {
  const modalId = useId();
  const titleId = `${modalId}-title`;
  const panelRef = useRef(null);
  const { push, remove, isTop } = useModalStack();
  const top = isTop(modalId);

  useEffect(() => {
    if (!isOpen) return undefined;
    push(modalId);
    return () => remove(modalId);
  }, [isOpen, modalId, push, remove]);

  // Remember what was focused before the dialog opened and move focus into
  // the dialog. Restore focus when it closes.
  useEffect(() => {
    if (!isOpen) return undefined;
    const previouslyFocused = document.activeElement;
    const timer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      // Some dialogs should not draw attention to any one action on open, so
      // they move focus to the dialog itself instead of a button.
      if (initialFocus === 'panel') {
        panel.focus?.();
        return;
      }
      const preferred = panel.querySelector('[data-autofocus]');
      const first = panel.querySelector(FOCUSABLE);
      (preferred || first || panel).focus?.();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [isOpen, initialFocus]);

  // Only the top-most modal responds to keyboard shortcuts. Tab is trapped so
  // keyboard users cannot reach background content while a modal is open.
  useEffect(() => {
    if (!isOpen || !top) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && closeOnEsc && !preventClose) {
        event.stopPropagation();
        onClose?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll(FOCUSABLE)).filter(
        (element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true'
      );
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeOnEsc, isOpen, onClose, preventClose, top]);

  if (!isOpen) return null;

  const sizes = {
    xs: 'max-w-sm',
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  const canDismiss = Boolean(onClose) && !preventClose;

  return createPortal(
    <div
      className={`modal-shell fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 ${top ? '' : 'hidden'}`}
      aria-hidden={!top}
    >
      <div
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm ${backdropClassName}`}
        onClick={canDismiss && closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
        data-testid="modal-backdrop"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || (!title ? 'Dialog' : undefined)}
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={ariaDescribedBy}
        tabIndex={-1}
        className={`modal-panel relative ${sizes[size] || sizes.md} w-full glass rounded-t-2xl sm:rounded-2xl shadow-2xl outline-none ${top ? 'animate-slide-up' : ''} ${panelClassName}`}
      >
        {(title || !hideClose) && (
          <div className="modal-header flex items-center justify-between p-4 sm:p-6 border-b border-white/10">
            {title ? (
              <h2 id={titleId} className="text-base sm:text-lg font-semibold text-white tracking-tight">
                {title}
              </h2>
            ) : (
              <span />
            )}
            {!hideClose && canDismiss && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="p-2 rounded-lg text-white/65 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
        <div className={bodyClassName || "p-4 sm:p-6 max-h-[75vh] sm:max-h-[70vh] overflow-y-auto"}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default Modal;
