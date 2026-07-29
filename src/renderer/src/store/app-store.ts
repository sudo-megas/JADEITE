/**
 * Appearance, language, and the security settings that sit behind the lock.
 *
 * These come from two places on purpose:
 *
 *   palette, language   — config.json, unencrypted, so the lock screen can
 *                         already look and speak the way the owner chose
 *   auto-lock timeout   — the vault, where changing it needs the vault key
 *
 * Each value has exactly one home. Nothing is mirrored between the two.
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
  appearanceLoaded: boolean

  /** Read config.json and paint. Runs before the vault is touched. */
  loadAppearance(): Promise<void>
  /** Read the settings that only exist behind the lock. */
  loadVaultSettings(): Promise<void>
  setPalette(id: string): Promise<void>
  setLanguage(language: AppLanguage): Promise<void>
}

function paint(paletteId: string): void {
  applyPalette(paletteById(paletteId), document.documentElement)
}

export const useAppStore = create<AppState>((set, get) => ({
  paletteId: FALLBACK_PALETTE_ID,
  language: DEFAULT_LANGUAGE,
  autoLockMinutes: DEFAULT_AUTO_LOCK_MINUTES,
  appearanceLoaded: false,

  async loadAppearance() {
    const config = await window.jadeite.config.get()

    const paletteId = isKnownPaletteId(config.palette) ? config.palette : FALLBACK_PALETTE_ID
    const language = isAppLanguage(config.language) ? config.language : DEFAULT_LANGUAGE

    paint(paletteId)
    await applyLanguage(language)
    set({ paletteId, language, appearanceLoaded: true })
  },

  async loadVaultSettings() {
    const autoLock = await window.jadeite.settings.get(SETTING_KEYS.autoLockMinutes)
    const minutes =
      autoLock.ok && autoLock.value !== null ? Number.parseInt(autoLock.value, 10) : NaN
    set({
      autoLockMinutes:
        Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_AUTO_LOCK_MINUTES
    })
  },

  async setPalette(id) {
    if (!isKnownPaletteId(id) || id === get().paletteId) return
    paint(id)
    set({ paletteId: id })
    await window.jadeite.config.set({ palette: id })
  },

  async setLanguage(language) {
    if (language === get().language) return
    await applyLanguage(language)
    set({ language })
    await window.jadeite.config.set({ language })
  }
}))
