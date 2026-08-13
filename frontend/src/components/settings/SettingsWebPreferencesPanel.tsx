import React from 'react';
import { Play, Volume2 } from 'lucide-react';
import { useI18n } from '../../i18n';
import { CustomSelect, CustomSelectOption } from '../CustomSelect';
import { Input, SliderField } from '../ui';
import { ThemeMode, UiLanguage, ViewerMode, WebConfigDraft } from '../../types';

interface SettingsWebPreferencesPanelProps {
  webConfig: WebConfigDraft;
  setWebConfig: React.Dispatch<React.SetStateAction<WebConfigDraft>>;
  uiLanguageOptions: readonly CustomSelectOption<UiLanguage>[];
  localizedThemeOptions: readonly CustomSelectOption<ThemeMode>[];
  localizedPreferredBrowsingModeOptions: readonly CustomSelectOption<ViewerMode>[];
  localizedVideoSeekOptions: readonly CustomSelectOption<number>[];
  localizedVideoHoldSpeedOptions: readonly CustomSelectOption<number>[];
  children?: React.ReactNode;
}

const SettingsSwitch: React.FC<Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>> = (props) => (
  <input {...props} type="checkbox" role="switch" aria-checked={props.checked} className="settings-modal__switch" />
);

export const SettingsWebPreferencesPanel: React.FC<SettingsWebPreferencesPanelProps> = ({
  webConfig,
  setWebConfig,
  uiLanguageOptions,
  localizedThemeOptions,
  localizedPreferredBrowsingModeOptions,
  localizedVideoSeekOptions,
  localizedVideoHoldSpeedOptions,
  children,
}) => {
  const { t } = useI18n();

  return (
    <>
              <section
                className="settings-modal__display-section space-y-4"
                aria-labelledby="settings-general-display-title"
              >
                <div>
                  <h4
                    id="settings-general-display-title"
                    className="settings-modal__heading text-sm font-bold"
                  >
                    {t('settings.generalBrowsing')}
                  </h4>
                  <p className="settings-modal__description mt-1 text-xs leading-5">
                    {t('settings.generalBrowsingDescription')}
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label
                      htmlFor="ui-language"
                      className="settings-modal__label mb-1.5 block text-sm font-semibold"
                    >
                      {t('settings.language')}
                    </label>
                    <CustomSelect
                      id="ui-language"
                      value={webConfig.uiLanguage}
                      options={uiLanguageOptions}
                      onChange={(uiLanguage) =>
                        setWebConfig((current) => ({ ...current, uiLanguage }))
                      }
                      ariaLabel={t('settings.language')}
                      className="w-full"
                    />
                    <p className="settings-modal__description mt-1 text-xs leading-5">
                      {t('settings.languageDescription')}
                    </p>
                  </div>
                  <div>
                    <label
                      htmlFor="web-theme"
                      className="settings-modal__label mb-1.5 block text-sm font-semibold"
                    >
                      {t('settings.theme')}
                    </label>
                    <CustomSelect
                      id="web-theme"
                      value={webConfig.webTheme}
                      options={localizedThemeOptions}
                      onChange={(webTheme) =>
                        setWebConfig((current) => ({ ...current, webTheme }))
                      }
                      ariaLabel={t('settings.theme')}
                      className="w-full"
                      style={
                        {
                          '--ui-field-icon': 'var(--settings-text-muted)',
                          '--ui-field-icon-focus': 'var(--settings-accent)',
                        } as React.CSSProperties
                      }
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="default-view-mode"
                      className="settings-modal__label mb-1.5 block text-sm font-semibold"
                    >
                      {t('settings.preferredMode')}
                    </label>
                    <CustomSelect
                      id="default-view-mode"
                      value={webConfig.defaultViewMode}
                      options={localizedPreferredBrowsingModeOptions}
                      onChange={(defaultViewMode) =>
                        setWebConfig((current) => ({
                          ...current,
                          defaultViewMode,
                        }))
                      }
                      ariaLabel={t('settings.preferredMode')}
                      className="w-full"
                      style={
                        {
                          '--ui-field-icon': 'var(--settings-text-muted)',
                          '--ui-field-icon-focus': 'var(--settings-accent)',
                        } as React.CSSProperties
                      }
                    />
                    <p className="settings-modal__description mt-1 text-xs leading-5">
                      {t('settings.preferredModeDescription')}
                    </p>
                  </div>
                  <div>
                    <label
                      htmlFor="thumbnail-size"
                      className="settings-modal__label mb-1.5 block text-sm font-semibold"
                    >
                      {t('settings.thumbnailSize')}
                    </label>
                    <Input
                      controlSize="md"
                      id="thumbnail-size"
                      type="number"
                      min={16}
                      max={4096}
                      value={webConfig.thumbnailSize}
                      onChange={(event) =>
                        setWebConfig((current) => ({
                          ...current,
                          thumbnailSize: Number(event.target.value),
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label
                    htmlFor="group-manga-posts"
                    className="settings-modal__check-row flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm"
                  >
                    <SettingsSwitch
                      id="group-manga-posts"
                      checked={!!webConfig.groupMangaPosts}
                      onChange={(event) =>
                        setWebConfig((current) => ({
                          ...current,
                          groupMangaPosts: event.target.checked,
                        }))
                      }
                    />
                    <span>{t('settings.groupWorks')}</span>
                  </label>
                  <label
                    htmlFor="auto-open-browser"
                    className="settings-modal__check-row flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm"
                  >
                    <SettingsSwitch
                      id="auto-open-browser"
                      checked={!!webConfig.autoOpenBrowser}
                      onChange={(event) =>
                        setWebConfig((current) => ({
                          ...current,
                          autoOpenBrowser: event.target.checked,
                        }))
                      }
                    />
                    <span>{t('settings.autoOpenBrowser')}</span>
                  </label>
                  <label
                    htmlFor="blur-enabled"
                    className="settings-modal__check-row flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-3 py-2 text-sm"
                  >
                    <SettingsSwitch
                      id="blur-enabled"
                      checked={!!webConfig.blurEnabled}
                      onChange={(event) =>
                        setWebConfig((current) => ({
                          ...current,
                          blurEnabled: event.target.checked,
                        }))
                      }
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold">{t('settings.blurEnabled')}</span>
                      <span className="settings-modal__description mt-1 block text-xs leading-5">
                        {t('settings.blurDescription')}
                      </span>
                    </span>
                  </label>
                  <label
                    htmlFor="demo-mode"
                    className="settings-modal__check-row flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-3 py-2 text-sm"
                  >
                    <SettingsSwitch
                      id="demo-mode"
                      checked={!!webConfig.demoMode}
                      onChange={(event) =>
                        setWebConfig((current) => ({
                          ...current,
                          demoMode: event.target.checked,
                        }))
                      }
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold">{t('settings.demoMode')}</span>
                      <span className="settings-modal__description mt-1 block text-xs leading-5">
                        {t('settings.demoDescription')}
                      </span>
                    </span>
                  </label>
                </div>
              </section>

              <section
                className="settings-modal__display-section space-y-4"
                aria-labelledby="settings-video-playback-title"
              >
                <div>
                  <h4
                    id="settings-video-playback-title"
                    className="settings-modal__heading text-sm font-bold"
                  >
                    {t('settings.videoSettings')}
                  </h4>
                  <p className="settings-modal__description mt-1 text-xs leading-5">
                    {t('settings.videoSettingsDescription')}
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <SliderField
                    controlSize="md"
                    id="video-volume"
                    label={t('settings.mediaVolume')}
                    icon={<Volume2 className="h-4 w-4" />}
                    valueLabel={`${Math.round(webConfig.videoVolume * 100)}%`}
                    description={t('settings.videoVolumeDescription')}
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(webConfig.videoVolume * 100)}
                    onChange={(event) =>
                      setWebConfig((current) => {
                        const videoVolume = Number(event.target.value) / 100;
                        return {
                          ...current,
                          videoVolume,
                          videoMuted: videoVolume === 0,
                        };
                      })
                    }
                    className="settings-modal__video-volume"
                  />

                  <label
                    htmlFor="video-autoplay"
                    className="settings-modal__check-row flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-3 py-2 text-sm"
                  >
                    <SettingsSwitch
                      id="video-autoplay"
                      checked={!!webConfig.videoAutoplay}
                      onChange={(event) =>
                        setWebConfig((current) => ({
                          ...current,
                          videoAutoplay: event.target.checked,
                        }))
                      }
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 font-semibold">
                        <Play className="h-4 w-4" aria-hidden="true" />
                        {t('settings.videoAutoplay')}
                      </span>
                      <span className="settings-modal__description mt-1 block text-xs leading-5">
                        {t('settings.videoAutoplayDescription')}
                      </span>
                    </span>
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label
                      htmlFor="video-seek-seconds"
                      className="settings-modal__label mb-1.5 block text-sm font-semibold"
                    >
                      {t('settings.videoSeekLabel')}
                    </label>
                    <CustomSelect
                      id="video-seek-seconds"
                      value={webConfig.fullscreenVideoSeekSeconds}
                      options={localizedVideoSeekOptions}
                      onChange={(fullscreenVideoSeekSeconds) =>
                        setWebConfig((current) => ({
                          ...current,
                          fullscreenVideoSeekSeconds,
                        }))
                      }
                      ariaLabel={t('settings.videoSeekLabel')}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="video-hold-speed"
                      className="settings-modal__label mb-1.5 block text-sm font-semibold"
                    >
                      {t('settings.videoHoldLabel')}
                    </label>
                    <CustomSelect
                      id="video-hold-speed"
                      value={webConfig.fullscreenVideoHoldPlaybackRate}
                      options={localizedVideoHoldSpeedOptions}
                      onChange={(fullscreenVideoHoldPlaybackRate) =>
                        setWebConfig((current) => ({
                          ...current,
                          fullscreenVideoHoldPlaybackRate,
                        }))
                      }
                      ariaLabel={t('settings.videoHoldLabel')}
                      className="w-full"
                    />
                  </div>
                </div>
              </section>

              {children}

              <section
                className="settings-modal__display-section space-y-4"
                aria-labelledby="settings-webtoon-title"
              >
                <div>
                  <h4
                    id="settings-webtoon-title"
                    className="settings-modal__heading text-sm font-bold"
                  >
                    {t('settings.webtoonMode')}
                  </h4>
                  <p className="settings-modal__description mt-1 text-xs leading-5">
                    {t('settings.webtoonModeDescription')}
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label
                      htmlFor="webtoon-image-scale"
                      className="settings-modal__label mb-1.5 block text-sm font-semibold"
                    >
                      {t('settings.imageWidth')}
                    </label>
                    <Input
                      controlSize="md"
                      id="webtoon-image-scale"
                      type="number"
                      min={30}
                      max={100}
                      step={5}
                      value={webConfig.webtoonImageScale}
                      onChange={(event) =>
                        setWebConfig((current) => ({
                          ...current,
                          webtoonImageScale: Number(event.target.value),
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="webtoon-image-gap"
                      className="settings-modal__label mb-1.5 block text-sm font-semibold"
                    >
                      {t('settings.imageGap')}
                    </label>
                    <Input
                      controlSize="md"
                      id="webtoon-image-gap"
                      type="number"
                      min={0}
                      max={300}
                      step={4}
                      value={webConfig.webtoonImageGap}
                      onChange={(event) =>
                        setWebConfig((current) => ({
                          ...current,
                          webtoonImageGap: Number(event.target.value),
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label
                    htmlFor="webtoon-show-info"
                    className="settings-modal__check-row flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-3 py-2 text-sm"
                  >
                    <SettingsSwitch
                      id="webtoon-show-info"
                      checked={!!webConfig.webtoonShowInfo}
                      onChange={(event) =>
                        setWebConfig((current) => ({
                          ...current,
                          webtoonShowInfo: event.target.checked,
                        }))
                      }
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold">
                        {t('settings.showImageInfo')}
                      </span>
                      <span className="settings-modal__description mt-1 block text-xs leading-5">
                        {t('settings.showImageInfoDescription')}
                      </span>
                    </span>
                  </label>
                  <label
                    htmlFor="webtoon-show-page-number"
                    className="settings-modal__check-row flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-3 py-2 text-sm"
                  >
                    <SettingsSwitch
                      id="webtoon-show-page-number"
                      checked={!!webConfig.webtoonShowPageNumber}
                      onChange={(event) =>
                        setWebConfig((current) => ({
                          ...current,
                          webtoonShowPageNumber: event.target.checked,
                        }))
                      }
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold">{t('settings.showPageNumber')}</span>
                      <span className="settings-modal__description mt-1 block text-xs leading-5">
                        {t('settings.showPageNumberDescription')}
                      </span>
                    </span>
                  </label>
                  <label
                    htmlFor="webtoon-show-thumbnails"
                    className="settings-modal__check-row flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-3 py-2 text-sm"
                  >
                    <SettingsSwitch
                      id="webtoon-show-thumbnails"
                      checked={!!webConfig.webtoonShowThumbnails}
                      onChange={(event) =>
                        setWebConfig((current) => ({
                          ...current,
                          webtoonShowThumbnails: event.target.checked,
                        }))
                      }
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold">
                        {t('settings.showThumbnails')}
                      </span>
                      <span className="settings-modal__description mt-1 block text-xs leading-5">
                        {t('settings.showThumbnailsDescription')}
                      </span>
                    </span>
                  </label>
                </div>
              </section>
    </>
  );
};
