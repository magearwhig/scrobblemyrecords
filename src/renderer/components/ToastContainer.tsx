import { AlertTriangle, Check, Info, LucideIcon, X } from 'lucide-react';
import React, { useEffect, useState, useCallback } from 'react';

import { Toast, useToast } from '../context/ToastContext';

const TOAST_ICONS: Record<Toast['type'], LucideIcon> = {
  success: Check,
  error: X,
  warning: AlertTriangle,
  info: Info,
};

interface ToastItemProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onRemove }) => {
  const [exiting, setExiting] = useState(false);

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onRemove(toast.id), 300);
  }, [onRemove, toast.id]);

  useEffect(() => {
    if (toast.duration > 0) {
      const timer = setTimeout(dismiss, toast.duration);
      return () => clearTimeout(timer);
    }
  }, [toast.duration, dismiss]);

  const Icon = TOAST_ICONS[toast.type];

  return (
    <div
      className={`toast toast--${toast.type} ${exiting ? 'toast--exiting' : ''}`}
      role='alert'
      aria-live='assertive'
    >
      <span className={`toast-icon toast-icon--${toast.type}`}>
        <Icon size={16} aria-hidden='true' />
      </span>
      <span className='toast-message'>{toast.message}</span>
      {toast.action && (
        <button
          className='toast-action'
          onClick={() => {
            toast.action?.onClick();
            dismiss();
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        className='toast-dismiss'
        onClick={dismiss}
        aria-label='Dismiss notification'
      >
        <X size={16} aria-hidden='true' />
      </button>
    </div>
  );
};

const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className='toast-container' aria-label='Notifications'>
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  );
};

export default ToastContainer;
