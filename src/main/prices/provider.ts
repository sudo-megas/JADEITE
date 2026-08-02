/**
 * The provider contract — XJADEITE §14.
 *
 * "An unofficial source *will* change someday and must be replaceable without
 * touching anything else." Everything above this file speaks in these types and
 * knows nothing about websockets, form posts or Turkish field names; everything
 * below implements them and knows nothing about the vault.
 *
 * **Nothing here throws.** §14 requires that offline and provider-broken states
 * be "quiet and non-blocking", and that is unenforceable if a transport can
 * throw past its caller into a handler that was written for a database error.
 * Both methods answer with `PriceResult`, which the rest of the application
 * already reads everywhere else as `Result`.
 *
 * **The signal is a parameter, not a provider-owned timeout.** The vault can
 * lock while a fetch is in flight, and when it does the fetch has nowhere to put
 * its answer; the service aborts rather than letting a socket outlive the key
 * that would have made its result meaningful.
 */

import type { LivePriceErrorCode, TypeCode } from '../../shared/section3/types.js'

/**
 * One instrument's current price, in the same scale a manual price is stored in:
 * integer kuruş per major unit — per gram, per coin, per dollar.
 *
 * **satış**, always (§14.3). The owner's own recorded purchase prices sit at or
 * slightly above satış, which is an ordinary retail premium, so satış is the
 * figure that means anything beside their numbers. Storing both quotes was
 * rejected in §8.5 for doubling every row to answer a question nobody asks.
 */
export interface Quote {
  typeCode: TypeCode
  value: number
}

/** What one connect-take-a-frame-disconnect returns. */
export interface Snapshot {
  /** Which provider said so. Stored on every row (§14, swappability). */
  provider: string
  /** When this process received the frame, ISO-8601. */
  fetchedAt: string
  quotes: readonly Quote[]
  /**
   * Mapped instruments the frame carried but whose satış could not be read —
   * missing, non-textual, zero, or past the ceiling.
   *
   * These two lists exist because their absence hid a defect for days. A frame
   * yielding two of ten was a success by the only test there was
   * (`quotes.length === 0`), so the service recorded `ok`, the provider read
   * healthy, and the eight blank rows were indistinguishable from a source that
   * simply had nothing to say about gold today.
   *
   * The split matters as much as the count. Ten *unreadable* is a field that
   * changed shape; ten *absent* is an instrument that was renamed; one absent is
   * the source genuinely dropping a coin. Those are three different mornings,
   * and before this they produced one identical silence.
   */
  unreadable: readonly TypeCode[]
  /** Mapped instruments the frame did not carry at all. */
  absent: readonly TypeCode[]
}

/**
 * One daily close.
 *
 * `date` is the day the price belongs to, which is emphatically not the moment
 * it was fetched. §14.2's stale-cache trap is precisely a response whose dates
 * are older than the dates asked for while looking perfectly well-formed, so the
 * two are separate fields everywhere they travel together.
 */
export interface Close {
  typeCode: TypeCode
  /** YYYY-MM-DD. */
  date: string
  value: number
}

export interface HistoryRequest {
  typeCode: TypeCode
  /** Inclusive, YYYY-MM-DD. */
  from: string
  /** Inclusive, YYYY-MM-DD. */
  to: string
}

/**
 * Why a fetch produced nothing usable.
 *
 * Five codes, and two that an earlier draft had and this one does not.
 * `BLOCKED` is gone because the chokepoint's only callers pass module constants
 * that are members of the allowlist by construction, so a refusal means the
 * build gate was subverted rather than that the owner's network misbehaved —
 * that is an assertion, not a sentence to show someone. `RATE_LIMITED` is gone
 * because a too-soon refresh is not a failure: the service simply returns what
 * it already had, and the interface shows the existing timestamp.
 */
export type PriceErrorCode = LivePriceErrorCode

export type PriceResult<T> = { ok: true; value: T } | { ok: false; error: PriceErrorCode }

export interface PriceProvider {
  readonly id: string
  /**
   * Every host this provider may contact.
   *
   * Not decoration: the registry refuses to load a provider naming a host the
   * allowlist does not, so a swapped-in provider fails at load rather than
   * reaching the chokepoint at runtime and being refused there.
   */
  readonly hosts: readonly string[]
  /** Connect, take one frame, disconnect (§14.1). */
  snapshot(signal: AbortSignal): Promise<PriceResult<Snapshot>>
  /** Daily closes for one type over a range. */
  history(request: HistoryRequest, signal: AbortSignal): Promise<PriceResult<readonly Close[]>>
}
