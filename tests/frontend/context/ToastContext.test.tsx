import { renderHook, act } from '@testing-library/react';
import React, { ReactNode } from 'react';

import {
  ToastProvider,
  useToast,
} from '../../../src/renderer/context/ToastContext';

const wrapper = ({ children }: { children: ReactNode }) => (
  <ToastProvider>{children}</ToastProvider>
);

describe('ToastContext', () => {
  describe('useToast', () => {
    it('throws when used outside ToastProvider', () => {
      // Suppress console.error for expected error
      const spy = jest.spyOn(console, 'error').mockImplementation();
      expect(() => renderHook(() => useToast())).toThrow(
        'useToast must be used within a ToastProvider'
      );
      spy.mockRestore();
    });

    it('starts with empty toasts array', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      expect(result.current.toasts).toEqual([]);
    });
  });

  describe('showToast', () => {
    it('adds a success toast', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.showToast('success', 'Operation completed');
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].type).toBe('success');
      expect(result.current.toasts[0].message).toBe('Operation completed');
    });

    it('adds an error toast', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.showToast('error', 'Something went wrong');
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].type).toBe('error');
    });

    it('adds toast with custom duration', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.showToast('info', 'Custom duration', { duration: 8000 });
      });

      expect(result.current.toasts[0].duration).toBe(8000);
    });

    it('uses default 4000ms duration when not specified', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.showToast('info', 'Default duration');
      });

      expect(result.current.toasts[0].duration).toBe(4000);
    });

    it('adds toast with action button', () => {
      const { result } = renderHook(() => useToast(), { wrapper });
      const onClick = jest.fn();

      act(() => {
        result.current.showToast('warning', 'Undo available', {
          action: { label: 'Undo', onClick },
        });
      });

      expect(result.current.toasts[0].action).toEqual({
        label: 'Undo',
        onClick,
      });
    });

    it('stacks multiple toasts', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.showToast('success', 'First');
        result.current.showToast('error', 'Second');
        result.current.showToast('info', 'Third');
      });

      expect(result.current.toasts).toHaveLength(3);
      expect(result.current.toasts[0].message).toBe('First');
      expect(result.current.toasts[2].message).toBe('Third');
    });

    it('assigns unique IDs to each toast', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.showToast('success', 'First');
        result.current.showToast('success', 'Second');
      });

      expect(result.current.toasts[0].id).not.toBe(result.current.toasts[1].id);
    });
  });

  describe('removeToast', () => {
    it('removes a toast by ID', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.showToast('success', 'Will be removed');
      });

      const toastId = result.current.toasts[0].id;

      act(() => {
        result.current.removeToast(toastId);
      });

      expect(result.current.toasts).toHaveLength(0);
    });

    it('only removes the specified toast', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.showToast('success', 'Keep this');
        result.current.showToast('error', 'Remove this');
      });

      const removeId = result.current.toasts[1].id;

      act(() => {
        result.current.removeToast(removeId);
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].message).toBe('Keep this');
    });

    it('handles removing non-existent toast gracefully', () => {
      const { result } = renderHook(() => useToast(), { wrapper });

      act(() => {
        result.current.showToast('info', 'Existing');
      });

      act(() => {
        result.current.removeToast('non-existent-id');
      });

      expect(result.current.toasts).toHaveLength(1);
    });
  });
});
