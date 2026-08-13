import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Save, Search } from 'lucide-react';
import { useI18n } from '../../i18n';
import { getMotionAwareScrollBehavior } from '../../utils/motion';
import {
  getLocalizedFieldMetadata,
  getLocalizedSectionMetadata,
} from '../../pixivConfigMetadata';
import type { PixivConfigFieldMetadata } from '../../pixivConfigMetadata';
import { PathPickerField } from '../PathPickerField';
import { Button, Badge, IconButton, Input, Textarea } from '../ui';
import type { WebConfigDraft } from '../../types';

interface SettingsPixivConfigPathInfo {
  configPath: string;
  backupPath: string;
  defaultConfigPath: string;
  usingDefaultPath: boolean;
}

interface SettingsPixivContentProps {
  webConfig: WebConfigDraft;
  setWebConfig: React.Dispatch<React.SetStateAction<WebConfigDraft>>;
  pixivSections: Record<string, Record<string, string>>;
  activeSection: string;
  setActiveSection: React.Dispatch<React.SetStateAction<string>>;
  sectionFilter: string;
  setSectionFilter: React.Dispatch<React.SetStateAction<string>>;
  configPathInfo: SettingsPixivConfigPathInfo;
  loading: boolean;
  onSaveConfigPath: () => void | Promise<void>;
  onUpdateValue: (section: string, option: string, value: string) => void;
  onNavigateToLibrary: () => void;
}

const SettingsSwitch: React.FC<
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>
> = (props) => (
  <input
    {...props}
    type="checkbox"
    role="switch"
    aria-checked={props.checked}
    className="settings-modal__switch"
  />
);

export const SettingsPixivContent: React.FC<SettingsPixivContentProps> = ({
  webConfig,
  setWebConfig,
  pixivSections,
  activeSection,
  setActiveSection,
  sectionFilter,
  setSectionFilter,
  configPathInfo,
  loading,
  onSaveConfigPath,
  onUpdateValue,
  onNavigateToLibrary,
}) => {
  const { t, formatNumber, language } = useI18n();
  const sectionTabsRef = useRef<HTMLDivElement | null>(null);
  const [canScrollSectionTabsLeft, setCanScrollSectionTabsLeft] = useState(false);
  const [canScrollSectionTabsRight, setCanScrollSectionTabsRight] = useState(false);
  const sectionKeys = Object.keys(pixivSections);
  const sectionTabKey = sectionKeys.join('\u0000');
  const isSearching = sectionFilter.trim().length > 0;

  useEffect(() => {
    const tabsContainer = sectionTabsRef.current;
    if (!tabsContainer) {
      setCanScrollSectionTabsLeft(false);
      setCanScrollSectionTabsRight(false);
      return undefined;
    }

    const updateSectionTabScrollState = () => {
      const containerRect = tabsContainer.getBoundingClientRect();
      const tabs = Array.from(
        tabsContainer.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
      );
      setCanScrollSectionTabsLeft(
        tabs.some(
          (tab) => tab.getBoundingClientRect().left < containerRect.left - 1,
        ),
      );
      setCanScrollSectionTabsRight(
        tabs.some(
          (tab) => tab.getBoundingClientRect().right > containerRect.right + 1,
        ),
      );
    };

    updateSectionTabScrollState();
    tabsContainer.addEventListener('scroll', updateSectionTabScrollState, {
      passive: true,
    });
    window.addEventListener('resize', updateSectionTabScrollState);

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(updateSectionTabScrollState);
    resizeObserver?.observe(tabsContainer);

    return () => {
      tabsContainer.removeEventListener('scroll', updateSectionTabScrollState);
      window.removeEventListener('resize', updateSectionTabScrollState);
      resizeObserver?.disconnect();
    };
  }, [sectionTabKey]);

  const updatePixivValue = (section: string, option: string, value: string) =>
    onUpdateValue(section, option, value);

const filteredSectionGroups = useMemo(() => {
    if (!isSearching) {
      if (!activeSection || !pixivSections[activeSection]) return [];
      return [
        {
          section: activeSection,
          entries: Object.entries(pixivSections[activeSection]),
        },
      ];
    }

    const query = sectionFilter.trim().toLocaleLowerCase();
    return Object.entries(pixivSections)
      .map(([sectionName, options]) => {
        const sectionMetadata = getLocalizedSectionMetadata(sectionName, language);
        const sectionMatches = [
          sectionName,
          sectionMetadata?.eng_category,
          sectionMetadata?.zh_category,
          sectionMetadata?.description,
        ].some((value) => value?.toLocaleLowerCase().includes(query));

        const entries = Object.entries(options).filter(([option, value]) => {
          if (sectionMatches) return true;
          const fieldMetadata = getLocalizedFieldMetadata(sectionName, option, language);
          return [
            option,
            value,
            fieldMetadata.label,
            fieldMetadata.description,
          ].some((candidate) => candidate.toLocaleLowerCase().includes(query));
        });

        return { section: sectionName, entries };
      })
      .filter((group) => group.entries.length > 0);
  }, [activeSection, isSearching, language, pixivSections, sectionFilter]);

  const matchedFieldCount = filteredSectionGroups.reduce(
    (total, group) => total + group.entries.length,
    0,
  );
  const renderFieldControl = (
    sectionName: string,
    optionName: string,
    value: string,
    metadata: PixivConfigFieldMetadata,
    fieldId: string,
  ) => {
    const descriptionId = `${fieldId}-description`;
    const update = (nextValue: string) =>
      updatePixivValue(sectionName, optionName, nextValue);

    if (metadata.path) {
      return (
        <div className="space-y-1.5">
          <PathPickerField
            id={fieldId}
            label={metadata.label}
            value={value}
            metadata={metadata.path}
            descriptionId={descriptionId}
            onChange={update}
          />
          {metadata.path.purpose === 'root-directory' && (
            <Button
              type="button"
              onClick={onNavigateToLibrary}
              variant="plain"
              size="sm"
              className="settings-modal__text-link text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {t('settings.navigateToLibrary')}
            </Button>
          )}
        </div>
      );
    }

    if (metadata.kind === 'boolean') {
      return (
        <label
          htmlFor={fieldId}
          className="settings-modal__check-row flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm"
        >
          <SettingsSwitch
            id={fieldId}
            checked={value.toLowerCase() === 'true'}
            onChange={(event) =>
              update(event.target.checked ? 'True' : 'False')
            }
            aria-labelledby={`${fieldId}-label`}
            aria-describedby={descriptionId}
          />
          <span>
            {value.toLowerCase() === 'true'
              ? t('settings.enabled')
              : t('settings.disabled')}
          </span>
        </label>
      );
    }

    if (metadata.kind === 'textarea') {
      return (
        <Textarea
          controlSize="md"
          id={fieldId}
          value={value}
          onChange={(event) => update(event.target.value)}
          rows={2}
          aria-describedby={descriptionId}
          spellCheck={false}
          className="min-h-20 font-mono leading-5"
        />
      );
    }

    return (
      <Input
        controlSize="md"
        id={fieldId}
        type={
          metadata.kind === 'number'
            ? 'number'
            : metadata.secret
              ? 'password'
              : 'text'
        }
        value={value}
        onChange={(event) => update(event.target.value)}
        aria-describedby={descriptionId}
        autoComplete="off"
        spellCheck={false}
        className={
          metadata.kind === 'number' || metadata.secret
            ? 'font-mono'
            : undefined
        }
      />
    );
  };

  const renderSectionGroup = (
    sectionName: string,
    entries: [string, string][],
  ) => {
    const sectionMetadata = getLocalizedSectionMetadata(sectionName, language);
    const headingId = `pixiv-section-${sectionName.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

    return (
      <section
        key={sectionName}
        aria-labelledby={headingId}
        className="settings-modal__config-section space-y-3"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h4
            id={headingId}
            className="settings-modal__heading text-sm font-bold"
          >
            <span className="settings-modal__section-label">
              <span className="settings-modal__section-label-en">
                [{sectionMetadata?.eng_category || sectionName}]
              </span>
              <span className="settings-modal__section-label-zh">
                {sectionMetadata?.zh_category || t('settings.customCategory')}
              </span>
            </span>
          </h4>
          <span className="settings-modal__text-subtle font-mono text-[11px]">
            {t('settings.fieldCount', { count: formatNumber(entries.length) })}
          </span>
        </div>
        <p className="settings-modal__description text-xs leading-5">
          {sectionMetadata?.description || t('settings.customCategoryDescription')}
        </p>
        <div className="space-y-2">
          {entries.map(([optionName, value]) => {
            const metadata = getLocalizedFieldMetadata(sectionName, optionName, language);
            const fieldId = `pixiv-field-${sectionName}-${optionName}`.replace(
              /[^a-zA-Z0-9_-]/g,
              '-',
            );
            const descriptionId = `${fieldId}-description`;

            return (
              <div
                key={`${sectionName}-${optionName}`}
                className="settings-modal__field-card p-3"
              >
                <div className="grid gap-3 md:grid-cols-[minmax(180px,0.9fr)_minmax(0,1.5fr)] md:items-start">
                  <div className="min-w-0">
                    {metadata.kind === 'boolean' ? (
                      <div
                        id={`${fieldId}-label`}
                        className="settings-modal__label block text-sm font-semibold"
                      >
                        {metadata.label}
                      </div>
                    ) : (
                      <label
                        htmlFor={fieldId}
                        className="settings-modal__label block text-sm font-semibold"
                      >
                        {metadata.label}
                      </label>
                    )}
                    <code className="settings-modal__code mt-1 block break-all text-[11px]">
                      {optionName}
                    </code>
                    <p
                      id={descriptionId}
                      className="settings-modal__description mt-2 text-xs leading-5"
                    >
                      {metadata.description}
                    </p>
                  </div>
                  <div className="min-w-0">
                    {renderFieldControl(
                      sectionName,
                      optionName,
                      value,
                      metadata,
                      fieldId,
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  const handleSectionKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (
      event.key !== 'ArrowLeft' &&
      event.key !== 'ArrowRight' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    ) {
      return;
    }

    event.preventDefault();
    if (sectionKeys.length === 0) return;

    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? sectionKeys.length - 1
          : (index +
              (event.key === 'ArrowRight' ? 1 : -1) +
              sectionKeys.length) %
            sectionKeys.length;
    const nextSection = sectionKeys[nextIndex];
    setSectionFilter('');
    setActiveSection(nextSection);
    window.setTimeout(() => {
      document
        .querySelector<HTMLButtonElement>(
          `[data-pixiv-section-tab="${CSS.escape(nextSection)}"]`,
        )
        ?.focus();
    }, 0);
  };

  const scrollSectionTabs = (direction: 'left' | 'right') => {
    const tabsContainer = sectionTabsRef.current;
    if (!tabsContainer) return;

    const containerRect = tabsContainer.getBoundingClientRect();
    const tabs = Array.from(
      tabsContainer.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    );
    const clippedTabs =
      direction === 'left'
        ? tabs.filter(
            (tab) => tab.getBoundingClientRect().left < containerRect.left - 1,
          )
        : tabs.filter(
            (tab) =>
              tab.getBoundingClientRect().right > containerRect.right + 1,
          );
    const targetTab =
      direction === 'left'
        ? clippedTabs[clippedTabs.length - 1]
        : clippedTabs[0];

    targetTab?.scrollIntoView({
      behavior: getMotionAwareScrollBehavior(),
      block: 'nearest',
      inline: 'nearest',
    });
  };

  const handleSectionTabsWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const tabsContainer = event.currentTarget;
    if (tabsContainer.scrollWidth <= tabsContainer.clientWidth) return;

    // Keep the wheel gesture inside this horizontal strip. A regular vertical
    // mouse wheel is mapped to horizontal scrolling; native horizontal
    // trackpad and shift-wheel deltas are preserved as horizontal movement.
    const deltaMagnitude =
      event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? tabsContainer.clientWidth
          : 1;
    const wheelDelta =
      (Math.abs(event.deltaX) >= Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY) * deltaMagnitude;
    if (wheelDelta === 0) return;

    const isRtl = getComputedStyle(tabsContainer).direction === 'rtl';
    const scrollDelta = isRtl ? -wheelDelta : wheelDelta;
    const canScrollInDirection =
      scrollDelta < 0 ? canScrollSectionTabsLeft : canScrollSectionTabsRight;

    event.preventDefault();
    if (!canScrollInDirection) return;
    tabsContainer.scrollBy({ left: scrollDelta, behavior: 'auto' });
  };

  return (
    <>
<div className="settings-modal__info-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="settings-modal__info-title text-base font-bold">
                      {t('settings.pixivConfigLocation')}
                    </h3>
                    <p className="settings-modal__info-description mt-1 text-sm leading-5">
                      {t('settings.pixivConfigDescription')}
                    </p>
                  </div>
                  <Badge
                    variant="neutral"
                    size="sm"
                    className="settings-modal__badge"
                  >
                    {configPathInfo.usingDefaultPath
                      ? t('settings.defaultLocation')
                      : t('settings.customLocation')}
                  </Badge>
                </div>
                <div className="mt-4 space-y-2">
                  <label
                    htmlFor="pixiv-config-path"
                    className="settings-modal__label block text-sm font-semibold"
                  >
                    {t('settings.configPath')}
                  </label>
                  <PathPickerField
                    id="pixiv-config-path"
                    label={t('settings.configPath')}
                    value={webConfig.pixivConfigPath || ''}
                    placeholder={t('settings.emptyDefaultPath')}
                    metadata={{
                      mode: 'existing-file',
                      purpose: 'pixiv-config',
                      extensions: ['.ini'],
                      access: 'read',
                    }}
                    onChange={(value) =>
                      setWebConfig((current) => ({
                        ...current,
                        pixivConfigPath: value,
                      }))
                    }
                    onClear={() =>
                      setWebConfig((current) => ({
                        ...current,
                        pixivConfigPath: '',
                      }))
                    }
                    clearLabel={t('settings.defaultLocation')}
                  />
                  <p className="settings-modal__description break-all text-xs leading-5">
                    {t('settings.currentPath')}
                    <code className="settings-modal__code">
                      {configPathInfo.configPath || t('settings.loading')}
                    </code>
                    <br />
                    {t('settings.defaultPath')}
                    <code className="settings-modal__code">
                      {configPathInfo.defaultConfigPath || t('settings.loading')}
                    </code>
                  </p>
                  <Button
                    type="button"
                    onClick={onSaveConfigPath}
                    disabled={loading}
                    variant="primary"
                    className="mt-2"
                  >
                    <Save className="h-4 w-4" aria-hidden="true" />
                    {loading ? t('settings.loading') : t('settings.savePathReload')}
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="settings-modal__search-field min-w-0 flex-1">
                    <label htmlFor="pixiv-config-search" className="sr-only">
                      {t('settings.searchConfig')}
                    </label>
                    <Input
                      controlSize="md"
                      leadingIcon={<Search aria-hidden="true" />}
                      wrapperClassName="w-full"
                      clearable
                      onClear={() => {
                        setSectionFilter('');
                        setActiveSection(
                          sectionKeys.includes('Settings')
                            ? 'Settings'
                            : sectionKeys[0] || '',
                        );
                      }}
                      clearButtonLabel={t('common.clearSearch')}
                      id="pixiv-config-search"
                      type="search"
                      value={sectionFilter}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setSectionFilter(nextValue);
                        if (nextValue.trim()) {
                          setActiveSection('');
                        } else {
                          setActiveSection(
                            sectionKeys.includes('Settings')
                              ? 'Settings'
                              : sectionKeys[0] || '',
                          );
                        }
                      }}
                      placeholder={t('settings.searchConfigPlaceholder')}
                      autoComplete="off"
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="settings-modal__section-tabs-shell">
                  <IconButton
                    type="button"
                    variant="ghost"
                    className="settings-modal__section-tabs-control"
                    onClick={() => scrollSectionTabs('left')}
                    disabled={!canScrollSectionTabsLeft}
                    aria-label={t('settings.browseConfigSectionsLeft')}
                    title={t('settings.browseConfigSectionsLeft')}
                    aria-controls="pixiv-config-section-tabs"
                  >
                    <ChevronLeft aria-hidden="true" />
                  </IconButton>

                  <div
                    id="pixiv-config-section-tabs"
                    ref={sectionTabsRef}
                    className="settings-modal__section-tabs"
                    role="tablist"
                    aria-label={t('settings.configSections')}
                    onWheel={handleSectionTabsWheel}
                  >
                    {sectionKeys.map((sectionName, index) => {
                      const selected =
                        !isSearching && activeSection === sectionName;
                          const sectionMetadata = getLocalizedSectionMetadata(sectionName, language);
                      return (
                        <button
                          key={sectionName}
                          type="button"
                          role="tab"
                          aria-selected={selected}
                          aria-controls="pixiv-config-panel"
                          tabIndex={isSearching || selected ? 0 : -1}
                          data-pixiv-section-tab={sectionName}
                          onClick={() => {
                            setSectionFilter('');
                            setActiveSection(sectionName);
                          }}
                          onKeyDown={(event) =>
                            handleSectionKeyDown(event, index)
                          }
                          className={`settings-modal__section-tab text-xs font-semibold ${selected ? 'is-selected' : ''}`}
                        >
                          <span className="settings-modal__section-label">
                            <span className="settings-modal__section-label-en">
                              [{sectionMetadata?.eng_category || sectionName}]
                            </span>
                            <span className="settings-modal__section-label-zh">
                              {sectionMetadata?.zh_category || t('settings.customSection')}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <IconButton
                    type="button"
                    variant="ghost"
                    className="settings-modal__section-tabs-control"
                    onClick={() => scrollSectionTabs('right')}
                    disabled={!canScrollSectionTabsRight}
                    aria-label={t('settings.browseConfigSectionsRight')}
                    title={t('settings.browseConfigSectionsRight')}
                    aria-controls="pixiv-config-section-tabs"
                  >
                    <ChevronRight aria-hidden="true" />
                  </IconButton>
                </div>

                <div
                  id="pixiv-config-panel"
                  role="tabpanel"
                  aria-live="polite"
                  className="space-y-8"
                >
                  <div
                    role="status"
                    className="settings-modal__description text-xs"
                  >
                    {isSearching
                      ? t('settings.configSearchSummary', { count: formatNumber(matchedFieldCount) })
                      : t('settings.currentSection', { section: getLocalizedSectionMetadata(activeSection, language)?.zh_category || activeSection || t('settings.noSection') })}
                  </div>
                  {filteredSectionGroups.length > 0 ? (
                    filteredSectionGroups.map((group) =>
                      renderSectionGroup(group.section, group.entries),
                    )
                  ) : (
                    <div className="settings-modal__empty rounded-xl px-6 py-10 text-center">
                      <Search
                        className="settings-modal__muted-icon mx-auto h-8 w-8"
                        aria-hidden="true"
                      />
                      <p className="settings-modal__empty-title mt-3 text-sm font-semibold">
                        {t('settings.noMatchingField')}
                      </p>
                      <p className="settings-modal__empty-text mt-1 text-xs">
                        {t('settings.changeKeyword')}
                      </p>
                      {isSearching && (
                        <Button
                          type="button"
                          onClick={() => {
                            setSectionFilter('');
                            setActiveSection(
                              sectionKeys.includes('Settings')
                                ? 'Settings'
                                : sectionKeys[0] || '',
                            );
                          }}
                          variant="plain"
                          className="mt-4"
                        >
                          {t('common.clearSearch')}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
    </>
  );
};
