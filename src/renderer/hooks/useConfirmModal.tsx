import React, { useCallback, useRef, useState } from 'react';

import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';

interface ConfirmState {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

/**
 * Hook that replaces window.confirm with an accessible Modal-based dialog.
 *
 * Returns [confirm, ConfirmModal]:
 * - confirm(message, options?) — returns a Promise<boolean>
 * - ConfirmModal — JSX element to render in your component
 */
export function useConfirmModal() {
  const [state, setState] = useState<ConfirmState | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback(
    (
      message: string,
      options?: { title?: string; confirmLabel?: string; cancelLabel?: string }
    ): Promise<boolean> => {
      return new Promise<boolean>(resolve => {
        resolveRef.current = resolve;
        setState({
          message,
          title: options?.title ?? 'Confirm',
          confirmLabel: options?.confirmLabel ?? 'Confirm',
          cancelLabel: options?.cancelLabel ?? 'Cancel',
        });
      });
    },
    []
  );

  const handleClose = useCallback(() => {
    resolveRef.current?.(false);
    resolveRef.current = null;
    setState(null);
  }, []);

  const handleConfirm = useCallback(() => {
    resolveRef.current?.(true);
    resolveRef.current = null;
    setState(null);
  }, []);

  const ConfirmModal = state ? (
    <Modal
      isOpen={true}
      onClose={handleClose}
      title={state.title}
      size='small'
      footer={
        <>
          <Button variant='secondary' onClick={handleClose}>
            {state.cancelLabel}
          </Button>
          <Button onClick={handleConfirm} autoFocus>
            {state.confirmLabel}
          </Button>
        </>
      }
    >
      <p>{state.message}</p>
    </Modal>
  ) : null;

  return [confirm, ConfirmModal] as const;
}
