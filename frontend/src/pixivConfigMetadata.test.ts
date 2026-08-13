import { describe, expect, it } from 'vitest';
import {
  getLocalizedFieldMetadata,
  getLocalizedSectionMetadata,
  getSectionMetadata,
  pixivConfigMetadata,
} from './pixivConfigMetadata';
import configEn from './i18n/config-locales/en.json';
import configJa from './i18n/config-locales/ja.json';
import configZhCN from './i18n/config-locales/zh-CN.json';
import configZhTW from './i18n/config-locales/zh-TW.json';

describe('Pixiv config metadata localization', () => {
  it('keeps the established Traditional Chinese metadata unchanged', () => {
    const metadata = getLocalizedFieldMetadata('Network', 'useproxy', 'zh-TW');
    expect(metadata.label).toBe('啟用代理伺服器');
    expect(metadata.description).toContain('proxyAddress');
  });

  it('provides localized labels and descriptions for English settings', () => {
    const field = getLocalizedFieldMetadata('Settings', 'rootdirectory', 'en');
    const section = getLocalizedSectionMetadata('Network', 'en');

    expect(field.label).toBe('Image root directory');
    expect(field.description).toBe('Root directory for downloaded images and work folders.');
    expect(section?.zh_category).toBe('Network settings');
    expect(section?.description).toContain('Control');
    expect(field.label).not.toMatch(/[一-龥]/);
  });

  it('provides contextual Simplified Chinese section copy', () => {
    const metadata = getLocalizedSectionMetadata('Network', 'zh-CN');

    expect(metadata?.zh_category).toBe('网络设置');
    expect(metadata?.description).toBe('控制 PixivUtil2 的连接、重试与版本检查行为。');
  });

  it('provides Japanese section copy while preserving field behavior metadata', () => {
    const original = getSectionMetadata('FFmpeg');
    const localized = getLocalizedSectionMetadata('FFmpeg', 'ja');
    const field = getLocalizedFieldMetadata('FFmpeg', 'ffmpeg', 'ja');

    expect(localized?.zh_category).toBe('FFmpeg 変換');
    expect(field.label).toBe('FFmpeg 実行ファイル');
    expect(field.path).toEqual(original?.fields.ffmpeg.path);
    expect(field.description).toContain('FFmpeg');
  });

  it('provides explicit copy for every known config section and field', () => {
    const dictionaries = {
      'zh-TW': configZhTW,
      'zh-CN': configZhCN,
      en: configEn,
      ja: configJa,
    } as const;
    const sectionNames = Object.keys(pixivConfigMetadata).sort();
    const fieldKeys = Object.entries(pixivConfigMetadata)
      .flatMap(([section, metadata]) => Object.keys(metadata.fields).map(option => `${section}.${option}`))
      .sort();

    for (const [language, dictionary] of Object.entries(dictionaries)) {
      expect(Object.keys(dictionary.sections).sort()).toEqual(sectionNames);
      expect(Object.keys(dictionary.fields).sort()).toEqual(fieldKeys);

      for (const fieldKey of fieldKeys) {
        const separator = fieldKey.indexOf('.');
        const section = fieldKey.slice(0, separator);
        const option = fieldKey.slice(separator + 1);
        const localized = getLocalizedFieldMetadata(section, option, language as keyof typeof dictionaries);
        const copy = dictionary.fields[fieldKey as keyof typeof dictionary.fields];

        expect(localized.label).toBe(copy.label);
        expect(localized.description).toBe(copy.description);
        expect(localized.description.trim()).not.toBe('');
      }
    }
  });

  it('preserves config identifiers and filename tokens in every translation', () => {
    const dictionaries = [configZhCN, configEn, configJa];
    const technicalTokens = (value: string) => Array.from(new Set(value.match(
      /%[^%]+%|\b(?:True|False|[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+|[A-Za-z]+[A-Z][A-Za-z0-9]*)\b/g,
    ) ?? []));

    for (const dictionary of dictionaries) {
      for (const fieldKey of Object.keys(configZhTW.fields)) {
        const source = configZhTW.fields[fieldKey as keyof typeof configZhTW.fields].description;
        const translated = dictionary.fields[fieldKey as keyof typeof dictionary.fields].description;
        for (const token of technicalTokens(source)) {
          expect(translated).toContain(token);
        }
      }
    }
  });
});
