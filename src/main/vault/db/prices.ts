/**
 * Live price storage — what a provider said, and when the app last asked.
 *
 * Two tables and two different facts. `s3_prices_live` is a price *history*: one
 * row per moment a figure moved. `s3_price_fetch` is a single row saying when
 * the app last looked. Conflating them was the tempting simplification and it is
 * wrong in both directions — the newest `fetched_at` in the price table is the
 * last time a price **changed**, which on a quiet afternoon is days ago, so an
 * interface that read its "last refreshed" from there would report a working
 * provider as stale (schema.ts, V3's third change).
 *
 * Nothing here is the authority on what anything is worth. §8.5 gives that to the
 * owner's typed prices; these rows sit *beside* them and never over them, which
 * is why this module can neither read nor write `s3_prices_manual` and why a
 * failed fetch is a quiet non-event rather than something that blanks a figure.
 *
 * **Every value that arrives here was parsed out of a third party's JSON.** The
 * transport builds `Quote` objects and the compiler is satisfied, but `value:
 * number` is a claim about that parse, not a fact about the datum — a provider
 * that mis-scales a string produces a perfectly typed absurdity. So the meaning
 * is re-checked here against the same bounds the owner's own typed prices face,
 * on the principle the rest of the vault layer already follows: the layer above
 * coerces a shape, this one re-checks what it means, and neither is allowed to
 * assume the other ran.
 */

import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'

import { MAX_YEAR, MIN_YEAR } from '../../../shared/calendar.js'
import { MAX_UNIT_PRICE } from '../../../shared/section3/units.js'
import type { FetchRecord, LivePrice, TypeCode } from '../../../shared/section3/types.js'
import type { PriceErrorCode, Quote, Snapshot } from '../../prices/provider.js'
import { VaultDataError } from './errors.js'

/**
 * Thrown inside a transaction and turned into a Result by the IPC layer.
 *
 * The codes are Section 3's vocabulary, because these rows are shown in Section
 * 3 and a failure has to arrive at the renderer as something 3c can name. Its
 * own class rather than `Section3Error` imported from `section3.ts`: the price
 * store shares no other line with that module, and the IPC layer catches the
 * base class (`security/section3-ipc.ts`), so subclassing buys the identical
 * mapping without tying two modules together that otherwise never meet.
 *
 * Every code used here — `NO_SUCH_TYPE`, `INVALID_PRICE`, `INVALID_DATE`,
 * `INTERNAL` — is already a member of `Section3ErrorCode`, so this module adds
 * nothing to that union and no runtime mirror needs widening.
 */
export class PriceStoreError extends VaultDataError {
  constructor(code: string) {
    super(code)
    this.name = 'PriceStoreError'
  }
}

function fail(code: string): never {
  throw new PriceStoreError(code)
}

// --- Validation ------------------------------------------------------------

/** A provider id is a module constant (`haremaltin`, `mock`), not typed input. */
const MAX_PROVIDER_LENGTH = 32

/**
 * Which provider said so.
 *
 * Trimmed but not case-folded: `id` on the provider interface is the name a
 * registry entry is looked up by, and two ids differing only in case would be
 * two providers as far as the registry is concerned. Folding here would merge
 * their histories into one series and no later read could separate them.
 */
function cleanProvider(provider: unknown): string {
  if (typeof provider !== 'string') fail('INTERNAL')
  const trimmed = provider.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_PROVIDER_LENGTH) fail('INTERNAL')
  return trimmed
}

/**
 * The shape of an instant this module will accept, before it is canonicalised.
 *
 * Hours, minutes and seconds are range-constrained in the pattern rather than
 * left to `Date.parse`, which in V8 accepts `2026-02-31T00:00:00Z` and silently
 * rolls it forward to 3 March — the same leniency `cleanDate` in section3.ts
 * guards against, met again here. Seconds and fractional seconds are optional
 * because a provider may quote either; `24:00` and a leap second `:60` are both
 * legal ISO-8601 and both refused, since neither can arise from a clock read.
 */
const INSTANT_RE =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{1,9})?)?(Z|[+-](0\d|1\d|2[0-3]):[0-5]\d)$/

/**
 * An ISO-8601 instant, **rewritten into the one spelling that sorts**.
 *
 * Every ordering in this module is `ORDER BY fetched_at`, which on a TEXT column
 * is lexicographic. That is only a total order over instants if every writer
 * emits the same fixed-width UTC form: `2026-07-30T09:00:00.000Z` sorts after
 * `2026-07-30T12:00:00+03:00` as text while naming the same moment, and a single
 * offset-bearing timestamp would corrupt every dedup comparison and every
 * "latest per type" read from that point on.
 *
 * So the string is shape-checked, parsed, and **re-emitted** through
 * `toISOString()` rather than stored as typed. The rejected alternative was to
 * refuse anything not already in canonical form, which is stricter and would
 * have made an ordinary `+03:00` from a future provider a hard failure of the
 * whole snapshot — a rewrite that changes the spelling and not the instant costs
 * nothing and cannot be got wrong by a caller.
 *
 * The calendar round-trip is the `cleanDate` check, for the reason given above
 * the pattern. The year bounds are the shared calendar's, so a machine whose
 * clock is set to 1900 or 3000 is refused here rather than writing a row that
 * sorts before or after everything else forever.
 */
function cleanInstant(value: unknown): string {
  if (typeof value !== 'string') fail('INVALID_DATE')
  const trimmed = value.trim()

  const match = INSTANT_RE.exec(trimmed)
  if (!match) fail('INVALID_DATE')

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < MIN_YEAR || year > MAX_YEAR) fail('INVALID_DATE')

  const calendar = new Date(Date.UTC(year, month - 1, day))
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day
  ) {
    fail('INVALID_DATE')
  }

  const parsed = Date.parse(trimmed)
  if (!Number.isFinite(parsed)) fail('INVALID_DATE')

  return new Date(parsed).toISOString()
}

/**
 * Integer kuruş per major unit, against the same bound a typed price faces.
 *
 * Deliberately `MAX_UNIT_PRICE` and not a ceiling of this module's own. A live
 * figure is shown in the same column as the owner's, in the same scale, and two
 * bounds on one quantity is the §4.1 defect this codebase exists to avoid —
 * whichever is looser would decide what the other can hold.
 */
function cleanPrice(price: unknown): number {
  if (typeof price !== 'number' || !Number.isSafeInteger(price)) fail('INVALID_PRICE')
  if (price < 0 || price > MAX_UNIT_PRICE) fail('INVALID_PRICE')
  return price
}

/** The closed list is seeded (§8.2); a code outside it names nothing. */
function assertType(db: DatabaseType, code: unknown): TypeCode {
  if (typeof code !== 'string') fail('NO_SUCH_TYPE')
  const row = db.prepare('SELECT code FROM valuable_types WHERE code = ?').get(code) as
    | { code: string }
    | undefined
  if (!row) fail('NO_SUCH_TYPE')
  return row.code as TypeCode
}

/**
 * What `s3_price_fetch.outcome` may hold: success, or one of §14's failures.
 *
 * `FetchRecord.outcome` is a bare `string` in the shared types, because the
 * renderer only ever shows it and widening the renderer's vocabulary every time
 * a provider gains a failure mode would be a change for nothing. Storage is the
 * layer that decides what may be *written*, so the closed set lives here.
 */
export type FetchOutcome = 'ok' | PriceErrorCode

/**
 * A runtime mirror of that union, kept honest by the compiler.
 *
 * `Record<FetchOutcome, true>` on an object literal is exhaustive in both
 * directions: a missing key and an unknown key are each a build failure. So the
 * one home for the vocabulary stays `prices/provider.ts` — a new error code
 * there breaks this line rather than slipping past a hand-maintained array, and
 * the mirror in `section3-ipc.ts` is precedent for the technique.
 */
const OUTCOMES: Record<FetchOutcome, true> = {
  ok: true,
  OFFLINE: true,
  TIMEOUT: true,
  MALFORMED: true,
  STALE_RANGE: true,
  NO_DATA: true
}

function cleanOutcome(outcome: unknown): FetchOutcome {
  if (typeof outcome !== 'string') fail('INTERNAL')
  if (!Object.hasOwn(OUTCOMES, outcome)) fail('INTERNAL')
  return outcome as FetchOutcome
}

// --- Writing ---------------------------------------------------------------

/**
 * The most recent value for one type from one provider.
 *
 * `fetched_at DESC, id DESC` rather than `fetched_at DESC` alone. Two rows can
 * share a timestamp — a suite pins its instants, and a provider that quoted the
 * same second twice is not impossible — and SQLite would then pick between them
 * arbitrarily. `id` is `AUTOINCREMENT`, so the tiebreak is "whichever was
 * written last", which is the only answer that means anything.
 *
 * This ordering is the same one `readLivePrices` uses, and that is not a
 * coincidence to be maintained by hand: if the dedup check and the read
 * disagreed about which row is latest, a value could be suppressed as a
 * duplicate of a row the interface is not showing.
 */
function latestValue(db: DatabaseType, typeCode: string, provider: string): number | undefined {
  const row = db
    .prepare(
      `SELECT value FROM s3_prices_live
        WHERE type_code = ? AND provider = ?
        ORDER BY fetched_at DESC, id DESC LIMIT 1`
    )
    .get(typeCode, provider) as { value: number } | undefined
  return row?.value
}

/**
 * Store one snapshot, appending **only the figures that moved**.
 *
 * Returns how many rows were written, which is very often zero and is not a
 * failure: this function reports the *write*, while `recordFetch` reports the
 * fetch. A refresh that confirms ten unchanged prices did everything right.
 *
 * The rule is what keeps `s3_prices_live` a genuine price history rather than a
 * log of polling. Auto-refresh every fifteen minutes across ten types would
 * otherwise reach some 350.000 rows a year, all but a handful of them saying
 * nothing had happened; the rejected alternative was to insert everything and
 * add a pruner, which is a second scheduled job that can fail silently and a
 * decision about what to throw away that nobody has to make if it is never
 * written down in the first place.
 *
 * Three edge cases the rule has to get right, none of them obvious:
 *
 * **The first snapshot for a type has no previous row**, and must be written
 * rather than skipped. `latestValue` returning `undefined` is therefore not the
 * same as it returning a value that happens to match.
 *
 * **A price returning to a previous value is a change.** The comparison is
 * against the *latest* row only, never against every row ever stored: gold going
 * 100 → 110 → 100 is three real observations, and treating the third as a
 * duplicate of the first would erase the fact that it came back.
 *
 * **Two providers are independent facts.** The dedup key is `(type_code,
 * provider)`, so a mock and haremaltin quoting the same number store two rows.
 * Merging them would make the history unreadable the moment §14's swap happens.
 *
 * All of it in one transaction. A frame is one observation of the market: nine
 * types stored and one refused would leave the vault holding a moment that never
 * existed, so a single bad quote rolls the whole frame back and the fetch is
 * recorded as the failure it was.
 *
 * A frame carrying an instant older than one already stored is accepted and
 * simply loses the ordering, so it joins the history without displacing what the
 * interface shows. Refusing it was considered and rejected: the only way it can
 * arise is a clock that stepped backwards, and losing an observation is a worse
 * answer to that than recording one out of sequence.
 */
export function appendSnapshot(db: DatabaseType, snapshot: Snapshot): number {
  const provider = cleanProvider(snapshot.provider)
  const fetchedAt = cleanInstant(snapshot.fetchedAt)
  // `quotes` is `readonly Quote[]` to the compiler and an unexamined value at
  // runtime, a provider having built it. The guard is re-stated as a type so the
  // loop below reads a `Quote` rather than whatever a type guard widened it to.
  if (!Array.isArray(snapshot.quotes)) fail('INTERNAL')
  const quotes: readonly Quote[] = snapshot.quotes

  const run = db.transaction(() => {
    // Validated in full before anything is inserted. The transaction would roll
    // a partial write back anyway; doing it in two passes means the duplicate
    // check below sees the whole frame rather than only what precedes it.
    const cleaned: { typeCode: TypeCode; value: number }[] = []
    const seen = new Set<string>()
    for (const quote of quotes) {
      const typeCode = assertType(db, quote.typeCode)
      // One frame quoting a type twice is a provider that parsed its own
      // response wrongly. Refused rather than resolved by last-wins: the two
      // figures would land with an identical `fetched_at`, and the tiebreak that
      // then decides which one the owner sees is an implementation detail, not
      // an answer. §14's remedy for a broken provider is to replace it.
      if (seen.has(typeCode)) fail('INTERNAL')
      seen.add(typeCode)
      cleaned.push({ typeCode, value: cleanPrice(quote.value) })
    }

    const insert = db.prepare(
      `INSERT INTO s3_prices_live (type_code, value, fetched_at, provider)
            VALUES (?, ?, ?, ?)`
    )

    let written = 0
    for (const quote of cleaned) {
      if (latestValue(db, quote.typeCode, provider) === quote.value) continue
      insert.run(quote.typeCode, quote.value, fetchedAt, provider)
      written++
    }
    return written
  })

  return run()
}

/**
 * Record that the app looked, whatever came of it.
 *
 * One row, `CHECK (id = 1)`, overwritten every attempt. Nothing reads a fetch
 * history — the interface wants one timestamp and the limiter wants one more —
 * and REALISATION.md's rule 7 refuses a table built for a reader that does not
 * exist.
 *
 * **`succeeded_at` survives a failure**, via `COALESCE` against the row already
 * there. An offline spell must leave 3c showing the last good figure with an
 * honest age; clearing the column would blank the age instead, which reads as
 * "we have never had a price" when the truth is "we have one, from Tuesday".
 *
 * A success that does not say *when* takes the attempt's own instant. The
 * alternative — `COALESCE` preserving whatever was there — would produce a
 * record that says the last attempt succeeded and the last success was hours
 * ago, which is not a state that can occur and which the interface would render
 * as stale while the provider was working perfectly.
 *
 * The preserved `succeeded_at` may predate a provider swap, so it can name a
 * moment the currently-named provider had nothing to do with. That is the right
 * answer rather than a wart: `readLivePrices` shows whichever provider wrote
 * last, so during a swap-then-fail the figures on screen and the success time
 * beside them come from the same source.
 */
export interface FetchAttempt {
  provider: string
  attemptedAt: string
  outcome: FetchOutcome
  /** Absent on a success means "now"; absent on a failure keeps what was there. */
  succeededAt?: string | null
}

export function recordFetch(db: DatabaseType, record: FetchAttempt): void {
  const provider = cleanProvider(record.provider)
  const attemptedAt = cleanInstant(record.attemptedAt)
  const outcome = cleanOutcome(record.outcome)

  const succeededAt =
    record.succeededAt === null || record.succeededAt === undefined
      ? outcome === 'ok'
        ? attemptedAt
        : null
      : cleanInstant(record.succeededAt)

  const run = db.transaction(() => {
    db.prepare(
      `INSERT INTO s3_price_fetch (id, provider, attempted_at, outcome, succeeded_at)
            VALUES (1, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
            provider     = excluded.provider,
            attempted_at = excluded.attempted_at,
            outcome      = excluded.outcome,
            succeeded_at = COALESCE(excluded.succeeded_at, s3_price_fetch.succeeded_at)`
    ).run(provider, attemptedAt, outcome, succeededAt)
  })
  run()
}

// --- Reading ---------------------------------------------------------------

interface LivePriceRow {
  type_code: string
  value: number
  fetched_at: string
  provider: string
}

/**
 * The latest figure per type, from the provider in force.
 *
 * **The `MAX(fetched_at) … GROUP BY type_code` idiom this replaces is no longer
 * correct.** It was written when a row's only identity was its type, and it
 * relied on SQLite's documented extension of taking the bare columns from the
 * row that produced the `MAX`. With `provider` on the table it groups *across*
 * providers, so a vault that has heard from two of them yields gram from one and
 * çeyrek from the other — a live column no provider ever quoted, presented as
 * though it were one moment's view of the market. Adding `provider` to the
 * `GROUP BY` does not repair it either: that returns one row per (type,
 * provider) pair, ten rows per provider rather than ten rows. The extension is
 * also undefined on a tie, which the dedup ordering above has to break anyway.
 *
 * So the provider is decided first — whoever wrote most recently — and the
 * latest row per type is taken within it. `types.ts` calls this field "the
 * latest snapshot per type, from the provider in force", and that phrase only
 * has a referent if every row in the answer comes from one source. Because the
 * first snapshot from any provider has no previous rows to be deduplicated
 * against, a newly swapped-in provider populates all ten types on its first
 * success; there is no window in which this read is half-empty.
 *
 * Ordered by `type_code` like `manualPrices`, so the two lists a renderer zips
 * together arrive in the same order.
 */
export function readLivePrices(db: DatabaseType): LivePrice[] {
  const inForce = db
    .prepare('SELECT provider FROM s3_prices_live ORDER BY fetched_at DESC, id DESC LIMIT 1')
    .get() as { provider: string } | undefined
  if (!inForce) return []

  const rows = db
    .prepare(
      `SELECT type_code, value, fetched_at, provider
         FROM s3_prices_live AS live
        WHERE live.provider = ?
          AND live.id = (SELECT candidate.id
                           FROM s3_prices_live AS candidate
                          WHERE candidate.type_code = live.type_code
                            AND candidate.provider  = live.provider
                          ORDER BY candidate.fetched_at DESC, candidate.id DESC
                          LIMIT 1)
        ORDER BY type_code`
    )
    .all(inForce.provider) as LivePriceRow[]

  return rows.map(
    (row): LivePrice => ({
      typeCode: row.type_code as TypeCode,
      value: row.value,
      fetchedAt: row.fetched_at,
      provider: row.provider
    })
  )
}

/** When the app last asked, or null on a vault that never has. */
export function readLastFetch(db: DatabaseType): FetchRecord | null {
  const row = db
    .prepare('SELECT provider, attempted_at, outcome, succeeded_at FROM s3_price_fetch WHERE id = 1')
    .get() as
    | { provider: string; attempted_at: string; outcome: string; succeeded_at: string | null }
    | undefined
  if (!row) return null

  return {
    provider: row.provider,
    attemptedAt: row.attempted_at,
    outcome: row.outcome,
    succeededAt: row.succeeded_at
  }
}
