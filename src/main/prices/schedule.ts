/**
 * The optional auto-refresh interval — §14's second sentence, after the first
 * one that matters more: *manual refresh is primary*.
 *
 * Modelled on `idle.ts`, and the resemblance is the argument. That watcher polls
 * on a short fixed beat, re-reads its setting on every tick, unrefs its timer and
 * does nothing at all while the vault is locked. All four properties are needed
 * again here, one of them for a new reason:
 *
 * **The setting is re-read every tick, never cached.** In `idle.ts` this buys a
 * changed timeout taking effect without a restart. Here it buys something the
 * renderer cannot otherwise have: the interval is written into the vault by
 * `settings:set` from the settings panel, and this watcher reads the same rows
 * through the same open database a moment later. No IPC message announces the
 * change and none is needed. The rejected alternative was a `setPriceRefresh()`
 * the settings handler would call, which would have made the vault and the
 * scheduler two homes for one number and left them to disagree whenever a write
 * succeeded and the notification did not.
 *
 * **A locked vault means no tick does anything**, and here that is not a policy
 * so much as an impossibility: the interval lives *inside* the vault, so a
 * locked one cannot even be asked how often it wanted to be refreshed. Silence
 * is the only available behaviour and it is also the right one — a machine left
 * locked overnight should not be talking to a price source.
 *
 * **`unref`**, so a pending tick never keeps the process alive past a quit.
 *
 * This module opens no socket and knows no URL. It calls `refreshPrices`, which
 * owns the limiter, the provider, the validation, the snapshot write and the
 * fetch record. A second path to the provider that skipped any one of those is
 * exactly the "just one more fetch" that `scripts/audit-egress.mjs` exists to
 * catch, and writing one here would have been the easiest possible way to lose
 * the politeness §14.3 asks for.
 */
import { SETTING_KEYS } from '../../shared/ipc-contract.js'

import * as vault from '../vault/vault.js'
import { getSetting } from '../vault/db/settings.js'
import { MIN_INTERVAL_MS } from './limiter.js'
import { refreshPrices } from './service.js'

/**
 * How often the *watcher* wakes, which is not how often the provider is asked.
 *
 * Half a minute is short enough that a change made in the settings panel is
 * obeyed while the owner is still looking at the panel, and long enough that the
 * cost of waking is nothing. The interval the owner chose is measured separately
 * below, against the clock, so this beat has no influence on it beyond a
 * granularity of thirty seconds on a fifteen-minute period.
 */
const POLL_INTERVAL_MS = 30_000

/**
 * The vault key the interval is stored under.
 *
 * A literal only until `SETTING_KEYS` in `shared/ipc-contract.ts` gains
 * `priceRefreshMinutes: 'price_refresh_minutes'`, which is not this file's to
 * add. `renderer/src/store/app-store.ts` writes the same string from the other
 * side of the bridge; the two must be swapped together.
 */
const PRICE_REFRESH_KEY = SETTING_KEYS.priceRefreshMinutes

/** The floor, in minutes, that `MIN_INTERVAL_MS` imposes on any answer. */
const FLOOR_MINUTES = MIN_INTERVAL_MS / 60_000

/**
 * How often to refresh, in milliseconds, or null for never.
 *
 * **Below a minute is clamped up, not refused.** The limiter permits one attempt
 * a minute however often it is asked, so an interval of thirty seconds is a
 * request the application cannot honour; the question is only what to do with
 * it. Refusing — treating it as off — answers a request for *more often* with
 * *never*, which is the one reading that certainly is not what was meant.
 * Clamping does what the limiter would have done anyway and makes the code
 * honest about it. The settings panel refuses such a figure instead, and that
 * division is deliberate: refuse where a person is present to be shown four
 * workable choices, clamp where the value arrives from a database with nobody
 * to ask — an older build's row, a newer one's, or a hand edit.
 *
 * Zero, negative and unparseable all mean off. None of them is a request for a
 * frequency, and defaulting an unreadable row to *some* egress would be the
 * wrong way for this particular setting to fail.
 */
function intervalMs(raw: string | null): number | null {
  if (raw === null) return null

  const minutes = Number.parseInt(raw, 10)
  if (!Number.isFinite(minutes) || minutes <= 0) return null

  return Math.max(minutes, FLOOR_MINUTES) * 60_000
}

/**
 * Start watching. Returns the function that stops it.
 *
 * A stop function rather than `idle.ts`'s exported `stopIdleWatch`, because the
 * state this owns — a timer, a last-run stamp, an in-flight flag — is a closure
 * per call rather than a module-wide singleton, and a caller that never stops it
 * cannot leave a second watcher running that nothing holds a handle to.
 */
export function startPriceRefresh(): () => void {
  /**
   * When the provider was last asked *by this watcher*, epoch milliseconds.
   *
   * Null means never, and never is due — so a vault opened with the setting on
   * is refreshed within a poll of unlocking rather than a quarter of an hour
   * later. An interval describes how stale prices may become, and prices
   * inherited from a previous session are already older than that. The limiter
   * is what makes this safe rather than a way to hammer the source on a
   * lock/unlock cycle: it lives in the process, not here, and it will not permit
   * two attempts inside a minute whoever asks.
   *
   * Deliberately *not* reset when the vault locks, so a morning of locking and
   * unlocking does not become a morning of fetching.
   */
  let lastRunMs: number | null = null

  /** A refresh this watcher started and is still waiting on. */
  let running = false

  const tick = (): void => {
    if (running) return

    const db = vault.database()
    if (!db) return

    const period = intervalMs(getSetting(db, PRICE_REFRESH_KEY))
    if (period === null) return

    const nowMs = Date.now()
    // A clock that went backwards — an NTP correction, a timezone change —
    // makes the elapsed time negative rather than large, which would postpone
    // the next refresh indefinitely. Treated as due, since the limiter is the
    // thing standing between "due" and "asked".
    const elapsed = lastRunMs === null ? Number.POSITIVE_INFINITY : nowMs - lastRunMs
    if (elapsed >= 0 && elapsed < period) return

    running = true
    void refreshPrices(db)
      .then((outcome) => {
        // A refusal by the limiter is not a refresh. Recording it as one would
        // let an interval near the limiter's own floor decay into twice itself:
        // the tick that was skipped would have reset the clock without ever
        // having asked the provider anything.
        if (outcome.status !== 'skipped') lastRunMs = Date.now()
      })
      .catch(() => {
        // `refreshPrices` is documented not to throw *at its caller*, and every
        // path through it is written to keep that promise. This is here because
        // a background timer cannot afford to be wrong about a promise: an
        // unhandled rejection would take the main process down with it. The
        // stamp still moves — whatever went wrong is not made better by trying
        // again in thirty seconds.
        lastRunMs = Date.now()
      })
      .finally(() => {
        running = false
      })
  }

  const timer = setInterval(tick, POLL_INTERVAL_MS)
  timer.unref()

  return () => clearInterval(timer)
}
