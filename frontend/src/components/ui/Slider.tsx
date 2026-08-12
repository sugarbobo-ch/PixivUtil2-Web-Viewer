import React, { forwardRef, useId } from 'react';
import type { ControlSize } from './Input';

export interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'className' | 'style'> {
  /** Shared form-control density. */
  controlSize?: ControlSize;
  /** Classes applied to the slider track wrapper. */
  className?: string;
  /** Classes applied to the native range input. */
  inputClassName?: string;
  /** Inline styles applied to the slider track wrapper. */
  style?: React.CSSProperties;
}

const cx = (...classNames: Array<string | false | null | undefined>) => (
  classNames.filter(Boolean).join(' ')
);

const getNumericValue = (value: React.InputHTMLAttributes<HTMLInputElement>['value'] | undefined) => {
  if (Array.isArray(value)) return Number(value[0]);
  return Number(value);
};

export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider(
  {
    className,
    inputClassName,
    controlSize = 'md',
    min = 0,
    max = 100,
    value,
    defaultValue,
    id,
    disabled,
    style,
    ...inputProps
  },
  ref,
) {
  const minValue = getNumericValue(min);
  const maxValue = getNumericValue(max);
  const fallbackValue = Number.isFinite(minValue) ? minValue : 0;
  const currentValue = getNumericValue(value ?? defaultValue);
  const safeMin = Number.isFinite(minValue) ? minValue : 0;
  const safeMax = Number.isFinite(maxValue) && maxValue > safeMin ? maxValue : safeMin + 1;
  const safeValue = Number.isFinite(currentValue) ? currentValue : fallbackValue;
  const progress = Math.min(100, Math.max(0, ((safeValue - safeMin) / (safeMax - safeMin)) * 100));
  const sliderStyle = {
    ...style,
    '--ui-slider-progress': `${progress}%`,
  } as React.CSSProperties;

  return (
    <span
      className={cx('ui-slider', className)}
      data-size={controlSize}
      data-disabled={disabled ? 'true' : undefined}
      style={sliderStyle}
    >
      <span className="ui-slider__track" aria-hidden="true">
        <span className="ui-slider__fill" />
      </span>
      <input
        {...inputProps}
        ref={ref}
        id={id}
        type="range"
        min={min}
        max={max}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        className={cx('ui-slider__input', inputClassName)}
      />
    </span>
  );
});

export interface SliderFieldProps extends Omit<SliderProps, 'className'> {
  /** Visible label announced by the native range input. */
  label: React.ReactNode;
  /** Value shown on the same centerline as the slider track. */
  valueLabel: React.ReactNode;
  /** Optional icon displayed before the label. */
  icon?: React.ReactNode;
  /** Optional supporting text rendered below the control row. */
  description?: React.ReactNode;
  /** Classes applied to the field wrapper. */
  className?: string;
  /** Classes applied to the nested Slider primitive. */
  sliderClassName?: string;
}

export const SliderField = forwardRef<HTMLInputElement, SliderFieldProps>(function SliderField(
  {
    label,
    valueLabel,
    icon,
    description,
    className,
    sliderClassName,
    id,
    ...sliderProps
  },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? `ui-slider-${generatedId}`;
  const descriptionId = description ? `${fieldId}-description` : undefined;
  const describedBy = [sliderProps['aria-describedby'], descriptionId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cx('ui-slider-field', className)}>
      <label className="ui-slider-field__label" htmlFor={fieldId}>
        {icon && <span className="ui-slider-field__icon" aria-hidden="true">{icon}</span>}
        <span className="ui-slider-field__label-text">{label}</span>
      </label>
      <Slider
        {...sliderProps}
        ref={ref}
        id={fieldId}
        className={sliderClassName}
        aria-describedby={describedBy}
      />
      <output className="ui-slider-field__value" htmlFor={fieldId} aria-live="polite">
        {valueLabel}
      </output>
      {description && (
        <p id={descriptionId} className="ui-slider-field__description">
          {description}
        </p>
      )}
    </div>
  );
});
