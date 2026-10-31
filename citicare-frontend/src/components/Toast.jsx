import { useState, useEffect, useMemo, useRef, useCallback, createContext, useContext } from 'react';
import { CheckCircle, X } from 'lucide-react';

const ToastContext = createContext(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  // Snackbars are reserved for success confirmations. Errors, warnings, and
  // validation messages are rendered as dialogs (see DialogContext) or inline
  // beside the field so they cannot disappear before the user reads them.
  const addToast = useCallback((message, duration = 4000) => {
    const id = nextId.current++;
    setToasts(prev => [...prev, { id, message, duration }]);
    return id;
  }, []);

  const value = useMemo(() => ({ addToast, removeToast }), [addToast, removeToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed top-4 right-4 left-4 sm:left-auto z-[100] space-y-2 pointer-events-none sm:max-w-sm sm:ml-auto"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map(toast => (
          <Toast key={toast.id} {...toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

const Toast = ({ message, duration = 4000, onClose }) => {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const exitTimer = setTimeout(() => setIsExiting(true), Math.max(1000, duration));
    const removeTimer = setTimeout(onClose, Math.max(1000, duration) + 300);
    return () => {
      clearTimeout(exitTimer);
      clearTimeout(removeTimer);
    };
  }, [duration, onClose]);

  const dismiss = () => {
    setIsExiting(true);
    setTimeout(onClose, 300);
  };

  return (
    <div
      role="status"
      className={`glass border rounded-xl p-4 flex items-start space-x-3 pointer-events-auto
      animate-slide-up border-emerald-400/30 bg-emerald-500/20 ${isExiting ? 'opacity-0 translate-x-full transition-all duration-300' : ''}`}
    >
      <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-300" aria-hidden="true" />
      <p className="text-sm text-white flex-1 whitespace-pre-line break-words">{message}</p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss notification"
        className="text-white/75 hover:text-white flex-shrink-0"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
};
