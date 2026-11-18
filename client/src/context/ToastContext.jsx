import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '../lib/utils';

const ToastContext = createContext(null);

const VARIANTS = {
  success: {
    icon: CheckCircle2,
    className: 'border-teal-200 bg-white text-slate-800',
    iconClassName: 'text-teal-600',
  },
  error: {
    icon: XCircle,
    className: 'border-red-200 bg-white text-slate-800',
    iconClassName: 'text-red-600',
  },
  info: {
    icon: Info,
    className: 'border-blue-200 bg-white text-slate-800',
    iconClassName: 'text-blue-600',
  },
};

let toastCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (toast) => {
      const id = ++toastCounter;
      const entry = {
        id,
        variant: toast.variant || 'info',
        title: toast.title || '',
        message: toast.message || '',
        duration: toast.duration ?? 4500,
      };

      setToasts((current) => [...current, entry]);
      window.setTimeout(() => dismiss(id), entry.duration);
      return id;
    },
    [dismiss],
  );

  const toast = useMemo(
    () => ({
      success: (message, title = 'Success') =>
        push({ variant: 'success', title, message }),
      error: (message, title = 'Something went wrong') =>
        push({ variant: 'error', title, message }),
      info: (message, title = 'Heads up') =>
        push({ variant: 'info', title, message }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0"
      >
        {toasts.map((entry) => {
          const variant = VARIANTS[entry.variant] || VARIANTS.info;
          const Icon = variant.icon;

          return (
            <div
              key={entry.id}
              role="status"
              className={cn(
                'pointer-events-auto flex items-start gap-3 rounded-xl border p-3 shadow-lg shadow-slate-900/5',
                variant.className,
              )}
            >
              <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', variant.iconClassName)} />
              <div className="min-w-0 flex-1">
                {entry.title && (
                  <p className="text-sm font-semibold text-slate-900">{entry.title}</p>
                )}
                {entry.message && (
                  <p className="mt-0.5 text-sm leading-5 text-slate-600">
                    {entry.message}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(entry.id)}
                className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside a ToastProvider');
  }
  return context;
}
