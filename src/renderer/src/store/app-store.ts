/**
 * Appearance and language state.
 *
 * Both live inside the encrypted vault (§4.1, §16.5), so they can only be read
 * once it is unlocked. Until then the app shows Default Dark and Turkish — the
 * fallback and the default are deliberately the same thing.
 */

import { create } from 'zustand'

import { SETTING_KEYS } from '@shared/ipc-contract'
import { applyPalette } from '../theme/apply.js'
import { FALLBACK_PALETTE_ID, isKnownPaletteId, paletteById } from '@shared/theme/palettes/index.js'
import { DEFAULT_LANGUAGE, isAppLanguage, setLanguage as applyLanguage } from '../i18n/index.js'
import type { AppLanguage } from '../i18n/format.js'

const DEFAULT_AUTO_LOCK_MINUTES = 10

interface AppState {
  paletteId: string
  language: AppLanguage
  autoLockMinutes: number
  loaded: boolean

  loadFromVault(): Promise<void>
  setPalette(id: string): Promise<void>
  setLanguage(language: AppLanguage): Promise<void>
  resetToLockedDefaults(): void
}

function paint(paletteId: string): void {
  applyPalette(paletteById(paletteId), document.documentElement)
}

export const useAppStore = create<AppState>((set, get) => ({
  paletteId: FALLBACK_PALETTE_ID,
  language: DEFAULT_LANGUAGE,
  autoLockMinutes: DEFAULT_AUTO_LOCK_MINUTES,
  loaded: false,

  async loadFromVault() {
    const [palette, language, autoLock] = await Promise.all([
      window.jadeite.settings.get(SETTING_KEYS.palette),
      window.jadeite.settings.get(SETTING_KEYS.language),
      window.jadeite.settings.get(SETTING_KEYS.autoLockMinutes)
    ])

    const paletteId =
      palette.ok && palette.value !== null && isKnownPaletteId(palette.value)
        ? palette.value
        : FALLBACK_PALETTE_ID

    const nextLanguage =
      language.ok && isAppLanguage(language.value) ? language.value : DEFAULT_LANGUAGE

    const minutes =
      autoLock.ok && autoLock.value !== null ? Number.parseInt(autoLock.value, 10) : NaN

    paint(paletteId)
    await applyLanguage(nextLanguage)

    set({
      paletteId,
      language: nextLanguage,
      autoLockMinutes:
        Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_AUTO_LOCK_MINUTES,
      loaded: true
    })
  },

  async setPalette(id) {
    if (!isKnownPaletteId(id) || id === get().paletteId) return
    paint(id)
    set({ paletteId: id })
    await window.jadeite.settings.set(SETTING_KEYS.palette, id)
  },

  async setLanguage(language) {
    if (language === get().language) return
    await applyLanguage(language)
    set({ language })
    await window.jadeite.settings.set(SETTING_KEYS.language, language)
  },

  resetToLockedDefaults() {
    paint(FALLBACK_PALETTE_ID)
    void applyLanguage(DEFAULT_LANGUAGE)
    set({
      paletteId: FALLBACK_PALETTE_ID,
      language: DEFAULT_LANGUAGE,
      autoLockMinutes: DEFAULT_AUTO_LOCK_MINUTES,
      loaded: false
    })
  }
}))
