import React from 'react';
import { ArrowLeft, ArrowUp, Settings2 } from 'lucide-react';
import { IconButton } from './ui';

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
  return (
    <header className={`webtoon-mobile-header${isHidden ? ' is-hidden' : ''}`}>
      <div className="webtoon-mobile-header__bar">
        <IconButton
          type="button"
          variant="ghost"
          className="webtoon-mobile-header__back"
          onClick={onBack}
          tabIndex={isHidden ? -1 : undefined}
          aria-label="返回網格檢視"
          title="返回網格檢視"
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
            aria-label="回到條漫頂端"
            title="回到條漫頂端"
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
            aria-label={isSettingsOpen ? '關閉條漫設定' : '開啟條漫設定'}
            title={isSettingsOpen ? '關閉條漫設定' : '開啟條漫設定'}
          >
            <Settings2 aria-hidden="true" />
          </IconButton>
        </div>
      </div>
    </header>
  );
};
