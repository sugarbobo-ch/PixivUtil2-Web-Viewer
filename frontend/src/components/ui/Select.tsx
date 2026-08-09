import React, { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ControlSize } from './Input';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Shared form-control density. */
  controlSize?: ControlSize;
  /** Layout classes for the wrapper that owns the chevron. */
  wrapperClassName?: string;
}

const cx = (...classNames: Array<string | false | null | undefined>) => (
  classNames.filter(Boolean).join(' ')
);

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    className,
    controlSize = 'md',
    wrapperClassName,
    style,
    children,
    ...selectProps
  },
  ref,
) {
  return (
    <span className={cx('ui-select-wrap', wrapperClassName)} style={style}>
      <select
        {...selectProps}
        ref={ref}
        className={cx('ui-select', className)}
        data-size={controlSize}
      >
        {children}
      </select>
      <ChevronDown className="ui-select-icon" aria-hidden="true" strokeWidth={2} />
    </span>
  );
});
