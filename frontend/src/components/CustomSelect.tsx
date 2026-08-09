import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Button } from './ui/Button';

export interface CustomSelectOption<T extends string | number> {
  value: T;
  label: string;
  description?: string;
}

interface CustomSelectProps<T extends string | number> {
  value: T;
  options: readonly CustomSelectOption<T>[];
  onChange: (value: T) => void;
  id?: string;
  ariaLabel?: string;
  className?: string;
  buttonClassName?: string;
  leadingContent?: ReactNode;
  style?: CSSProperties;
  disabled?: boolean;
  placeholder?: string;
  menuPlacement?: 'start' | 'end';
}

const getText = (value: string) => value.trim().toLocaleLowerCase();

export function CustomSelect<T extends string | number>({
  value,
  options,
  onChange,
  id,
  ariaLabel,
  className,
  buttonClassName,
  leadingContent,
  style,
  disabled = false,
  placeholder = '請選擇',
  menuPlacement = 'start',
}: CustomSelectProps<T>) {
  const generatedId = useId().replace(/:/g, '');
  const controlId = id ?? `custom-select-${generatedId}`;
  const listboxId = `${controlId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const typeaheadRef = useRef('');
  const typeaheadStartedAtRef = useRef(0);
  const typeaheadTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const optionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const selectedIndex = options.findIndex(option => option.value === value);
  const fallbackIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(fallbackIndex);
  const [verticalPlacement, setVerticalPlacement] = useState<'down' | 'up'>('down');

  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setActiveIndex(fallbackIndex);
    }
  }, [fallbackIndex, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const frame = window.requestAnimationFrame(() => {
      listboxRef.current?.focus();
      optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeIndex, isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) return;

    const updatePlacement = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const triggerRect = trigger.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const menuMaxHeight = Math.min(384, viewportHeight * 0.5);
      const estimatedMenuHeight = Math.min(
        menuMaxHeight,
        Math.max(44, options.length * 44 + Math.max(0, options.length - 1) * 4 + 14),
      );
      const spaceAbove = triggerRect.top;
      const spaceBelow = viewportHeight - triggerRect.bottom;
      const shouldOpenUp = spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow;

      setVerticalPlacement(shouldOpenUp ? 'up' : 'down');
    };

    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);

    return () => {
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', updatePlacement, true);
    };
  }, [isOpen, options.length]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  useEffect(() => () => {
    if (typeaheadTimerRef.current) {
      clearTimeout(typeaheadTimerRef.current);
    }
  }, []);

  const focusTrigger = () => {
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const closeMenu = (restoreFocus: boolean) => {
    setIsOpen(false);
    if (restoreFocus) focusTrigger();
  };

  const openMenu = (nextIndex = fallbackIndex) => {
    if (disabled || options.length === 0) return;
    setActiveIndex(Math.max(0, Math.min(nextIndex, options.length - 1)));
    setIsOpen(true);
  };

  const selectOption = (index: number) => {
    const option = options[index];
    if (!option) return;

    onChange(option.value);
    setActiveIndex(index);
    closeMenu(true);
  };

  const findTypeaheadMatch = (query: string, startIndex: number) => {
    if (!query || options.length === 0) return -1;

    for (let offset = 1; offset <= options.length; offset += 1) {
      const index = (startIndex + offset) % options.length;
      if (getText(options[index].label).startsWith(query)) return index;
    }

    return -1;
  };

  const handleTypeahead = (key: string) => {
    const now = Date.now();
    const nextQuery = typeaheadRef.current && now - typeaheadStartedAtRef.current < 700
      ? `${typeaheadRef.current}${key}`
      : key;

    typeaheadRef.current = getText(nextQuery);
    typeaheadStartedAtRef.current = now;
    const match = findTypeaheadMatch(typeaheadRef.current, activeIndex);

    if (match >= 0) setActiveIndex(match);

    if (typeaheadTimerRef.current) clearTimeout(typeaheadTimerRef.current);
    typeaheadTimerRef.current = setTimeout(() => {
      typeaheadRef.current = '';
    }, 700);
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openMenu();
      return;
    }

    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      closeMenu(true);
      return;
    }

    if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      openMenu();
      handleTypeahead(event.key);
    }
  };

  const handleListboxKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (options.length === 0) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(current => (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
      return;
    }

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActiveIndex(event.key === 'Home' ? 0 : options.length - 1);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectOption(activeIndex);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
      return;
    }

    if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      handleTypeahead(event.key);
    }
  };

  const handleRootBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.relatedTarget || !rootRef.current?.contains(event.relatedTarget as Node)) {
      setIsOpen(false);
    }
  };

  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const activeOptionId = options[activeIndex] ? `${listboxId}-option-${activeIndex}` : undefined;

  return (
    <div
      ref={rootRef}
      className={`ui-select-wrap custom-select ${menuPlacement === 'end' ? 'is-end' : ''} ${verticalPlacement === 'up' ? 'is-up' : ''} ${className ?? ''}`}
      style={style}
      data-open={isOpen ? 'true' : 'false'}
      onBlur={handleRootBlur}
    >
      <Button
        ref={triggerRef}
        id={controlId}
        type="button"
        variant="secondary"
        className={`ui-select-trigger custom-select__trigger ${buttonClassName ?? ''}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        disabled={disabled}
        onClick={() => (isOpen ? closeMenu(true) : openMenu())}
        onKeyDown={handleTriggerKeyDown}
      >
        {leadingContent && (
          <span className="custom-select__leading" aria-hidden="true">
            {leadingContent}
          </span>
        )}
        <span className={`custom-select__value ${selectedOption ? '' : 'is-placeholder'}`}>
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronDown className="ui-select-icon" aria-hidden="true" strokeWidth={2} />
      </Button>

      {isOpen && (
        <div
          ref={listboxRef}
          id={listboxId}
          className="custom-select__menu"
          role="listbox"
          tabIndex={0}
          aria-label={ariaLabel}
          aria-activedescendant={activeOptionId}
          onKeyDown={handleListboxKeyDown}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;

            return (
              <div
                key={`${String(option.value)}-${index}`}
                ref={element => { optionRefs.current[index] = element; }}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={isSelected}
                className="custom-select__option"
                data-active={isActive ? 'true' : 'false'}
                data-selected={isSelected ? 'true' : 'false'}
                onMouseDown={event => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectOption(index)}
              >
                <span className="custom-select__option-copy">
                  <span className="custom-select__option-label">{option.label}</span>
                  {option.description && <span className="custom-select__option-description">{option.description}</span>}
                </span>
                <span className="custom-select__option-check" aria-hidden="true">
                  {isSelected && <Check strokeWidth={2.5} />}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
