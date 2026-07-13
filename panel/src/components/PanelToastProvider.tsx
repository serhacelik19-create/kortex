import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, Info, TriangleAlert, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

type ToastItem = {
  id: number;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
};

type PanelToastContextValue = {
  showToast: (toast: Omit<ToastItem, 'id'>) => void;
};

const PanelToastContext = createContext<PanelToastContextValue | null>(null);

const iconMap = {
  success: CheckCircle,
  error: AlertCircle,
  warning: TriangleAlert,
  info: Info,
} satisfies Record<ToastType, React.ComponentType<{ size?: number }>>;

export const PanelToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timeoutRefs = useRef<Map<number, number>>(new Map());

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timeout = timeoutRefs.current.get(id);
    if (timeout) {
      window.clearTimeout(timeout);
      timeoutRefs.current.delete(id);
    }
  }, []);

  const showToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const nextToast: ToastItem = {
      id,
      duration: 2800,
      ...toast,
    };

    setToasts((prev) => [...prev, nextToast]);

    const timeout = window.setTimeout(() => {
      removeToast(id);
    }, nextToast.duration);
    timeoutRefs.current.set(id, timeout);
  }, [removeToast]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <PanelToastContext.Provider value={value}>
      {children}
      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map((toast) => {
            const Icon = iconMap[toast.type];
            return (
              <div key={toast.id} className={`toast toast-${toast.type}`}>
                <div className="toast-icon">
                  <Icon size={18} />
                </div>
                <div className="toast-content">
                  {toast.title ? <div className="toast-title">{toast.title}</div> : null}
                  <div className="toast-message">{toast.message}</div>
                </div>
                <button
                  type="button"
                  className="toast-close"
                  onClick={() => removeToast(toast.id)}
                  aria-label="Bildirimi kapat"
                >
                  <X size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </PanelToastContext.Provider>
  );
};

export const usePanelToast = () => {
  const context = useContext(PanelToastContext);
  if (!context) {
    throw new Error('usePanelToast must be used within PanelToastProvider');
  }
  return context;
};
