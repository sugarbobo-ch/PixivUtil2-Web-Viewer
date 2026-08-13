import React from 'react';
import { ArrowLeft, ArrowUp, Settings2 } from 'lucide-react';
import { IconButton } from './ui';
import { useI18n } from '../i18n';

interface WebtoonMobileHeaderProps {
  isHidden: boolean;
  isSettingsOpen: boolean;
  onBack: () => void;
  onScrollToTop: () => void;
  onToggleSettings: () => void;
}

export const WebtoonMobileHeader: React.FC<WebtoonMobileHeaderProps> = ({
  isHidden,
  isSettingsOpen,
  onBack,
  onScrollToTop,
  onToggleSettings,
}) => {
  const { t } = useI18n();
  return (
    <header className={`webtoon-mobile-header${isHidden ? ' is-hidden' : ''}`}>
      <div className="webtoon-mobile-header__bar">
        <IconButton
          type="button"
          variant="ghost"
          className="webtoon-mobile-header__back"
          onClick={onBack}
          tabIndex={isHidden ? -1 : undefined}
          aria-label={t('webtoon.backToGallery')}
          title={t('webtoon.backToGallery')}
        >
          <ArrowLeft aria-hidden="true" />
        </IconButton>

        <span className="webtoon-mobile-header__title">PixivUtil2 Gallery</span>

        <div className="webtoon-mobile-header__actions">
          <IconButton
            type="button"
            variant="ghost"
            onClick={event => {
              onScrollToTop();
              if (event.detail > 0) event.currentTarget.blur();
            }}
            tabIndex={isHidden ? -1 : undefined}
            aria-label={t('webtoon.scrollToTop')}
            title={t('webtoon.scrollToTop')}
          >
            <ArrowUp aria-hidden="true" />
          </IconButton>
          <IconButton
            type="button"
            variant="ghost"
            className="webtoon-mobile-header__settings"
            onClick={onToggleSettings}
            tabIndex={isHidden ? -1 : undefined}
            aria-expanded={isSettingsOpen}
            aria-controls="webtoon-mobile-quick-settings"
            aria-label={t(isSettingsOpen ? 'webtoon.closeSettings' : 'webtoon.openSettings')}
            title={t(isSettingsOpen ? 'webtoon.closeSettings' : 'webtoon.openSettings')}
          >
            <Settings2 aria-hidden="true" />
          </IconButton>
        </div>
      </div>
    </header>
  );
};
