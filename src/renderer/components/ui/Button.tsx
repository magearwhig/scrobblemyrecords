import React from 'react';

import './Button.css';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'success'
  | 'outline'
  | 'ghost';

export type ButtonSize = 'small' | 'medium' | 'large';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<globalThis.HTMLButtonElement> {
  /**
   * The visual style variant of the button.
   */
  variant?: ButtonVariant;
  /**
   * The size of the button.
   */
  size?: ButtonSize;
  /**
   * Whether the button should take full width.
   */
  fullWidth?: boolean;
  /**
   * Whether to show a loading state.
   */
  loading?: boolean;
  /**
   * Icon to display before the label.
   */
  iconLeft?: React.ReactNode;
  /**
   * Icon to display after the label.
   */
  iconRight?: React.ReactNode;
  /**
   * Additional class names.
   */
  className?: string;
  /**
   * Button content.
   */
  children?: React.ReactNode;
}

/**
 * A reusable button component with multiple variants and sizes.
 */
export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'medium',
  fullWidth = false,
  loading = false,
  iconLeft,
  iconRight,
  className = '',
  children,
  disabled,
  ...props
}) => {
  const classNames = [
    'button',
    `button--${variant}`,
    `button--${size}`,
    fullWidth && 'button--full-width',
    loading && 'button--loading',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={classNames} disabled={disabled || loading} {...props}>
      {loading && <span className='button-spinner' aria-hidden='true' />}
      {!loading && iconLeft && (
        <span className='button-icon button-icon--left'>{iconLeft}</span>
      )}
      {children && <span className='button-label'>{children}</span>}
      {!loading && iconRight && (
        <span className='button-icon button-icon--right'>{iconRight}</span>
      )}
    </button>
  );
};

/**
 * An icon-only button variant.
 */
export interface IconButtonProps
  extends Omit<ButtonProps, 'iconLeft' | 'iconRight' | 'fullWidth'> {
  /**
   * The icon to display.
   */
  icon: React.ReactNode;
  /**
   * Accessible label for the button.
   */
  'aria-label': string;
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  variant = 'ghost',
  size = 'medium',
  className = '',
  ...props
}) => {
  const classNames = [
    'button',
    'button--icon-only',
    `button--${variant}`,
    `button--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={classNames} {...props}>
      {icon}
    </button>
  );
};

export default Button;
