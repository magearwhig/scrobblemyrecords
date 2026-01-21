import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import {
  Button,
  IconButton,
} from '../../../../src/renderer/components/ui/Button';

describe('Button', () => {
  it('renders with default props', () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole('button', { name: 'Click me' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('button', 'button--primary', 'button--medium');
  });

  it('renders different variants', () => {
    const { rerender } = render(<Button variant='secondary'>Secondary</Button>);
    expect(screen.getByRole('button')).toHaveClass('button--secondary');

    rerender(<Button variant='danger'>Danger</Button>);
    expect(screen.getByRole('button')).toHaveClass('button--danger');

    rerender(<Button variant='success'>Success</Button>);
    expect(screen.getByRole('button')).toHaveClass('button--success');

    rerender(<Button variant='outline'>Outline</Button>);
    expect(screen.getByRole('button')).toHaveClass('button--outline');

    rerender(<Button variant='ghost'>Ghost</Button>);
    expect(screen.getByRole('button')).toHaveClass('button--ghost');
  });

  it('renders different sizes', () => {
    const { rerender } = render(<Button size='small'>Small</Button>);
    expect(screen.getByRole('button')).toHaveClass('button--small');

    rerender(<Button size='large'>Large</Button>);
    expect(screen.getByRole('button')).toHaveClass('button--large');
  });

  it('renders full width when specified', () => {
    render(<Button fullWidth>Full Width</Button>);
    expect(screen.getByRole('button')).toHaveClass('button--full-width');
  });

  it('shows loading state', () => {
    render(<Button loading>Loading</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('button--loading');
    expect(button).toBeDisabled();
    expect(button.querySelector('.button-spinner')).toBeInTheDocument();
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('calls onClick when clicked', () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick when disabled', () => {
    const handleClick = jest.fn();
    render(
      <Button onClick={handleClick} disabled>
        Click me
      </Button>
    );
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('does not call onClick when loading', () => {
    const handleClick = jest.fn();
    render(
      <Button onClick={handleClick} loading>
        Click me
      </Button>
    );
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('renders left icon', () => {
    render(
      <Button iconLeft={<span data-testid='left-icon'>←</span>}>
        With Icon
      </Button>
    );
    expect(screen.getByTestId('left-icon')).toBeInTheDocument();
    expect(
      screen.getByRole('button').querySelector('.button-icon--left')
    ).toBeInTheDocument();
  });

  it('renders right icon', () => {
    render(
      <Button iconRight={<span data-testid='right-icon'>→</span>}>
        With Icon
      </Button>
    );
    expect(screen.getByTestId('right-icon')).toBeInTheDocument();
    expect(
      screen.getByRole('button').querySelector('.button-icon--right')
    ).toBeInTheDocument();
  });

  it('hides icons when loading', () => {
    render(
      <Button
        loading
        iconLeft={<span data-testid='left-icon'>←</span>}
        iconRight={<span data-testid='right-icon'>→</span>}
      >
        Loading
      </Button>
    );
    expect(screen.queryByTestId('left-icon')).not.toBeInTheDocument();
    expect(screen.queryByTestId('right-icon')).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<Button className='custom-class'>Custom</Button>);
    expect(screen.getByRole('button')).toHaveClass('custom-class');
  });
});

describe('IconButton', () => {
  it('renders with icon', () => {
    render(<IconButton icon={<span>★</span>} aria-label='Star' />);
    const button = screen.getByRole('button', { name: 'Star' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('button--icon-only');
  });

  it('defaults to ghost variant', () => {
    render(<IconButton icon={<span>★</span>} aria-label='Star' />);
    expect(screen.getByRole('button')).toHaveClass('button--ghost');
  });

  it('renders with different variants', () => {
    render(
      <IconButton icon={<span>★</span>} aria-label='Star' variant='primary' />
    );
    expect(screen.getByRole('button')).toHaveClass('button--primary');
  });

  it('renders with different sizes', () => {
    render(<IconButton icon={<span>★</span>} aria-label='Star' size='small' />);
    expect(screen.getByRole('button')).toHaveClass('button--small');
  });

  it('applies custom className', () => {
    render(
      <IconButton
        icon={<span>★</span>}
        aria-label='Star'
        className='custom-icon-btn'
      />
    );
    expect(screen.getByRole('button')).toHaveClass('custom-icon-btn');
  });
});
