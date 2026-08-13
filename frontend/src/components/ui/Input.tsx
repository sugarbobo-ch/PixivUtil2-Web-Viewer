import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './Button';
import { useI18n } from '../../i18n';

export type ControlSize = 'xs' | 'sm' | 'md' | 'lg';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Shared form-control density. */
  controlSize?: ControlSize;
  /** Optional decorative icon rendered inside the leading edge of the field. */
  leadingIcon?: React.ReactNode;
  /** Classes applied to the wrapper created when leadingIcon is present. */
  wrapperClassName?: string;
  /** Enables the trailing clear button when the field contains a value. */
  clearable?: boolean;
  /** Clears the value owned by the parent when the clear button is activated. */
  onClear?: () => void;
  /** Accessible name for the trailing clear button. */
  clearButtonLabel?: string;
}

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Shared form-control density. */
  controlSize?: ControlSize;
}

const cx = (...classNames: Array<string | false | null | undefined>) => (
  classNames.filter(Boolean).join(' ')
);

const getInputValue = (value: React.InputHTMLAttributes<HTMLInputElement>['value'] | undefined) => (
  value == null ? '' : Array.isArray(value) ? value.join('') : String(value)
);

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    className,
    controlSize = 'md',
    leadingIcon,
    wrapperClassName,
    clearable = false,
    onClear,
    clearButtonLabel,
    onChange,
    value,
    defaultValue,
    disabled,
    ...inputProps
  },
  ref,
) {
  const { t } = useI18n();
  const resolvedClearButtonLabel = clearButtonLabel ?? t('common.clearContent');
  const inputRef = useRef<HTMLInputElement>(null);
  const isControlled = value !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState(() => getInputValue(defaultValue));
  const hasValue = getInputValue(isControlled ? value : uncontrolledValue).length > 0;

  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!isControlled) setUncontrolledValue(event.currentTarget.value);
    onChange?.(event);
  };

  const handleClear = () => {
    if (!isControlled) {
      setUncontrolledValue('');
      if (inputRef.current) inputRef.current.value = '';
    }
    onClear?.();
    inputRef.current?.focus();
  };

  const input = (
    <input
      {...inputProps}
      ref={inputRef}
      className={cx('ui-input', className)}
      data-size={controlSize}
      disabled={disabled}
      defaultValue={defaultValue}
      onChange={handleChange}
      value={value}
    />
  );

  if (!leadingIcon && !clearable) return input;

  return (
    <span
      className={cx(
        'ui-input-wrap',
        Boolean(leadingIcon) && 'ui-input-wrap--has-leading-icon',
        clearable && 'ui-input-wrap--clearable',
        wrapperClassName,
      )}
      data-size={controlSize}
      data-disabled={disabled ? 'true' : undefined}
    >
      {leadingIcon && (
        <span className="ui-input__leading-icon" aria-hidden="true">
          {leadingIcon}
        </span>
      )}
      {input}
      {clearable && hasValue && (
        <IconButton
          type="button"
          size="xs"
          variant="ghost"
          className="ui-input__clear-button"
          aria-label={resolvedClearButtonLabel}
          title={resolvedClearButtonLabel}
          disabled={disabled}
          onMouseDown={event => event.preventDefault()}
          onClick={handleClear}
        >
          <X aria-hidden="true" />
        </IconButton>
      )}
    </span>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, controlSize = 'md', ...textareaProps },
  ref,
) {
  return (
    <textarea
      {...textareaProps}
      ref={ref}
      className={cx('ui-textarea', className)}
      data-size={controlSize}
    />
  );
});
