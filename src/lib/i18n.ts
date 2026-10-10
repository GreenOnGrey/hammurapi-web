import { createInstance } from "i18next";
import ICU from "i18next-icu";
import { initReactI18next } from "react-i18next";
import en from "../../locales/en.json";
import ru from "../../locales/ru.json";
import de from "../../locales/de.json";
import es from "../../locales/es.json";
import zhCN from "../../locales/zh-CN.json";

export const LANGUAGES = ["en", "ru", "de", "es", "zh-CN"] as const;
export type Language = (typeof LANGUAGES)[number];

/** Language names are shown in their own language (design spec §4). */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English", ru: "Русский", de: "Deutsch", es: "Español", "zh-CN": "中文",
};

/** Short labels of the language switch; the full name is the tooltip (FTR.HMR.CMN-0001 design §4). */
export const LANGUAGE_SHORT: Record<Language, string> = {
  en: "EN", ru: "RU", de: "DE", es: "ES", "zh-CN": "中文",
};

export const resources = {
  en: { translation: en }, ru: { translation: ru }, de: { translation: de }, es: { translation: es }, "zh-CN": { translation: zhCN },
};

/** Before sign-in: the browser language if supported, otherwise the default (tech spec §15). */
export function detectLanguage(browser: readonly string[], fallback = "en"): Language {
  for (const b of browser) {
    const exact = LANGUAGES.find((l) => l.toLowerCase() === b.toLowerCase());
    if (exact) return exact;
    const base = b.split("-")[0].toLowerCase();
    if (base === "zh") return "zh-CN";
    const byBase = LANGUAGES.find((l) => l === base);
    if (byBase) return byBase;
  }
  return (LANGUAGES as readonly string[]).includes(fallback) ? (fallback as Language) : "en";
}

export function createI18n(lng: string) {
  const inst = createInstance();
  inst.use(ICU).use(initReactI18next).init({
    resources,
    lng,
    fallbackLng: "en", // a missing key falls back to English, never to the key itself
    supportedLngs: [...LANGUAGES],
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return inst;
}

export function setDocumentLanguage(lng: string) {
  document.documentElement.lang = lng;
}

export const i18nInstance = createI18n(detectLanguage(typeof navigator !== "undefined" ? navigator.languages : []));
