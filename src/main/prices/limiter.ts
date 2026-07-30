/**
 * Politeness, expressed as arithmetic — XJADEITE §14.
 *
 * §14.3 records that nothing on the source prohibits this: robots.txt allows
 * everything but `/uye/`, there is no crawl delay, no terms of use, no
 * anti-automation clause. The etiquette is therefore **entirely self-imposed**,
 * and self-imposed etiquette that lives in a comment is not etiquette.
 *
 * §14.3 also asks the app to "identify politely", and it cannot: the history
 * endpoint requires a browser User-Agent and returns 404 HTML without one, so
 * announcing itself as JADEITE would simply break the request. That clause is
 * amended in this rung. What is left is the part that actually costs the source
 * something — how often it is asked — so that is what this file governs.
 *
 * Pure, and the clock is a parameter. Every engine in this application takes
 * `now` from its caller rather than reading it (`computeGrid` takes `Today`),
 * which is what makes them testable without waiting.
 */

/** No two attempts closer together than this, however often the button is pressed. */
export const MIN_INTERVAL_MS = 60_000

/** After a failure, wait this long before the next attempt, doubling each time. */
export const BACKOFF_BASE_MS = 60_000

/** And never longer than this, or a morning's outage costs the rest of the day. */
export const BACKOFF_CEILING_MS = 30 * 60_000

export interface LimiterState {
  /** When the last attempt was made, epoch milliseconds, or null if never. */
  lastAttemptMs: number | null
  /** Consecutive failures since the last success. */
  consecutiveFailures: number
}

export const FRESH: LimiterState = Object.freeze({ lastAttemptMs: null, consecutiveFailures: 0 })

/**
 * How long to wait before the next attempt is permitted.
 *
 * Backoff is exponential in the failure count and always at least the ordinary
 * floor, so a broken provider is asked once a minute, then twice a minute apart,
 * and so on to the half-hour ceiling. A source that is down does not benefit
 * from being told so more often.
 */
export function requiredWaitMs(state: LimiterState, nowMs: number): number {
  if (state.lastAttemptMs === null) return 0

  const floor =
    state.consecutiveFailures === 0
      ? MIN_INTERVAL_MS
      : Math.min(BACKOFF_BASE_MS * 2 ** (state.consecutiveFailures - 1), BACKOFF_CEILING_MS)

  const elapsed = nowMs - state.lastAttemptMs
  // A clock that went backwards — a timezone change, an NTP correction — must
  // not permit an unlimited burst, so a negative elapsed counts as none.
  if (elapsed < 0) return floor
  return Math.max(0, floor - elapsed)
}

/** May an attempt be made right now? */
export function mayAttempt(state: LimiterState, nowMs: number): boolean {
  return requiredWaitMs(state, nowMs) === 0
}

/**
 * The state after an attempt.
 *
 * A refused-too-soon request does not pass through here: it was never an
 * attempt, so it neither resets the interval nor counts as a failure. Counting
 * it would let a button held down push its own next opportunity away forever.
 */
export function afterAttempt(state: LimiterState, nowMs: number, succeeded: boolean): LimiterState {
  return {
    lastAttemptMs: nowMs,
    consecutiveFailures: succeeded ? 0 : state.consecutiveFailures + 1
  }
}
