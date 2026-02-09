import React, {
  createContext,
  useContext,
  useCallback,
  useState,
  ReactNode,
} from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastOptions {
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContextValue {
  toasts: Toast[];
  showToast: (type: ToastType, message: string, options?: ToastOptions) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const DEFAULT_DURATION = 4000;

let toastIdCounter = 0;

export const ToastProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback(
    (type: ToastType, message: string, options?: ToastOptions) => {
      const id = `toast-${++toastIdCounter}`;
      const duration = options?.duration ?? DEFAULT_DURATION;
      const toast: Toast = {
        id,
        type,
        message,
        duration,
        action: options?.action,
      };

      setToasts(prev => [...prev, toast]);
    },
    []
  );

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
