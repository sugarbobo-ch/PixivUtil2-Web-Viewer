import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider, normalizeUiLanguage, useI18n } from './index';
import en from './locales/en.json';
import ja from './locales/ja.json';
import zhCN from './locales/zh-CN.json';
import zhTW from './locales/zh-TW.json';

const Probe = () => {
  const { t, formatNumber, formatPageRange, pseudoLocalize } = useI18n();
  return (
    <div>
      <span>{t('common.next')}</span>
      <span>{formatNumber(1234567)}</span>
      <span>{formatPageRange(2, 3, 24)}</span>
      <span>{pseudoLocalize('Settings')}</span>
    </div>
  );
};

describe('i18n runtime', () => {
  afterEach(() => {
    document.documentElement.lang = 'zh-TW';
    document.documentElement.dir = 'ltr';
    delete document.documentElement.dataset.uiLanguage;
  });

  it('switches language, synchronizes document metadata, and formats page status', async () => {
    render(
      <I18nProvider initialLanguage="en">
        <Probe />
      </I18nProvider>,
    );

    expect(screen.getByText('Next')).toBeTruthy();
    expect(screen.getByText('Pages 2–3 of 24')).toBeTruthy();
    expect(screen.getByText('Şëŧŧïñğş')).toBeTruthy();
    await waitFor(() => {
      expect(document.documentElement.lang).toBe('en');
      expect(document.documentElement.dir).toBe('ltr');
      expect(document.documentElement.dataset.uiLanguage).toBe('en');
    });
  });

  it('renders translated copy through the development pseudo-locale switch', () => {
    render(
      <I18nProvider initialLanguage="en" pseudoLocale>
        <Probe />
      </I18nProvider>,
    );

    expect(screen.getByText('Ñëẍŧ')).toBeTruthy();
    expect(screen.getByText('Şëŧŧïñğş')).toBeTruthy();
    expect(screen.getByText('Þåğëş 2–3 öƒ 24')).toBeTruthy();
    expect(screen.queryByText('Next')).toBeNull();
  });

  it('normalizes and renders Simplified Chinese', () => {
    expect(normalizeUiLanguage('zh-Hans')).toBe('zh-CN');
    expect(normalizeUiLanguage('zh-Hant')).toBe('zh-TW');

    render(
      <I18nProvider initialLanguage="zh-CN">
        <Probe />
      </I18nProvider>,
    );

    expect(screen.getByText('下一页')).toBeTruthy();
    expect(screen.getByText('第 2–3 页，共 24 页')).toBeTruthy();
    expect(document.documentElement.lang).toBe('zh-CN');
  });

  it('keeps every editable locale file aligned with the Traditional Chinese source', () => {
    const sourceKeys = Object.keys(zhTW).sort();
    const placeholders = (value: string) => value.match(/\{\w+\}/g)?.sort() ?? [];

    for (const locale of [zhCN, en, ja]) {
      expect(Object.keys(locale).sort()).toEqual(sourceKeys);
      for (const key of sourceKeys) {
        expect(placeholders(locale[key as keyof typeof locale])).toEqual(
          placeholders(zhTW[key as keyof typeof zhTW]),
        );
      }
    }
  });
});
