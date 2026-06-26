import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './en.json';
import zhCN from './zh-CN.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zh-CN', label: '中文 (简体)' },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

export const LANGUAGE_STORAGE_KEY = 'opencolor.language';

function readStoredLanguage(): LanguageCode | undefined {
  try {
    const v = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (v === 'en' || v === 'zh-CN') return v;
  } catch {}
  return undefined;
}

const initialLang = readStoredLanguage() ?? 'en';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      'zh-CN': { translation: zhCN },
    },
    lng: initialLang,
    fallbackLng: 'en',
    supportedLngs: ['en', 'zh-CN'],
    detection: {
      order: ['localStorage'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
    returnNull: false,
  });

export function setLanguage(code: LanguageCode) {
  i18n.changeLanguage(code);
  try { localStorage.setItem(LANGUAGE_STORAGE_KEY, code); } catch {}
}

export function getLanguage(): LanguageCode {
  const lng = i18n.language;
  if (lng.startsWith('zh')) return 'zh-CN';
  return 'en';
}

export default i18n;
