import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import en from './locales/en.json';
import ja from './locales/ja.json';
import zhCN from './locales/zh-CN.json';
import zhTW from './locales/zh-TW.json';
import type { UiLanguage } from '../types';

export type I18nNamespace =
  | 'common'
  | 'gallery'
  | 'filters'
  | 'viewer'
  | 'webtoon'
  | 'settings'
  | 'onboarding'
  | 'library'
  | 'errors'
  | 'recycle'
  | 'manga';

export type TranslationKey = `${I18nNamespace}.${string}`;
export type TranslationValues = Record<string, number | string>;
export type UiDirection = 'ltr' | 'rtl';

export const UI_LANGUAGE_OPTIONS: readonly {
  value: UiLanguage;
  label: string;
  nativeLabel: string;
}[] = [
  { value: 'zh-TW', label: '繁體中文', nativeLabel: '繁體中文' },
  { value: 'zh-CN', label: '简体中文', nativeLabel: '简体中文' },
  { value: 'en', label: 'English', nativeLabel: 'English' },
  { value: 'ja', label: '日本語', nativeLabel: '日本語' },
];

const messages: Record<UiLanguage, Record<string, string>> = {
  'zh-TW': zhTW,
  'zh-CN': zhCN,
  en,
  ja,
};

export const normalizeUiLanguage = (value: unknown): UiLanguage => {
  if (value === 'zh-CN' || value === 'zh-Hans' || value === 'zh-SG') return 'zh-CN';
  if (value === 'zh-TW' || value === 'zh-Hant' || value === 'zh-HK') return 'zh-TW';
  if (value === 'en' || value === 'en-US' || value === 'en-GB') return 'en';
  if (value === 'ja' || value === 'ja-JP') return 'ja';
  return 'zh-TW';
};

export const getUiDirection = (_language: UiLanguage): UiDirection => 'ltr';

const interpolate = (template: string, values?: TranslationValues): string => {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  ));
};

const createTranslator = (language: UiLanguage, pseudoLocale = false) => (key: TranslationKey | string, values?: TranslationValues) => {
  const fallback = messages['zh-TW'][key] ?? key;
  const translated = messages[language][key] ?? fallback;
  if (import.meta.env?.DEV && !messages[language][key] && !messages['zh-TW'][key]) {
    console.warn(`[i18n] Missing translation key: ${key}`);
  }
  return interpolate(pseudoLocale ? pseudoLocalize(translated) : translated, values);
};

export interface I18nContextValue {
  language: UiLanguage;
  direction: UiDirection;
  t: (key: TranslationKey | string, values?: TranslationValues) => string;
  setLanguage: (language: UiLanguage) => void;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatPageRange: (start: number, end: number, total: number) => string;
  pseudoLocalize: (value: string) => string;
}

const defaultLanguage = normalizeUiLanguage(
  typeof document === 'undefined' ? undefined : document.documentElement.lang,
);

const defaultContext: I18nContextValue = {
  language: defaultLanguage,
  direction: getUiDirection(defaultLanguage),
  t: createTranslator(defaultLanguage),
  setLanguage: () => undefined,
  formatNumber: value => new Intl.NumberFormat(defaultLanguage).format(value),
  formatDate: value => new Intl.DateTimeFormat(defaultLanguage, { dateStyle: 'medium' }).format(new Date(value)),
  formatPageRange: (start, end, total) => createTranslator(defaultLanguage)('common.pageRange', { start, end, total }),
  pseudoLocalize: value => pseudoLocalize(value),
};

const I18nContext = createContext<I18nContextValue>(defaultContext);

export function pseudoLocalize(value: string): string {
  return value.replace(/\{[^}]+\}|[A-Za-z]/g, token => {
    if (token.startsWith('{')) return token;
    const character = token;
    const map: Record<string, string> = {
      A: 'Å', B: 'Ƃ', C: 'Ç', D: 'Ð', E: 'Ë', F: 'Ƒ', G: 'Ğ', H: 'Ħ', I: 'Ï', J: 'Ĵ', K: 'Ҡ', L: 'Ŀ', M: 'Ṁ',
      N: 'Ñ', O: 'Ö', P: 'Þ', Q: 'Ǫ', R: 'Ř', S: 'Ş', T: 'Ŧ', U: 'Ü', V: 'Ṽ', W: 'Ŵ', X: 'Ẍ', Y: 'Ÿ', Z: 'Ž',
  };
  const upper = character.toUpperCase();
  const mapped = map[upper] ?? character;
  return character === upper ? mapped : mapped.toLowerCase();
  });
}

interface I18nProviderProps {
  children: ReactNode;
  initialLanguage?: UiLanguage;
  /** Development-only QA switch; never persisted to WebConfig. */
  pseudoLocale?: boolean;
}

export const I18nProvider: React.FC<I18nProviderProps> = ({
  children,
  initialLanguage = 'zh-TW',
  pseudoLocale = false,
}) => {
  const [language, setLanguage] = useState<UiLanguage>(normalizeUiLanguage(initialLanguage));
  const direction = getUiDirection(language);
  const t = useMemo(() => createTranslator(language, pseudoLocale), [language, pseudoLocale]);

  useEffect(() => {
    setLanguage(normalizeUiLanguage(initialLanguage));
  }, [initialLanguage]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
    document.documentElement.dataset.uiLanguage = language;
  }, [direction, language]);

  const formatNumber = useCallback(
    (value: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(language, options).format(value),
    [language],
  );
  const formatDate = useCallback(
    (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => {
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      return new Intl.DateTimeFormat(language, options ?? { dateStyle: 'medium', timeStyle: 'short' }).format(date);
    },
    [language],
  );
  const formatPageRange = useCallback(
    (start: number, end: number, total: number) => t('common.pageRange', {
      start: formatNumber(start),
      end: formatNumber(end),
      total: formatNumber(total),
    }),
    [formatNumber, t],
  );

  const value = useMemo<I18nContextValue>(() => ({
    language,
    direction,
    t,
    setLanguage,
    formatNumber,
    formatDate,
    formatPageRange,
    pseudoLocalize,
  }), [direction, formatDate, formatNumber, formatPageRange, language, t]);

  return React.createElement(I18nContext.Provider, { value }, children);
};

export const useI18n = (): I18nContextValue => useContext(I18nContext);
