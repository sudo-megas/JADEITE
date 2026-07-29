/**
 * i18next, wired for manual switching only — XJADEITE §13.
 *
 * The owner's explicit prohibition: the app must never read the OS locale and
 * must never change language on its own. So there is no language detector
 * here, and `i18next-browser-languagedetector` is deliberately absent from
 * package.json. Language is a setting inside the vault, defaulting to Turkish
 * on vault creation.
 *
 * Before the vault opens, Turkish is shown — the chosen language cannot be
 * read until the database is unlocked, and Turkish is the primary language, so
 * the fallback and the default are the same thing.
 */

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import { tr } from './locales/tr.js'
import { en } from './locales/en.js'
import type { AppLanguage } from './format.js'

export const LANGUAGES: readonly AppLanguage[] = ['tr', 'en']
export const DEFAULT_LANGUAGE: AppLanguage = 'tr'

export function isAppLanguage(value: string | null | undefined): value is AppLanguage {
  return value === 'tr' || value === 'en'
}

let initialised = false

export function initI18n(): typeof i18n {
  if (initialised) return i18n
  initialised = true

  void i18n.use(initReactI18next).init({
    resources: {
      tr: { translation: tr },
      en: { translation: en }
    },
    // Fixed at Turkish. Never detected, never negotiated.
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: LANGUAGES as unknown as string[],
    interpolation: {
      // React escapes for us; double-escaping mangles Turkish punctuation.
      escapeValue: false
    },
    returnNull: false
  })

  return i18n
}

/** The only way the language ever changes. */
export async function setLanguage(language: AppLanguage): Promise<void> {
  await i18n.changeLanguage(language)
  document.documentElement.lang = language
}

export function currentLanguage(): AppLanguage {
  return isAppLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE
}

export { i18n }
