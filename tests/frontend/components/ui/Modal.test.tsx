import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import {
  Modal,
  ModalFooter,
  ModalSection,
} from '../../../../src/renderer/components/ui/Modal';

describe('Modal', () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when not open', () => {
    const { container } = render(
      <Modal isOpen={false} onClose={mockOnClose}>
        Content
      </Modal>
    );
    expect(container.querySelector('.modal-overlay')).not.toBeInTheDocument();
  });

  it('renders when open', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose}>
        Modal Content
      </Modal>
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Modal Content')).toBeInTheDocument();
  });

  it('renders with title', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose} title='Test Title'>
        Content
      </Modal>
    );
    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });

  it('renders close button by default', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose}>
        Content
      </Modal>
    );
    expect(screen.getByLabelText('Close modal')).toBeInTheDocument();
  });

  it('hides close button when showCloseButton is false', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose} showCloseButton={false}>
        Content
      </Modal>
    );
    expect(screen.queryByLabelText('Close modal')).not.toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose}>
        Content
      </Modal>
    );
    fireEvent.click(screen.getByLabelText('Close modal'));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when overlay is clicked', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose}>
        Content
      </Modal>
    );
    const overlay = document.querySelector('.modal-overlay');
    fireEvent.click(overlay!);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when clicking inside modal', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose}>
        Content
      </Modal>
    );
    fireEvent.click(screen.getByRole('dialog'));
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('does not close on overlay click when closeOnOverlayClick is false', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose} closeOnOverlayClick={false}>
        Content
      </Modal>
    );
    const overlay = document.querySelector('.modal-overlay');
    fireEvent.click(overlay!);
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('closes on Escape key press', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose}>
        Content
      </Modal>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on Escape when closeOnEscape is false', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose} closeOnEscape={false}>
        Content
      </Modal>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('renders different sizes', () => {
    const { rerender } = render(
      <Modal isOpen={true} onClose={mockOnClose} size='small'>
        Content
      </Modal>
    );
    expect(screen.getByRole('dialog')).toHaveClass('modal--small');

    rerender(
      <Modal isOpen={true} onClose={mockOnClose} size='large'>
        Content
      </Modal>
    );
    expect(screen.getByRole('dialog')).toHaveClass('modal--large');

    rerender(
      <Modal isOpen={true} onClose={mockOnClose} size='fullscreen'>
        Content
      </Modal>
    );
    expect(screen.getByRole('dialog')).toHaveClass('modal--fullscreen');
  });

  it('shows loading state', () => {
    const { container } = render(
      <Modal isOpen={true} onClose={mockOnClose} loading>
        Content
      </Modal>
    );
    expect(screen.getByRole('dialog')).toHaveClass('modal--loading');
    expect(
      container.querySelector('.modal-loading-overlay')
    ).toBeInTheDocument();
    expect(container.querySelector('.modal-spinner')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose} className='custom-modal'>
        Content
      </Modal>
    );
    expect(screen.getByRole('dialog')).toHaveClass('custom-modal');
  });

  it('sets aria-labelledby when title is provided', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose} title='My Title'>
        Content
      </Modal>
    );
    expect(screen.getByRole('dialog')).toHaveAttribute(
      'aria-labelledby',
      'modal-title'
    );
  });

  it('does not set aria-labelledby when no title', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose}>
        Content
      </Modal>
    );
    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-labelledby');
  });

  it('prevents body scroll when open', () => {
    const { unmount } = render(
      <Modal isOpen={true} onClose={mockOnClose}>
        Content
      </Modal>
    );
    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('removes event listener on unmount', () => {
    const removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');
    const { unmount } = render(
      <Modal isOpen={true} onClose={mockOnClose}>
        Content
      </Modal>
    );
    unmount();
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'keydown',
      expect.any(Function)
    );
    removeEventListenerSpy.mockRestore();
  });
});

describe('ModalFooter', () => {
  it('renders children', () => {
    render(
      <ModalFooter>
        <button>Save</button>
        <button>Cancel</button>
      </ModalFooter>
    );
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('applies modal-footer class', () => {
    const { container } = render(<ModalFooter>Content</ModalFooter>);
    expect(container.querySelector('.modal-footer')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <ModalFooter className='custom-footer'>Content</ModalFooter>
    );
    expect(
      container.querySelector('.modal-footer.custom-footer')
    ).toBeInTheDocument();
  });
});

describe('ModalSection', () => {
  it('renders children', () => {
    render(<ModalSection>Section Content</ModalSection>);
    expect(screen.getByText('Section Content')).toBeInTheDocument();
  });

  it('renders with title', () => {
    render(<ModalSection title='Section Title'>Content</ModalSection>);
    expect(screen.getByText('Section Title')).toBeInTheDocument();
  });

  it('does not render title element when no title provided', () => {
    const { container } = render(<ModalSection>Content</ModalSection>);
    expect(
      container.querySelector('.modal-section-title')
    ).not.toBeInTheDocument();
  });

  it('applies modal-section class', () => {
    const { container } = render(<ModalSection>Content</ModalSection>);
    expect(container.querySelector('.modal-section')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <ModalSection className='custom-section'>Content</ModalSection>
    );
    expect(
      container.querySelector('.modal-section.custom-section')
    ).toBeInTheDocument();
  });
});
