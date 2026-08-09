import React, { forwardRef } from 'react';

export type BadgeVariant = 'neutral' | 'primary' | 'hud' | 'surface' | 'success' | 'danger';
export type BadgeSize = 'xs' | 'sm' | 'md';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Semantic appearance. The surface is supplied by the surrounding theme scope. */
  variant?: BadgeVariant;
  /** Shared badge density. */
  size?: BadgeSize;
  /** Makes a badge with only an icon circular instead of pill-shaped. */
  iconOnly?: boolean;
}

const cx = (...classNames: Array<string | false | null | undefined>) => (
  classNames.filter(Boolean).join(' ')
);

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  {
    className,
    variant = 'neutral',
    size = 'sm',
    iconOnly = false,
    ...badgeProps
  },
  ref,
) {
  return (
    <span
      {...badgeProps}
      ref={ref}
      className={cx('ui-badge', iconOnly && 'ui-badge--icon', className)}
      data-variant={variant}
      data-size={size}
    />
  );
});
