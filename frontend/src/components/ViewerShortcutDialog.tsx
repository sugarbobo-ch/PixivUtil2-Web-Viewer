import React from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../i18n';
import { IconButton } from './ui/Button';

interface ViewerShortcutDialogProps {
  videoSeekSeconds: number;
  videoHoldPlaybackRate: number;
  onClose: () => void;
}

export const ViewerShortcutDialog: React.FC<ViewerShortcutDialogProps> = ({
  videoSeekSeconds,
  videoHoldPlaybackRate,
  onClose,
}) => {
  const { t, formatNumber } = useI18n();

  return (
    <section
      id="fullscreen-shortcut-help"
      className="fullscreen-viewer__shortcut-help"
      aria-label={t('viewer.shortcutHelp')}
    >
      <div className="fullscreen-viewer__shortcut-help-header">
        <h4>{t('viewer.shortcutHelp')}</h4>
        <IconButton
          type="button"
          onClick={onClose}
          aria-label={t('viewer.closeShortcutHelp')}
          variant="ghost"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </IconButton>
      </div>
      <p className="fullscreen-viewer__shortcut-help-intro">{t('viewer.shortcutIntro')}</p>
      <dl className="fullscreen-viewer__shortcut-list">
        <div><dt>{t('viewer.shortcutPreviousNext')}</dt><dd>← ↑ J / → ↓ K</dd></div>
        <div><dt>{t('viewer.shortcutFirstLast')}</dt><dd>Home / End</dd></div>
        <div><dt>{t('viewer.shortcutZoom')}</dt><dd>{t('viewer.shortcutZoomKeys')}</dd></div>
        <div><dt>{t('viewer.shortcutActualFit')}</dt><dd>{t('viewer.shortcutActualFitKeys')}</dd></div>
        <div><dt>{t('viewer.shortcutSixZoom')}</dt><dd>{t('viewer.shortcutSixZoomKeys')}</dd></div>
        <div><dt>{t('viewer.shortcutRotate')}</dt><dd>{t('viewer.shortcutRotateKeys')}</dd></div>
        <div><dt>{t('viewer.shortcutFlip')}</dt><dd>{t('viewer.shortcutFlipKeys')}</dd></div>
        <div><dt>{t('viewer.shortcutPan')}</dt><dd>{t('viewer.shortcutPanKeys')}</dd></div>
        <div><dt>{t('viewer.shortcutToolbar')}</dt><dd>{t('viewer.shortcutToolbarKeys')}</dd></div>
        <div><dt>{t('viewer.shortcutReload')}</dt><dd>{t('viewer.shortcutReloadKeys')}</dd></div>
        <div><dt>{t('viewer.shortcutBrowser')}</dt><dd>{t('viewer.shortcutBrowserKeys')}</dd></div>
        <div className="fullscreen-viewer__shortcut-list-heading"><dt>{t('viewer.shortcutVideo')}</dt><dd>{t('viewer.shortcutVideoOnly')}</dd></div>
        <div><dt>{t('viewer.shortcutPlayPause')}</dt><dd>{t('viewer.shortcutPlayPauseKeys')}</dd></div>
        <div><dt>{t('viewer.shortcutSeek', { seconds: formatNumber(videoSeekSeconds) })}</dt><dd>{t('viewer.shortcutSeekKeys')}</dd></div>
        <div><dt>{t('viewer.shortcutHoldSpeed', { rate: formatNumber(videoHoldPlaybackRate) })}</dt><dd>{t('viewer.shortcutHoldSpeedKeys')}</dd></div>
        <div><dt>{t('viewer.shortcutClose')}</dt><dd>{t('viewer.shortcutCloseKeys')}</dd></div>
      </dl>
    </section>
  );
};
