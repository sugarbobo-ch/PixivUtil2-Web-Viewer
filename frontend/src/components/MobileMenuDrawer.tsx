import React from 'react';
import {
  ChevronRight,
  Eye,
  EyeOff,
  Layers,
  Maximize2,
  Moon,
  ScrollText,
  Settings,
  Sun,
  X,
} from 'lucide-react';
import { ThemeMode, ViewerMode } from '../types';
import { Button, IconButton } from './ui/Button';

interface MobileMenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  preferredViewerMode: ViewerMode;
  onSelectPreferredViewerMode: (mode: ViewerMode) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  onOpenSettings: () => void;
  groupMangaPosts?: boolean;
  onToggleGroupMangaPosts?: () => void;
  blurEnabled?: boolean;
  onToggleBlur?: () => void;
}

export const MobileMenuDrawer: React.FC<MobileMenuDrawerProps> = ({
  isOpen,
  onClose,
  preferredViewerMode,
  onSelectPreferredViewerMode,
  theme,
  setTheme,
  onOpenSettings,
  groupMangaPosts = false,
  onToggleGroupMangaPosts,
  blurEnabled = false,
  onToggleBlur,
}) => {
  const drawerRef = React.useRef<HTMLElement>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!isOpen) return undefined;

    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const drawer = drawerRef.current;
      if (!drawer) return;

      const focusableElements = Array.from(drawer.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )).filter(element => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
      if (focusableElements.length === 0) return;

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const selectPreferredViewerMode = (mode: ViewerMode) => {
    onSelectPreferredViewerMode(mode);
    onClose();
  };

  return (
    <>
      <button
        type="button"
        className="app-mobile-menu__backdrop"
        onClick={onClose}
        aria-label="關閉功能選單"
        title="關閉功能選單"
      />

      <aside
        id="mobile-menu-drawer"
        className="app-mobile-menu"
        aria-labelledby="mobile-menu-title"
        ref={drawerRef}
      >
        <div className="app-mobile-menu__header">
          <h2 id="mobile-menu-title">功能選單</h2>
          <IconButton
            type="button"
            onClick={onClose}
            variant="ghost"
            className="app-mobile-menu__close"
            aria-label="關閉功能選單"
            title="關閉功能選單"
            ref={closeButtonRef}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </IconButton>
        </div>

        <div className="app-mobile-menu__body">
          <section className="app-mobile-menu__section" aria-labelledby="mobile-menu-view-title">
            <div className="app-mobile-menu__section-heading">
              <h3 id="mobile-menu-view-title">偏好瀏覽模式</h3>
              <span>選擇偏好的內容呈現方式</span>
            </div>

            <div className="app-mobile-menu__view-modes" role="group" aria-label="偏好瀏覽模式">
              <Button
                type="button"
                onClick={() => selectPreferredViewerMode('fullscreen')}
                aria-pressed={preferredViewerMode === 'fullscreen'}
                variant={preferredViewerMode === 'fullscreen' ? 'primary' : 'ghost'}
                size="lg"
                className={`app-mobile-menu__view-button ${preferredViewerMode === 'fullscreen' ? 'is-selected' : ''}`}
              >
                <Maximize2 className="h-5 w-5" aria-hidden="true" />
                <span>全螢幕</span>
              </Button>
              <Button
                type="button"
                onClick={() => selectPreferredViewerMode('webtoon')}
                aria-pressed={preferredViewerMode === 'webtoon'}
                variant={preferredViewerMode === 'webtoon' ? 'primary' : 'ghost'}
                size="lg"
                className={`app-mobile-menu__view-button ${preferredViewerMode === 'webtoon' ? 'is-selected' : ''}`}
              >
                <ScrollText className="h-5 w-5" aria-hidden="true" />
                <span>條漫</span>
              </Button>
            </div>
          </section>

          <section className="app-mobile-menu__section" aria-labelledby="mobile-menu-tools-title">
            <div className="app-mobile-menu__section-heading">
              <h3 id="mobile-menu-tools-title">工具</h3>
              <span>快速切換瀏覽輔助功能</span>
            </div>

            <div className="app-mobile-menu__item-list">
              {onToggleGroupMangaPosts && (
                <Button
                  type="button"
                  onClick={onToggleGroupMangaPosts}
                  aria-pressed={groupMangaPosts}
                  variant={groupMangaPosts ? 'primary' : 'secondary'}
                  size="lg"
                  fullWidth
                  className={`app-mobile-menu__item app-mobile-menu__item--toggle ${groupMangaPosts ? 'is-on' : 'is-off'}`}
                >
                  <span className="app-mobile-menu__item-icon" aria-hidden="true"><Layers className="h-4 w-4" /></span>
                  <span className="app-mobile-menu__item-copy">
                    <strong>組圖模式</strong>
                    <small>{groupMangaPosts ? '目前已開啟' : '將相關頁面合併顯示'}</small>
                  </span>
                  <span className={`app-mobile-menu__item-status ${groupMangaPosts ? 'is-on' : 'is-off'}`}>{groupMangaPosts ? '開啟' : '關閉'}</span>
                </Button>
              )}
              {onToggleBlur && (
                <Button
                  type="button"
                  onClick={onToggleBlur}
                  aria-pressed={blurEnabled}
                  variant={blurEnabled ? 'primary' : 'secondary'}
                  size="lg"
                  fullWidth
                  className={`app-mobile-menu__item app-mobile-menu__item--toggle ${blurEnabled ? 'is-on' : 'is-off'}`}
                >
                  <span className="app-mobile-menu__item-icon" aria-hidden="true">
                    {blurEnabled ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </span>
                  <span className="app-mobile-menu__item-copy">
                    <strong>模糊遮罩</strong>
                    <small>{blurEnabled ? '敏感縮圖目前已遮罩' : '顯示原始縮圖'}</small>
                  </span>
                  <span className={`app-mobile-menu__item-status ${blurEnabled ? 'is-on' : 'is-off'}`}>{blurEnabled ? '開啟' : '關閉'}</span>
                </Button>
              )}
            </div>
          </section>

          <section className="app-mobile-menu__section" aria-labelledby="mobile-menu-preferences-title">
            <div className="app-mobile-menu__section-heading">
              <h3 id="mobile-menu-preferences-title">外觀與設定</h3>
            </div>

            <div className="app-mobile-menu__item-list">
              <Button
                type="button"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                variant="secondary"
                size="lg"
                fullWidth
                className="app-mobile-menu__item"
                aria-label={theme === 'dark' ? '切換至亮色模式' : '切換至暗色模式'}
              >
                <span className="app-mobile-menu__item-icon" aria-hidden="true">
                  {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </span>
                <span className="app-mobile-menu__item-copy">
                  <strong>{theme === 'dark' ? '明亮模式' : '暗黑模式'}</strong>
                  <small>切換介面配色</small>
                </span>
                <ChevronRight className="app-mobile-menu__item-chevron h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
                variant="secondary"
                size="lg"
                fullWidth
                className="app-mobile-menu__item"
              >
                <span className="app-mobile-menu__item-icon" aria-hidden="true"><Settings className="h-4 w-4" /></span>
                <span className="app-mobile-menu__item-copy">
                  <strong>設定</strong>
                  <small>調整 Web Viewer 偏好</small>
                </span>
                <ChevronRight className="app-mobile-menu__item-chevron h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
};
