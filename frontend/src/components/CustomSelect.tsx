import { createPortal } from 'react-dom';
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import {
  readCssCustomProperties,
  useAnchoredPopover,
  type AnchoredPopoverElementRef,
  type FloatingCustomProperties,
} from '../utils/useAnchoredPopover';
import { Button } from './ui/Button';
import { useI18n } from '../i18n';

export interface CustomSelectOption<T extends string | number> {
  value: T;
  label: string;
  description?: string;
  icon?: ReactNode;
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
  boundaryRef?: AnchoredPopoverElementRef;
}

const getText = (value: string) => value.trim().toLocaleLowerCase();
const customSelectMaxMenuHeight = (viewportHeight: number) => Math.min(384, viewportHeight * 0.5);

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
  placeholder,
  menuPlacement = 'start',
  boundaryRef,
}: CustomSelectProps<T>) {
  const { t } = useI18n();
  const resolvedPlaceholder = placeholder ?? t('common.select');
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuVariables, setMenuVariables] = useState<Record<`--${string}`, string>>({});
  const { position: menuPosition, verticalPlacement } = useAnchoredPopover({
    open: isOpen,
    anchorRef: triggerRef,
    contentRef: listboxRef,
    boundaryRef,
    placement: menuPlacement,
    maxMenuHeight: customSelectMaxMenuHeight,
  });

  useEffect(() => {
    if (!isOpen) {
      setActiveIndex(fallbackIndex);
    }
  }, [fallbackIndex, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const alignMenu = () => {
      const listbox = listboxRef.current;
      if (!listbox) return;

      listbox.focus({ preventScroll: true });

      // The menu is viewport-anchored, so only adjust its own scroll position.
      const activeOption = optionRefs.current[activeIndex];
      if (!activeOption || listbox.clientHeight <= 0) return;

      const optionTop = activeOption.offsetTop;
      const optionBottom = optionTop + activeOption.offsetHeight;
      const visibleTop = listbox.scrollTop;
      const visibleBottom = visibleTop + listbox.clientHeight;
      if (optionTop < visibleTop) {
        listbox.scrollTop = optionTop;
      } else if (optionBottom > visibleBottom) {
        listbox.scrollTop = Math.max(0, optionBottom - listbox.clientHeight);
      }
    };

    const frame = window.requestAnimationFrame(alignMenu);
    return () => window.cancelAnimationFrame(frame);
  }, [activeIndex, isOpen]);

  useLayoutEffect(() => {
    if (!isOpen || !rootRef.current) {
      setMenuVariables({});
      return;
    }

    const updateMenuVariables = () => {
      if (!rootRef.current) return;

      // A portaled menu no longer inherits the Settings/Gallery field scope,
      // so carry the resolved field tokens to the floating surface explicitly.
      const nextVariables = readCssCustomProperties(rootRef.current, ['--ui-field-']);
      setMenuVariables(current => {
        const currentMap = current as Record<string, string>;
        const nextMap = nextVariables as Record<string, string>;
        const currentKeys = Object.keys(currentMap);
        const nextKeys = Object.keys(nextMap);
        const unchanged = currentKeys.length === nextKeys.length
          && nextKeys.every(key => currentMap[key] === nextMap[key]);
        return unchanged ? current : nextVariables;
      });
    };

    updateMenuVariables();
    const themeObserver = typeof MutationObserver !== 'undefined'
      ? new MutationObserver(updateMenuVariables)
      : null;
    themeObserver?.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    themeObserver?.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme'] });

    return () => themeObserver?.disconnect();
  }, [buttonClassName, className, isOpen, style]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || listboxRef.current?.contains(target)) return;
      setIsOpen(false);
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
    const relatedTarget = event.relatedTarget as Node | null;
    if (relatedTarget && (rootRef.current?.contains(relatedTarget) || listboxRef.current?.contains(relatedTarget))) return;
    setIsOpen(false);
  };

  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const hasOptionIcons = options.some(option => Boolean(option.icon));
  const activeOptionId = options[activeIndex] ? `${listboxId}-option-${activeIndex}` : undefined;
  const menuStyle: FloatingCustomProperties = {
    ...menuVariables,
    position: 'fixed',
    top: `${menuPosition?.top ?? 0}px`,
    left: `${menuPosition?.left ?? 0}px`,
    maxHeight: `${menuPosition?.maxHeight ?? customSelectMaxMenuHeight(window.innerHeight)}px`,
    visibility: menuPosition ? 'visible' : 'hidden',
    '--anchored-anchor-width': `${menuPosition?.anchorWidth ?? 0}px`,
  };
  const menuClassName = [
    'custom-select__menu',
    hasOptionIcons ? 'has-option-icons' : '',
    className,
    menuPlacement === 'end' ? 'is-end' : '',
    verticalPlacement === 'up' ? 'is-up' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={rootRef}
      className={`ui-select-wrap custom-select${hasOptionIcons ? ' has-option-icons' : ''} ${menuPlacement === 'end' ? 'is-end' : ''} ${verticalPlacement === 'up' ? 'is-up' : ''} ${className ?? ''}`}
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
        {selectedOption?.icon && (
          <span className="custom-select__selected-icon" aria-hidden="true">
            {selectedOption.icon}
          </span>
        )}
        <span className={`custom-select__value ${selectedOption ? '' : 'is-placeholder'}`}>
          {selectedOption?.label ?? resolvedPlaceholder}
        </span>
        <ChevronDown className="ui-select-icon" aria-hidden="true" strokeWidth={2} />
      </Button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={listboxRef}
          id={listboxId}
          className={menuClassName}
          style={menuStyle}
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
                {hasOptionIcons && (
                  <span className="custom-select__option-icon" aria-hidden="true">
                    {option.icon}
                  </span>
                )}
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
        </div>,
        document.body,
      )}
    </div>
  );
}
