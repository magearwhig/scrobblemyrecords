import { render, screen } from '@testing-library/react';
import React from 'react';

import {
  Badge,
  StatusBadge,
  CountBadge,
} from '../../../../src/renderer/components/ui/Badge';

describe('Badge', () => {
  it('renders with default props', () => {
    render(<Badge>Default</Badge>);
    const badge = screen.getByText('Default').closest('.badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('badge', 'badge--default', 'badge--medium');
  });

  it('renders different variants', () => {
    const { rerender } = render(<Badge variant='success'>Success</Badge>);
    expect(screen.getByText('Success').closest('.badge')).toHaveClass(
      'badge--success'
    );

    rerender(<Badge variant='warning'>Warning</Badge>);
    expect(screen.getByText('Warning').closest('.badge')).toHaveClass(
      'badge--warning'
    );

    rerender(<Badge variant='danger'>Danger</Badge>);
    expect(screen.getByText('Danger').closest('.badge')).toHaveClass(
      'badge--danger'
    );

    rerender(<Badge variant='info'>Info</Badge>);
    expect(screen.getByText('Info').closest('.badge')).toHaveClass(
      'badge--info'
    );

    rerender(<Badge variant='primary'>Primary</Badge>);
    expect(screen.getByText('Primary').closest('.badge')).toHaveClass(
      'badge--primary'
    );

    rerender(<Badge variant='secondary'>Secondary</Badge>);
    expect(screen.getByText('Secondary').closest('.badge')).toHaveClass(
      'badge--secondary'
    );
  });

  it('renders different sizes', () => {
    const { rerender } = render(<Badge size='small'>Small</Badge>);
    expect(screen.getByText('Small').closest('.badge')).toHaveClass(
      'badge--small'
    );

    rerender(<Badge size='large'>Large</Badge>);
    expect(screen.getByText('Large').closest('.badge')).toHaveClass(
      'badge--large'
    );
  });

  it('renders with icon', () => {
    render(
      <Badge icon={<span data-testid='badge-icon'>★</span>}>With Icon</Badge>
    );
    expect(screen.getByTestId('badge-icon')).toBeInTheDocument();
  });

  it('renders as pill shape', () => {
    render(<Badge pill>Pill</Badge>);
    expect(screen.getByText('Pill').closest('.badge')).toHaveClass(
      'badge--pill'
    );
  });

  it('renders as outline style', () => {
    render(<Badge outline>Outline</Badge>);
    expect(screen.getByText('Outline').closest('.badge')).toHaveClass(
      'badge--outline'
    );
  });

  it('applies custom className', () => {
    render(<Badge className='custom-badge'>Custom</Badge>);
    expect(screen.getByText('Custom').closest('.badge')).toHaveClass(
      'custom-badge'
    );
  });
});

describe('StatusBadge', () => {
  it('renders pending status', () => {
    render(<StatusBadge status='pending' />);
    const badge = screen.getByText('Pending').closest('.badge');
    expect(badge).toHaveClass('badge--warning');
  });

  it('renders active status', () => {
    render(<StatusBadge status='active' />);
    const badge = screen.getByText('Active').closest('.badge');
    expect(badge).toHaveClass('badge--success');
  });

  it('renders inactive status', () => {
    render(<StatusBadge status='inactive' />);
    const badge = screen.getByText('Inactive').closest('.badge');
    expect(badge).toHaveClass('badge--secondary');
  });

  it('renders success status', () => {
    render(<StatusBadge status='success' />);
    const badge = screen.getByText('Success').closest('.badge');
    expect(badge).toHaveClass('badge--success');
  });

  it('renders error status', () => {
    render(<StatusBadge status='error' />);
    const badge = screen.getByText('Error').closest('.badge');
    expect(badge).toHaveClass('badge--danger');
  });

  it('renders custom label', () => {
    render(<StatusBadge status='pending' label='Custom Label' />);
    expect(screen.getByText('Custom Label')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<StatusBadge status='pending' className='custom-status' />);
    expect(screen.getByText('Pending').closest('.badge')).toHaveClass(
      'custom-status'
    );
  });
});

describe('CountBadge', () => {
  it('renders count', () => {
    render(<CountBadge count={5} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('hides zero by default', () => {
    const { container } = render(<CountBadge count={0} />);
    expect(container.querySelector('.badge')).not.toBeInTheDocument();
  });

  it('shows zero when showZero is true', () => {
    render(<CountBadge count={0} showZero />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders max count when exceeded', () => {
    render(<CountBadge count={150} max={99} />);
    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('renders exact count when at max', () => {
    render(<CountBadge count={99} max={99} />);
    expect(screen.getByText('99')).toBeInTheDocument();
  });

  it('renders with different variants', () => {
    render(<CountBadge count={5} variant='danger' />);
    expect(screen.getByText('5').closest('.badge')).toHaveClass(
      'badge--danger'
    );
  });

  it('applies custom className', () => {
    render(<CountBadge count={5} className='custom-count' />);
    expect(screen.getByText('5').closest('.badge')).toHaveClass('custom-count');
  });
});
