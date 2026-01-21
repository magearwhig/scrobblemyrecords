import { render, screen } from '@testing-library/react';
import React from 'react';

import {
  ProgressBar,
  MultiProgressBar,
} from '../../../../src/renderer/components/ui/ProgressBar';

describe('ProgressBar', () => {
  it('renders with default props', () => {
    render(<ProgressBar value={50} />);
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toBeInTheDocument();
    expect(progressbar).toHaveAttribute('aria-valuenow', '50');
    expect(progressbar).toHaveAttribute('aria-valuemin', '0');
    expect(progressbar).toHaveAttribute('aria-valuemax', '100');
  });

  it('passes aria-valuenow as provided value', () => {
    const { rerender } = render(<ProgressBar value={-10} />);
    // Value is passed as-is to aria, but percentage is clamped for visual
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuenow', '-10');

    rerender(<ProgressBar value={150} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '150'
    );
  });

  it('shows label when showLabel is true', () => {
    render(<ProgressBar value={75} showLabel />);
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('hides label by default', () => {
    render(<ProgressBar value={75} />);
    expect(screen.queryByText('75%')).not.toBeInTheDocument();
  });

  it('renders custom label', () => {
    render(<ProgressBar value={50} showLabel label='Loading...' />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders different sizes', () => {
    const { rerender, container } = render(
      <ProgressBar value={50} size='small' />
    );
    expect(container.querySelector('.progress-bar--small')).toBeInTheDocument();

    rerender(<ProgressBar value={50} size='large' />);
    expect(container.querySelector('.progress-bar--large')).toBeInTheDocument();
  });

  it('renders different variants', () => {
    const { rerender, container } = render(
      <ProgressBar value={50} variant='success' />
    );
    expect(
      container.querySelector('.progress-bar--success')
    ).toBeInTheDocument();

    rerender(<ProgressBar value={50} variant='warning' />);
    expect(
      container.querySelector('.progress-bar--warning')
    ).toBeInTheDocument();

    rerender(<ProgressBar value={50} variant='danger' />);
    expect(
      container.querySelector('.progress-bar--danger')
    ).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <ProgressBar value={50} className='custom-progress' />
    );
    expect(container.querySelector('.custom-progress')).toBeInTheDocument();
  });

  it('sets correct width on fill element', () => {
    const { container } = render(<ProgressBar value={75} />);
    const fill = container.querySelector('.progress-bar-fill');
    expect(fill).toHaveStyle({ width: '75%' });
  });

  it('renders with max value', () => {
    render(<ProgressBar value={50} max={200} />);
    // 50 out of 200 = 25%
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuemax', '200');
  });

  it('renders animated style', () => {
    const { container } = render(<ProgressBar value={50} animated />);
    expect(
      container.querySelector('.progress-bar--animated')
    ).toBeInTheDocument();
  });

  it('renders striped style', () => {
    const { container } = render(<ProgressBar value={50} striped />);
    expect(
      container.querySelector('.progress-bar--striped')
    ).toBeInTheDocument();
  });

  it('renders indeterminate style', () => {
    const { container } = render(<ProgressBar value={50} indeterminate />);
    expect(
      container.querySelector('.progress-bar--indeterminate')
    ).toBeInTheDocument();
  });

  it('hides label in indeterminate mode', () => {
    render(<ProgressBar value={50} showLabel indeterminate />);
    expect(screen.queryByText('50%')).not.toBeInTheDocument();
  });
});

describe('MultiProgressBar', () => {
  it('renders multiple segments', () => {
    const segments = [
      { value: 30, variant: 'success' as const },
      { value: 20, variant: 'warning' as const },
      { value: 10, variant: 'danger' as const },
    ];
    const { container } = render(<MultiProgressBar segments={segments} />);

    const fills = container.querySelectorAll('.progress-bar-fill');
    expect(fills).toHaveLength(3);
  });

  it('renders segment with label as title', () => {
    const segments = [
      { value: 30, variant: 'success' as const, label: '30% Done' },
      { value: 20, variant: 'warning' as const },
    ];
    const { container } = render(<MultiProgressBar segments={segments} />);
    const fill = container.querySelector('.progress-bar-fill');
    expect(fill).toHaveAttribute('title', '30% Done');
  });

  it('applies custom className', () => {
    const segments = [{ value: 50, variant: 'primary' as const }];
    const { container } = render(
      <MultiProgressBar segments={segments} className='custom-multi' />
    );
    expect(container.querySelector('.custom-multi')).toBeInTheDocument();
  });

  it('renders different sizes', () => {
    const segments = [{ value: 50, variant: 'primary' as const }];
    const { container } = render(
      <MultiProgressBar segments={segments} size='large' />
    );
    expect(container.querySelector('.progress-bar--large')).toBeInTheDocument();
  });

  it('applies correct variant classes to segments', () => {
    const segments = [
      { value: 50, variant: 'success' as const },
      { value: 30, variant: 'danger' as const },
    ];
    const { container } = render(<MultiProgressBar segments={segments} />);
    expect(
      container.querySelector('.progress-bar-fill--success')
    ).toBeInTheDocument();
    expect(
      container.querySelector('.progress-bar-fill--danger')
    ).toBeInTheDocument();
  });
});
