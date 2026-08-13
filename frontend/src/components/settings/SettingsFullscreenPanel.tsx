import React from 'react';
import {
  GalleryThumbnails,
  Grid2X2,
  PanelTop,
  PanelTopOpen,
} from 'lucide-react';
import { useI18n } from '../../i18n';
import {
  FullscreenPageLayout,
  FullscreenReadingDirection,
  FullscreenSpreadPairing,
  FullscreenZoomMode,
  WebConfigDraft,
} from '../../types';
import { CustomSelect, CustomSelectOption } from '../CustomSelect';
import { Input } from '../ui';

type SettingsSwitchProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>;

const SettingsSwitch: React.FC<SettingsSwitchProps> = props => (
  <input
    {...props}
    type="checkbox"
    role="switch"
    aria-checked={props.checked}
    className="settings-modal__switch"
  />
);

export interface SettingsFullscreenPanelProps {
  webConfig: WebConfigDraft;
  setWebConfig: React.Dispatch<React.SetStateAction<WebConfigDraft>>;
  fullscreenPageLayoutOptions: readonly CustomSelectOption<FullscreenPageLayout>[];
  fullscreenReadingDirectionOptions: readonly CustomSelectOption<FullscreenReadingDirection>[];
  fullscreenSpreadPairingOptions: readonly CustomSelectOption<FullscreenSpreadPairing>[];
  localizedFullscreenZoomModeOptions: readonly CustomSelectOption<FullscreenZoomMode>[];
}

export const SettingsFullscreenPanel: React.FC<SettingsFullscreenPanelProps> = ({
  webConfig,
  setWebConfig,
  fullscreenPageLayoutOptions,
  fullscreenReadingDirectionOptions,
  fullscreenSpreadPairingOptions,
  localizedFullscreenZoomModeOptions,
}) => {
  const { t } = useI18n();

  return (
    <section
      className="settings-modal__display-section space-y-4"
      aria-labelledby="settings-fullscreen-title"
    >
      <div>
        <h4
          id="settings-fullscreen-title"
          className="settings-modal__heading text-sm font-bold"
        >
          {t('settings.fullscreenMode')}
        </h4>
        <p className="settings-modal__description mt-1 text-xs leading-5">
          {t('settings.fullscreenDescription')}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label
            htmlFor="fullscreen-page-layout"
            className="settings-modal__label mb-1.5 block text-sm font-semibold"
          >
            {t('viewer.pageLayout')}
          </label>
          <CustomSelect
            id="fullscreen-page-layout"
            value={webConfig.fullscreenPageLayout}
            options={fullscreenPageLayoutOptions}
            onChange={fullscreenPageLayout =>
              setWebConfig(current => ({ ...current, fullscreenPageLayout }))}
            ariaLabel={t('viewer.pageLayout')}
            className="w-full"
          />
        </div>
        <div>
          <label
            htmlFor="fullscreen-reading-direction"
            className="settings-modal__label mb-1.5 block text-sm font-semibold"
          >
            {t('viewer.readingDirection')}
          </label>
          <CustomSelect
            id="fullscreen-reading-direction"
            value={webConfig.fullscreenReadingDirection}
            options={fullscreenReadingDirectionOptions}
            onChange={fullscreenReadingDirection =>
              setWebConfig(current => ({ ...current, fullscreenReadingDirection }))}
            ariaLabel={t('viewer.readingDirection')}
            className="w-full"
          />
        </div>
        <div>
          <label
            htmlFor="fullscreen-spread-pairing"
            className="settings-modal__label mb-1.5 block text-sm font-semibold"
          >
            {t('viewer.spreadPairing')}
          </label>
          <CustomSelect
            id="fullscreen-spread-pairing"
            value={webConfig.fullscreenSpreadPairing}
            options={fullscreenSpreadPairingOptions}
            onChange={fullscreenSpreadPairing =>
              setWebConfig(current => ({ ...current, fullscreenSpreadPairing }))}
            ariaLabel={t('viewer.spreadPairing')}
            className="w-full"
          />
        </div>
      </div>

      <div className="max-w-xs">
        <label
          htmlFor="preload-image-count"
          className="settings-modal__label mb-1.5 block text-sm font-semibold"
        >
          {t('settings.preloadImages')}
        </label>
        <Input
          controlSize="md"
          id="preload-image-count"
          type="number"
          min={0}
          max={10}
          value={webConfig.preloadImageCount}
          onChange={event =>
            setWebConfig(current => ({
              ...current,
              preloadImageCount: Number(event.target.value),
            }))}
        />
        <p className="settings-modal__description mt-1 text-xs leading-5">
          {t('settings.preloadDescription')}
        </p>
      </div>

      <div className="space-y-3">
        <label
          htmlFor="fullscreen-toolbar-simple-mode"
          className="settings-modal__check-row flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-3 py-2 text-sm"
        >
          <SettingsSwitch
            id="fullscreen-toolbar-simple-mode"
            checked={!!webConfig.fullscreenToolbarSimpleMode}
            onChange={event =>
              setWebConfig(current => ({
                ...current,
                fullscreenToolbarSimpleMode: event.target.checked,
              }))}
          />
          <span className="min-w-0">
            <span className="flex items-center gap-2 font-semibold">
              <PanelTop className="h-4 w-4" aria-hidden="true" />
              {t('settings.simpleToolbar')}
            </span>
            <span className="settings-modal__description mt-1 block text-xs leading-5">
              {t('settings.simpleToolbarDescription')}
            </span>
          </span>
        </label>
        <label
          htmlFor="fullscreen-show-toolbar"
          className="settings-modal__check-row flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-3 py-2 text-sm"
        >
          <SettingsSwitch
            id="fullscreen-show-toolbar"
            checked={!!webConfig.fullscreenShowToolbar}
            onChange={event =>
              setWebConfig(current => ({
                ...current,
                fullscreenShowToolbar: event.target.checked,
              }))}
          />
          <span className="min-w-0">
            <span className="flex items-center gap-2 font-semibold">
              <PanelTopOpen className="h-4 w-4" aria-hidden="true" />
              {t('settings.showToolbar')}
            </span>
            <span className="settings-modal__description mt-1 block text-xs leading-5">
              {t('settings.showToolbarDescription')}
            </span>
          </span>
        </label>
        <label
          htmlFor="fullscreen-show-thumbnails"
          className="settings-modal__check-row flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-3 py-2 text-sm"
        >
          <SettingsSwitch
            id="fullscreen-show-thumbnails"
            checked={!!webConfig.fullscreenShowThumbnails}
            onChange={event =>
              setWebConfig(current => ({
                ...current,
                fullscreenShowThumbnails: event.target.checked,
              }))}
          />
          <span className="min-w-0">
            <span className="flex items-center gap-2 font-semibold">
              <GalleryThumbnails className="h-4 w-4" aria-hidden="true" />
              {t('settings.showFilmstrip')}
            </span>
            <span className="settings-modal__description mt-1 block text-xs leading-5">
              {t('settings.showFilmstripDescription')}
            </span>
          </span>
        </label>
      </div>

      <div className="space-y-4">
        <div>
          <h5
            id="settings-fullscreen-visual-title"
            className="settings-modal__heading text-sm font-bold"
          >
            {t('settings.readingSurface')}
          </h5>
          <p className="settings-modal__description mt-1 text-xs leading-5">
            {t('settings.readingSurfaceDescription')}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="fullscreen-zoom-mode"
              className="settings-modal__label mb-1.5 block text-sm font-semibold"
            >
              {t('settings.defaultZoom')}
            </label>
            <CustomSelect
              id="fullscreen-zoom-mode"
              value={webConfig.fullscreenZoomMode}
              options={localizedFullscreenZoomModeOptions}
              onChange={fullscreenZoomMode =>
                setWebConfig(current => ({ ...current, fullscreenZoomMode }))}
              ariaLabel={t('settings.defaultZoom')}
              className="w-full"
            />
          </div>
        </div>

        <div className="space-y-3">
          <label
            htmlFor="fullscreen-show-checkerboard"
            className="settings-modal__check-row flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-3 py-2 text-sm"
          >
            <SettingsSwitch
              id="fullscreen-show-checkerboard"
              checked={!!webConfig.fullscreenShowCheckerboard}
              onChange={event =>
                setWebConfig(current => ({
                  ...current,
                  fullscreenShowCheckerboard: event.target.checked,
                }))}
            />
            <span className="min-w-0">
              <span className="flex items-center gap-2 font-semibold">
                <Grid2X2 className="h-4 w-4" aria-hidden="true" />
                {t('settings.checkerboard')}
              </span>
              <span className="settings-modal__description mt-1 block text-xs leading-5">
                {t('settings.checkerboardDescription')}
              </span>
            </span>
          </label>
        </div>
      </div>
    </section>
  );
};
