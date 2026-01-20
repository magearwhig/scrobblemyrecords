import React from 'react';

import './ProgressBar.css';

export type ProgressBarVariant = 'primary' | 'success' | 'warning' | 'danger';
export type ProgressBarSize = 'small' | 'medium' | 'large';

export interface ProgressBarProps {
  /**
   * Current progress value (0-100).
   */
  value: number;
  /**
   * Maximum value (defaults to 100).
   */
  max?: number;
  /**
   * The visual style variant.
   */
  variant?: ProgressBarVariant;
  /**
   * The size of the progress bar.
   */
  size?: ProgressBarSize;
  /**
   * Whether to show the percentage label.
   */
  showLabel?: boolean;
  /**
   * Custom label text (overrides percentage).
   */
  label?: string;
  /**
   * Whether to show animation.
   */
  animated?: boolean;
  /**
   * Whether to show striped pattern.
   */
  striped?: boolean;
  /**
   * Whether progress is indeterminate (unknown progress).
   */
  indeterminate?: boolean;
  /**
   * Additional class names.
   */
  className?: string;
}

/**
 * A progress bar component for displaying progress or loading states.
 */
export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  variant = 'primary',
  size = 'medium',
  showLabel = false,
  label,
  animated = false,
  striped = false,
  indeterminate = false,
  className = '',
}) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const displayLabel = label ?? `${Math.round(percentage)}%`;

  const classNames = [
    'progress-bar',
    `progress-bar--${variant}`,
    `progress-bar--${size}`,
    animated && 'progress-bar--animated',
    striped && 'progress-bar--striped',
    indeterminate && 'progress-bar--indeterminate',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classNames}
      role='progressbar'
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div className='progress-bar-track'>
        <div
          className='progress-bar-fill'
          style={{ width: indeterminate ? '100%' : `${percentage}%` }}
        />
      </div>
      {showLabel && !indeterminate && (
        <span className='progress-bar-label'>{displayLabel}</span>
      )}
    </div>
  );
};

/**
 * A circular progress indicator.
 */
export interface CircularProgressProps {
  /**
   * Current progress value (0-100).
   */
  value?: number;
  /**
   * Maximum value (defaults to 100).
   */
  max?: number;
  /**
   * The visual style variant.
   */
  variant?: ProgressBarVariant;
  /**
   * Size in pixels.
   */
  size?: number;
  /**
   * Stroke width in pixels.
   */
  strokeWidth?: number;
  /**
   * Whether to show the percentage label.
   */
  showLabel?: boolean;
  /**
   * Whether progress is indeterminate (spinning).
   */
  indeterminate?: boolean;
  /**
   * Additional class names.
   */
  className?: string;
}

export const CircularProgress: React.FC<CircularProgressProps> = ({
  value = 0,
  max = 100,
  variant = 'primary',
  size = 40,
  strokeWidth = 4,
  showLabel = false,
  indeterminate = false,
  className = '',
}) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  const classNames = [
    'circular-progress',
    `circular-progress--${variant}`,
    indeterminate && 'circular-progress--indeterminate',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classNames}
      style={{ width: size, height: size }}
      role='progressbar'
      aria-valuenow={indeterminate ? undefined : value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <svg viewBox={`0 0 ${size} ${size}`}>
        <circle
          className='circular-progress-track'
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
        />
        <circle
          className='circular-progress-fill'
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={indeterminate ? circumference * 0.75 : offset}
        />
      </svg>
      {showLabel && !indeterminate && (
        <span className='circular-progress-label'>
          {Math.round(percentage)}%
        </span>
      )}
    </div>
  );
};

/**
 * A multi-segment progress bar for showing multiple values.
 */
export interface ProgressSegment {
  value: number;
  variant: ProgressBarVariant;
  label?: string;
}

export interface MultiProgressBarProps {
  /**
   * Array of progress segments.
   */
  segments: ProgressSegment[];
  /**
   * Maximum value (defaults to 100).
   */
  max?: number;
  /**
   * The size of the progress bar.
   */
  size?: ProgressBarSize;
  /**
   * Additional class names.
   */
  className?: string;
}

export const MultiProgressBar: React.FC<MultiProgressBarProps> = ({
  segments,
  max = 100,
  size = 'medium',
  className = '',
}) => {
  const total = segments.reduce((sum, seg) => sum + seg.value, 0);
  const normalizedMax = Math.max(max, total);

  const classNames = [
    'progress-bar',
    'progress-bar--multi',
    `progress-bar--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classNames} role='progressbar'>
      <div className='progress-bar-track'>
        {segments.map((segment, index) => (
          <div
            key={index}
            className={`progress-bar-fill progress-bar-fill--${segment.variant}`}
            style={{ width: `${(segment.value / normalizedMax) * 100}%` }}
            title={segment.label}
          />
        ))}
      </div>
    </div>
  );
};

export default ProgressBar;
