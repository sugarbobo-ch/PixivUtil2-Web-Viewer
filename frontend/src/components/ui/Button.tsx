import React, { forwardRef } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'plain' | 'success' | 'danger';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';
export type ButtonShape = 'control' | 'card';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Semantic intent. Do not use a color utility class to express intent. */
  variant?: ButtonVariant;
  /** Shared control height. IconButton uses the same size scale. */
  size?: ButtonSize;
  /** Makes the control fill its available inline size. */
  fullWidth?: boolean;
  /** Internal primitive flag used by IconButton. */
  iconOnly?: boolean;
  /** Shared geometry for standard actions and large option cards. */
  shape?: ButtonShape;
}

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'iconOnly'> {
  children: React.ReactNode;
  /** Icon-only controls must always expose their action to assistive technology. */
  'aria-label': string;
}

const cx = (...classNames: Array<string | false | null | undefined>) => (
  classNames.filter(Boolean).join(' ')
);

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    type = 'button',
    variant = 'secondary',
    size = 'md',
    fullWidth = false,
    iconOnly = false,
    shape = 'control',
    ...buttonProps
  },
  ref,
) {
  return (
    <button
      {...buttonProps}
      ref={ref}
      type={type}
      className={cx('ui-button', iconOnly && 'ui-button--icon', className)}
      data-shape={shape}
      data-variant={variant}
      data-size={size}
      data-full-width={fullWidth ? 'true' : undefined}
    />
  );
});

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { children, className, size = 'md', variant = 'ghost', 'aria-label': ariaLabel, ...buttonProps },
  ref,
) {
  return (
    <Button
      {...buttonProps}
      ref={ref}
      aria-label={ariaLabel}
      variant={variant}
      size={size}
      iconOnly
      className={className}
    >
      {children}
    </Button>
  );
});
