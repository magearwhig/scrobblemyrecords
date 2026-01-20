import React, { useEffect, useCallback } from 'react';

import './Modal.css';

export type ModalSize = 'small' | 'medium' | 'large' | 'fullscreen';

export interface ModalProps {
  /**
   * Whether the modal is open.
   */
  isOpen: boolean;
  /**
   * Callback when the modal should close.
   */
  onClose: () => void;
  /**
   * Modal title displayed in the header.
   */
  title?: string;
  /**
   * Size variant of the modal.
   */
  size?: ModalSize;
  /**
   * Whether to show a loading state.
   */
  loading?: boolean;
  /**
   * Whether to close when clicking the overlay.
   */
  closeOnOverlayClick?: boolean;
  /**
   * Whether to close when pressing Escape.
   */
  closeOnEscape?: boolean;
  /**
   * Whether to show the close button.
   */
  showCloseButton?: boolean;
  /**
   * Additional class name for the modal.
   */
  className?: string;
  /**
   * Modal content.
   */
  children: React.ReactNode;
}

/**
 * A reusable modal component with consistent styling and behavior.
 */
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  size = 'medium',
  loading = false,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  showCloseButton = true,
  className = '',
  children,
}) => {
  // Handle Escape key
  const handleKeyDown = useCallback(
    (event: globalThis.KeyboardEvent) => {
      if (closeOnEscape && event.key === 'Escape') {
        onClose();
      }
    },
    [closeOnEscape, onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) {
    return null;
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  const modalClassNames = [
    'modal',
    `modal--${size}`,
    loading && 'modal--loading',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className='modal-overlay' onClick={handleOverlayClick}>
      <div
        className={modalClassNames}
        onClick={e => e.stopPropagation()}
        role='dialog'
        aria-modal='true'
        aria-labelledby={title ? 'modal-title' : undefined}
      >
        {(title || showCloseButton) && (
          <div className='modal-header'>
            {title && (
              <h2 id='modal-title' className='modal-title'>
                {title}
              </h2>
            )}
            {showCloseButton && (
              <button
                className='modal-close'
                onClick={onClose}
                aria-label='Close modal'
              >
                &times;
              </button>
            )}
          </div>
        )}
        <div className='modal-body'>{children}</div>
        {loading && (
          <div className='modal-loading-overlay'>
            <div className='modal-spinner' />
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Modal footer component for action buttons.
 */
export interface ModalFooterProps {
  /**
   * Additional class name.
   */
  className?: string;
  /**
   * Footer content (usually buttons).
   */
  children: React.ReactNode;
}

export const ModalFooter: React.FC<ModalFooterProps> = ({
  className = '',
  children,
}) => {
  return <div className={`modal-footer ${className}`}>{children}</div>;
};

/**
 * Modal content section component.
 */
export interface ModalSectionProps {
  /**
   * Section title.
   */
  title?: string;
  /**
   * Additional class name.
   */
  className?: string;
  /**
   * Section content.
   */
  children: React.ReactNode;
}

export const ModalSection: React.FC<ModalSectionProps> = ({
  title,
  className = '',
  children,
}) => {
  return (
    <div className={`modal-section ${className}`}>
      {title && <h3 className='modal-section-title'>{title}</h3>}
      {children}
    </div>
  );
};

export default Modal;
