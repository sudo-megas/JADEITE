/**
 * One press of the refresh button, from end to end — XJADEITE §14.
 *
 * The order is: ask the limiter, ask the provider, validate, store, record the
 * attempt. Every step can decline and none of them throws at the caller: §14
 * requires offline and provider-broken states to be "quiet and non-blocking",
 * and the manual price on screen goes on being the authority throughout (§8.5).
 *
 * **The attempt is recorded even when nothing is stored.** A snapshot is written
 * only when a figure has moved, so a perfectly good refresh on a quiet afternoon
 * writes zero rows. If the interface took its timestamp from the price table it
 * would report a working provider as days stale, so `s3_price_fetch` records
 * that the app looked and `s3_prices_live` records that a price moved. Two
 * facts, two homes.
 */

import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'
import * as prices from '../vault/db/prices.js'
import type { RefreshOutcome } from '../../shared/section3/types.js'
import { FRESH, afterAttempt, mayAttempt, requiredWaitMs, type LimiterState } from './limiter.js'
import { loadProvider, selectedProviderId } from './registry.js'

/**
 * How long a single-shot snapshot may take.
 *
 * §14.1 measured the real thing at about a second and a half — connect, take the
 * first unsolicited frame, disconnect. Eight seconds is generous enough to
 * absorb a slow handshake and short enough that a hung socket does not leave the
 * button spinning while the owner wonders.
 */
const SNAPSHOT_TIMEOUT_MS = 8_000

/**
 * Limiter state lives in module scope and dies with the process.
 *
 * Deliberately not persisted. A relaunch is a fresh intent by a person who is
 * present, and making them wait out a backoff earned by yesterday's outage would
 * be politeness aimed at the wrong party. The source cannot tell the difference:
 * a restart is not a way to hammer it, because starting the application costs
 * more than a minute of waiting would.
 */
let limiter: LimiterState = FRESH

/** The fetch currently in flight, so the vault lock can cut it short. */
let inFlight: AbortController | null = null

/**
 * Abandon any fetch in progress.
 *
 * Called when the vault locks. A fetch that completes after the key is gone has
 * nowhere to put its answer — `withVault` would refuse the write — so the socket
 * is closed rather than left to finish into a locked database.
 */
export function cancelInFlight(): void {
  inFlight?.abort()
  inFlight = null
}

/** Only for the suites: forget the rate-limiter's memory between cases. */
export function resetLimiterForTests(): void {
  limiter = FRESH
}

export async function refreshPrices(db: DatabaseType): Promise<RefreshOutcome> {
  const providerId = selectedProviderId()
  const nowMs = Date.now()

  if (!mayAttempt(limiter, nowMs)) {
    // Not a failure and not a success: the source was asked too recently. The
    // interface keeps the timestamp it already had rather than showing an error,
    // and nothing is recorded — a refused request was never an attempt.
    return {
      status: 'skipped',
      provider: providerId,
      written: 0,
      retryAfterSeconds: Math.ceil(requiredWaitMs(limiter, nowMs) / 1000)
    }
  }

  const controller = new AbortController()
  inFlight = controller
  const timer = setTimeout(() => controller.abort(), SNAPSHOT_TIMEOUT_MS)

  const attemptedAt = new Date(nowMs).toISOString()

  try {
    const provider = await loadProvider(providerId)
    const result = await provider.snapshot(controller.signal)

    if (!result.ok) {
      limiter = afterAttempt(limiter, Date.now(), false)
      prices.recordFetch(db, { provider: providerId, attemptedAt, outcome: result.error })
      return { status: result.error, provider: providerId, written: 0 }
    }

    const written = prices.appendSnapshot(db, result.value)
    limiter = afterAttempt(limiter, Date.now(), true)
    prices.recordFetch(db, {
      provider: providerId,
      attemptedAt,
      outcome: 'ok',
      succeededAt: result.value.fetchedAt
    })
    return { status: 'ok', provider: providerId, written }
  } catch (error) {
    // A provider that threw despite the contract, a registry refusal, or an
    // abort. None of them is the owner's problem and none may reach the bridge
    // as an exception, so they all land here as an ordinary failed fetch.
    limiter = afterAttempt(limiter, Date.now(), false)
    const outcome = controller.signal.aborted ? 'TIMEOUT' : 'MALFORMED'
    try {
      prices.recordFetch(db, { provider: providerId, attemptedAt, outcome })
    } catch {
      // The vault locked mid-fetch. There is nowhere to record this and nobody
      // left to show it to; the next unlock reads what was last written.
      void error
    }
    return { status: outcome, provider: providerId, written: 0 }
  } finally {
    clearTimeout(timer)
    if (inFlight === controller) inFlight = null
  }
}
