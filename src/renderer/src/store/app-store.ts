/**
 * Appearance, language, and the security settings that sit behind the lock.
 *
 * These come from two places on purpose:
 *
 *   palette, language   — config.json, unencrypted, so the lock screen can
 *                         already look and speak the way the owner chose
 *   auto-lock timeout   — the vault, where changing it needs the vault key
 *   price refresh       — the vault, for a stronger reason still (§14)
 *
 * Each value has exactly one home. Nothing is mirrored between the two.
 *
 * The auto-refresh interval is the first setting this application *writes*
 * rather than reads. It goes into the vault, and not into config.json beside
 * the palette, because it is the only setting whose value causes the machine to
 * open a network connection: a number that decides when JADEITE talks to the
 * outside world must not be alterable by anything that has not already proved
 * it holds the vault key (§4.1, §14).
 */

import { create } from 'zustand'

import { registerVaultScoped } from './vault-scoped.js'

import { SETTING_KEYS } from '@shared/ipc-contract'
import { applyPalette } from '../theme/apply.js'
import { FALLBACK_PALETTE_ID, isKnownPaletteId, paletteById } from '@shared/theme/palettes/index.js'
import { DEFAULT_LANGUAGE, isAppLanguage, setLanguage as applyLanguage } from '../i18n/index.js'
import type { AppLanguage } from '../i18n/format.js'

const DEFAULT_AUTO_LOCK_MINUTES = 10

/**
 * The vault key the auto-refresh interval is stored under.
 *
 * A literal only until `SETTING_KEYS` in `@shared/ipc-contract` gains
 * `priceRefreshMinutes: 'price_refresh_minutes'`, which is not this file's to
 * add. `src/main/prices/schedule.ts` reads the same string on the other side of
 * the bridge; the two must be swapped together.
 */
const PRICE_REFRESH_KEY = SETTING_KEYS.priceRefreshMinutes

/**
 * Off, and off is the default (§14).
 *
 * Manual refresh is primary. Egress that happens because the app decided to,
 * rather than because the owner pressed something, is opt-in — so a vault that
 * has never been asked the question talks to nobody.
 */
const DEFAULT_PRICE_REFRESH_MINUTES = 0

/**
 * The intervals the interface offers, and the only ones it will write.
 *
 * A free number box was rejected. `MIN_INTERVAL_MS` in the price limiter is
 * sixty seconds, so anything under a minute is a request the app cannot honour
 * and would quietly round up — a control that accepts a figure it will not obey
 * is a control that lies. A closed list also keeps the question the owner is
 * actually asked short: *how stale may these be?*, with four answers.
 *
 * Zero leads, because it is both the default and the state §14 wants easiest to
 * return to.
 */
export const PRICE_REFRESH_CHOICES: readonly number[] = Object.freeze([0, 15, 30, 60])

interface AppState {
  paletteId: string
  language: AppLanguage
  autoLockMinutes: number
  /** Minutes between automatic price refreshes; 0 is off (§14). */
  priceRefreshMinutes: number
  appearanceLoaded: boolean

  /** Read config.json and paint. Runs before the vault is touched. */
  loadAppearance(): Promise<void>
  /** Read the settings that only exist behind the lock. */
  loadVaultSettings(): Promise<void>
  /** Drop those settings again when the vault closes. */
  forgetVaultSettings(): void
  setPalette(id: string): Promise<void>
  setLanguage(language: AppLanguage): Promise<void>
  /** Write the interval into the vault. Refuses anything not on the list. */
  setPriceRefreshMinutes(minutes: number): Promise<void>
}

function paint(paletteId: string): void {
  applyPalette(paletteById(paletteId), document.documentElement)
}

export const useAppStore = create<AppState>((set, get) => ({
  paletteId: FALLBACK_PALETTE_ID,
  language: DEFAULT_LANGUAGE,
  autoLockMinutes: DEFAULT_AUTO_LOCK_MINUTES,
  priceRefreshMinutes: DEFAULT_PRICE_REFRESH_MINUTES,
  appearanceLoaded: false,

  async loadAppearance() {
    const config = await window.jadeite.config.get()

    const paletteId = isKnownPaletteId(config.palette) ? config.palette : FALLBACK_PALETTE_ID
    const language = isAppLanguage(config.language) ? config.language : DEFAULT_LANGUAGE

    paint(paletteId)
    await applyLanguage(language)
    set({ paletteId, language, appearanceLoaded: true })
  },

  /**
   * Forget the settings that came out of the vault.
   *
   * Only those: the palette and the language live in config.json, outside the
   * vault, and the lock screen needs them (§4.1). This store therefore resets
   * a part of itself rather than all of it.
   */
  forgetVaultSettings() {
    set({
      autoLockMinutes: DEFAULT_AUTO_LOCK_MINUTES,
      priceRefreshMinutes: DEFAULT_PRICE_REFRESH_MINUTES
    })
  },

  async loadVaultSettings() {
    const autoLock = await window.jadeite.settings.get(SETTING_KEYS.autoLockMinutes)
    const minutes =
      autoLock.ok && autoLock.value !== null ? Number.parseInt(autoLock.value, 10) : NaN
    set({
      autoLockMinutes:
        Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_AUTO_LOCK_MINUTES
    })

    /**
     * The interval, read separately and defaulted separately.
     *
     * A vault written before Realisation VII has no such row, and `getSetting`
     * answers null for a key with no default — which is off, and off is
     * correct.
     *
     * A stored figure the interface would not offer today — an older build's, a
     * newer one's, a hand edit — is kept exactly as found rather than snapped to
     * the nearest choice. The consequence is plain and is the point: the panel
     * shows four buttons with none of them pressed, because none of them is what
     * the vault holds and claiming otherwise would be the interface lying about
     * the database. The first click settles it. What such a figure *does* in the
     * meantime is `schedule.ts`'s to say, and it clamps rather than ignores.
     */
    const refresh = await window.jadeite.settings.get(PRICE_REFRESH_KEY)
    const interval = refresh.ok && refresh.value !== null ? Number.parseInt(refresh.value, 10) : NaN
    set({
      priceRefreshMinutes:
        Number.isFinite(interval) && interval > 0 ? interval : DEFAULT_PRICE_REFRESH_MINUTES
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
  },

  /**
   * Write first, then believe it — the opposite order to `setPalette` and
   * `setLanguage` above, deliberately.
   *
   * Those two paint before they persist because config.json sits outside the
   * vault and the write cannot meaningfully fail. This one can: `settings:set`
   * answers `LOCKED` if the vault closed between the click and the write, and a
   * panel left reading "30 dk" over a vault holding nothing would be a screen
   * disagreeing with the database about when this machine goes online. That is
   * the whole class of defect this application was built to end, so the local
   * figure moves only once the vault has taken it.
   *
   * An unofferable interval is refused outright rather than clamped. The owner
   * is present, the control has four buttons, and every one of them is a value
   * the app can actually honour — there is nothing here to guess at. Clamping
   * belongs where nobody is present to be asked, which is `schedule.ts`.
   */
  async setPriceRefreshMinutes(minutes) {
    if (!PRICE_REFRESH_CHOICES.includes(minutes)) return
    if (minutes === get().priceRefreshMinutes) return

    const written = await window.jadeite.settings.set(PRICE_REFRESH_KEY, String(minutes))
    if (!written.ok) return
    set({ priceRefreshMinutes: minutes })
  }
}))

// The auto-lock timeout is read out of the vault, so it is vault-scoped like
// any other such value. Appearance and language deliberately are not.
registerVaultScoped(() => {
  useAppStore.getState().forgetVaultSettings()
})
