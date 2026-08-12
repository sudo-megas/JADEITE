/**
 * Reading the source's two answers — and refusing the two that look like
 * answers and are not (XJADEITE §14.2).
 *
 * **Pure, by construction.** No electron, no node, no I/O: strings in,
 * `PriceResult` out. Two reasons, and the second is the load-bearing one.
 *
 *   1. It is what lets `tests/unit/prices-parse.test.ts` run this under plain
 *      Node against hand-authored bodies, so the two §14.2 defences are proved
 *      without a socket, a vault or a browser.
 *   2. The transports own a connection and nothing else. Every judgement about
 *      whether a body means anything happens here, once, where it can be read in
 *      one sitting — rather than half in a `message` handler and half in a
 *      response callback, which is how the two silent failures got past the
 *      source's own consumers in the first place.
 *
 * **Everything arriving here is untrusted.** Not because the source is hostile
 * but because it is unofficial: no contract, no version, no notice before a
 * field changes shape (§14.1). So the rule throughout is *bound it, check it,
 * and drop what cannot be read* — never coerce, never default, and never let a
 * `NaN` reach a `Quote`, where it would be stored as a price and rendered as a
 * dash or a zero depending on which formatter saw it first.
 *
 * **The one disposal rule, in both directions.** A single unreadable instrument
 * or row is *dropped*; the answer as a whole fails only when nothing usable is
 * left, or when what is left would mislead. That is why one absurd coin quote
 * cannot deny the owner the other nine prices, and equally why a series whose
 * tail went missing is refused outright rather than charted four months short.
 * An absent figure reads as "no live value"; a wrong one reads as a price.
 */

import { MAX_YEAR, MIN_YEAR } from '../../../shared/calendar.js'
import type { TypeCode } from '../../../shared/section3/types.js'
import { MAX_UNIT_PRICE } from '../../../shared/section3/units.js'
import type {
  Close,
  HistoryRequest,
  PriceErrorCode,
  PriceResult,
  Quote,
  Snapshot
} from '../provider.js'
import { MAPPINGS } from './mapping.js'

/**
 * How far behind the requested `to` the newest returned close may fall before
 * the response is treated as truncated (§14.2 item 1).
 *
 * Three days, and the number is a judgement between two real quantities. A
 * daily-close series legitimately skips a weekend, so a Friday close answering a
 * Sunday request is two days short and perfectly healthy; a market holiday
 * adjoining that weekend makes three. The observed cache bug was **four months**
 * short. There is no value between those two that is hard to choose.
 *
 * It is exported so the test can cite the boundary rather than restate it, and
 * so the service can say in an error message how stale is too stale.
 *
 * Two honest limits, both for the caller rather than for this module. A
 * Kurban or Ramazan Bayramı abutting a weekend can close the market for longer
 * than three days, so a legitimate `STALE_RANGE` is possible once or twice a
 * year — the service must not read a single one as a dead provider. And if the
 * caller ever asks for a `to` in the future, *every* response is short by the
 * distance to that date and every fetch fails: `to` must be clamped to today by
 * whoever builds the request.
 */
export const STALE_RANGE_TOLERANCE_DAYS = 3

/**
 * Bounds on the two texts, in characters — `String.length` counts characters,
 * not bytes, and the distinction is worth the two extra letters in the name.
 *
 * Deliberately loose. The observed price frame is about 9,5 KB for 55
 * instruments and a full gold history back to 2012 is roughly a quarter of a
 * megabyte, so these are one and two orders of magnitude clear of reality. A
 * tight bound would break the day the source adds instruments, which is the
 * failure mode of every clever limit; what these exist to stop is a broken or
 * hostile peer streaming megabytes into `JSON.parse`, where the cost is paid
 * before any of the checks below get a chance to run.
 */
export const MAX_SNAPSHOT_FRAME_CHARS = 262_144
export const MAX_HISTORY_BODY_CHARS = 4_194_304

function fail<T>(error: PriceErrorCode): PriceResult<T> {
  return { ok: false, error }
}

/** A JSON object, as distinct from an array or a null — both of which `typeof` calls an object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * A dot-decimal string as integer kuruş, or `null` if it is not one.
 *
 * **Assembled from digits, never multiplied.** The obvious reading —
 * `Math.round(parseFloat(text) * 100)` — is wrong often enough to matter at the
 * four decimal places this source sends. Measured over 400.000 four-decimal
 * strings in the price range, it disagrees with the exact answer 201 times, or
 * about one in two thousand: `parseFloat('1051.4950') * 100` is
 * `105149.49999999999`, so it rounds to 105149 where a person with a pencil
 * gets 105150. One kuruş on one gram is nothing in itself, and it is also a
 * figure that disagrees with the owner's own arithmetic for no reason they could
 * ever discover. `money.ts` assembles typed amounts as strings for exactly this
 * reason; a price arriving from a third party deserves the same treatment.
 *
 * `money.ts` itself is not reused here because it reads the *app language's*
 * separators (§13) — a Turkish decimal comma. This source's format is neither
 * language: it is dot-decimal, always, whatever the app is set to. Passing
 * provider text through a locale-aware parser would make a price depend on a
 * display setting.
 *
 * A non-string is refused, and after `parseKeepingText` that means something
 * precise: not "the source sent a number" — it cannot have, every number is
 * replaced by its own text before this runs — but "the source sent a boolean, a
 * null, an object, an array". There is no text to read, so there is no price.
 *
 * **This paragraph used to say something else, and what it said was wrong.** It
 * read: *"A JSON number is refused rather than accepted with `String(value)`,
 * because by the time this function could see one it has already been through a
 * double inside `JSON.parse` — accepting it would quietly reintroduce the drift
 * the whole function exists to avoid."* The premise is right and the conclusion
 * does not follow. `JSON.parse` makes the double at the moment it reads the
 * literal, before any consumer is consulted; refusing the value here preserves
 * no precision, because there is nothing left to preserve. It only discards the
 * price. The defence described a guard standing one room past the door.
 *
 * It cost eight of the ten instruments. The source began emitting canonical
 * decimals unquoted — `"satis":6183.53` where it once wrote `"satis":"6183.53"`
 * — and every gold type and silver fell through this line, while USD and EUR
 * survived only because the source pads currency pairs to four decimals
 * (`"47.4770"`), which does not round-trip and so stays a string. Two quotes out
 * of ten is not zero, so nothing failed; the fetch was recorded as a success
 * with the gold rows blank.
 *
 * The answer is not to accept `String(value)` — that would work, and it would
 * rest on the observed habit that a value is emitted unquoted exactly when its
 * text is canonical, which is a third party's habit and not a contract. The
 * answer is to never let the money text become a double at all. See
 * `parseKeepingText`.
 *
 * For the record, since the old paragraph named it: the drift this module
 * genuinely exists to avoid is the *multiplication*, not the parse.
 * `parseFloat('1051.4950') * 100` is `105149.49999999999`. That is why the
 * digits below are assembled as text and never multiplied.
 */
const DECIMAL_RE = /^\d{1,12}(?:\.\d{1,8})?$/

/**
 * `JSON.parse`, with every number left as the text the source wrote.
 *
 * ES2025 hands a reviver the source text of each primitive it visits, so a
 * money figure can be taken as the decimal that arrived rather than as the
 * double `JSON.parse` produced from it. Both engines here have it — Node
 * 24.18.1 and Electron 42.8.0 (V8 14.8.178.38), checked in both binaries.
 *
 * **The invariant this establishes, and the reason it is worth a function of
 * its own:** past this call, no value anywhere in the parsed body is a JSON
 * number. Every one is its own decimal text. Nothing in this module reads a
 * number today — `error` is a boolean, `kayit_tarihi` and the event name are
 * strings — and anyone who later writes `typeof x === 'number'` against a body
 * that came through here will find a string and should know why.
 *
 * `context?.source`, not `context.source`: on an engine without the feature the
 * reviver is called with two arguments. The optional chain makes that case a
 * number passing through untouched — refused downstream exactly as it is
 * today — rather than a `TypeError` that would turn every frame into
 * `MALFORMED` with nothing to say why.
 */
function parseKeepingText(text: string): unknown {
  return JSON.parse(text, (_key, value, context) =>
    typeof value === 'number' && typeof context?.source === 'string' ? context.source : value
  )
}

function parseKurus(raw: unknown): number | null {
  if (typeof raw !== 'string') return null

  const text = raw.trim()
  if (!DECIMAL_RE.test(text)) return null

  const point = text.indexOf('.')
  const whole = point === -1 ? text : text.slice(0, point)
  // Padded to three so the third decimal — the one that decides the rounding —
  // always exists, whether or not the source sent it.
  const fraction = (point === -1 ? '' : text.slice(point + 1)).padEnd(3, '0')

  const truncated = Number(`${whole}${fraction.slice(0, 2)}`)
  if (!Number.isSafeInteger(truncated)) return null

  // Half away from zero, as `units.ts` rounds. The input cannot be negative —
  // the pattern above admits no sign — so this is half-up.
  return fraction.charAt(2) >= '5' ? truncated + 1 : truncated
}

/**
 * The same reading, plus the two questions that decide whether a figure may be
 * stored at all.
 *
 * **Zero and blank are dropped, not stored.** The source publishes `0` or an
 * empty string for an instrument that is not trading, and a stored zero is the
 * one outcome §14 explicitly forbids: a type with no live price must read as
 * having none, never as being worth nothing.
 *
 * **Above `MAX_UNIT_PRICE` is dropped too**, and that is the harder call. The
 * ceiling is ₺500.000 per unit, shared with the ledger and with the owner's own
 * typed prices. At the figures the socket actually sends — a beşli at ₺206.869
 * on 30 July 2026 — it does not bind, but it did until this Realisation raised
 * it from ₺100.000, and the reason it was raised is that a real correct quote
 * was tripping it.
 *
 * Dropping the one quote was chosen over failing the whole frame `MALFORMED`.
 * Failing would mean one coin the application cannot represent denies the owner
 * the nine prices it can, every refresh, forever — and §14 asks for degradation
 * that is "quiet and non-blocking". Dropping leaves that coin showing no live
 * value, which is a state the interface already has to render honestly. This
 * remains the right disposal even though the ceiling now clears every real
 * quote: a source that loses a decimal point is exactly the failure an
 * unofficial feed produces, and one garbled instrument must not cost the owner
 * the nine good ones.
 */
function usablePrice(raw: unknown): number | null {
  const kurus = parseKurus(raw)
  if (kurus === null || kurus <= 0 || kurus > MAX_UNIT_PRICE) return null
  return kurus
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * A `YYYY-MM-DD` date as a whole number of days since the epoch, or `null`.
 *
 * UTC throughout and integer days out, because the only question ever asked of
 * these values is how far apart two dates are. Comparing timestamps instead
 * would put the machine's timezone into the answer, and a comparison that
 * changes result when the owner flies somewhere is not a comparison.
 *
 * The calendar round-trip is what rejects `2026-02-31`: `Date.UTC` accepts it
 * and rolls it forward to 3 March, exactly the leniency the vault's own date
 * checks guard against.
 */
const MS_PER_DAY = 86_400_000

function dayNumber(date: string): number | null {
  const match = DATE_RE.exec(date)
  if (!match) return null

  const [, year, month, day] = match
  if (year === undefined || month === undefined || day === undefined) return null

  // The same plausibility floor and ceiling the vault's own dates carry
  // (`cleanDate` in db/section3.ts) — a provider is as capable of sending a
  // year the calendar shape alone would accept and no owner's history could
  // ever contain as a hand-typed date is.
  if (Number(year) < MIN_YEAR || Number(year) > MAX_YEAR) return null

  const stamp = Date.UTC(Number(year), Number(month) - 1, Number(day))
  if (!Number.isFinite(stamp)) return null

  const back = new Date(stamp)
  if (
    back.getUTCFullYear() !== Number(year) ||
    back.getUTCMonth() !== Number(month) - 1 ||
    back.getUTCDate() !== Number(day)
  ) {
    return null
  }

  return stamp / MS_PER_DAY
}

// --- Live prices -----------------------------------------------------------

/**
 * The socket.io envelope, as loosely as it can be described and still be
 * recognised: an optional engine.io/socket.io numeric prefix, an optional
 * namespace segment, and then the JSON array.
 *
 * Only the shape of the prefix is checked, never its meaning. Pinning the exact
 * `42` would make this parser a hostage to a protocol version nobody here
 * chose, and the event name inside the array is the real identification anyway.
 */
const FRAME_PREFIX_RE = /^\d{0,8}(?:\/[^,[]{0,64},)?\d{0,8}$/

/** The one event this application listens for (§14.1). */
const PRICE_EVENT = 'price_changed'

/**
 * One `price_changed` frame as a snapshot.
 *
 * **It takes the raw frame text, prefix and all**, rather than an event object
 * the transport has already picked apart. The alternative was tempting — the
 * transport `JSON.parse`s, dispatches on the event name, and hands over the
 * payload — but it puts the decision *"is this frame prices?"* in the module
 * that owns the socket, which means the untrusted-input handling lives in two
 * files and the one that also holds a network connection does the first half of
 * it. Here the transport holds a socket and forwards strings; it makes no
 * judgements at all.
 *
 * A consequence the transport must be written to expect: **a frame that is not
 * `price_changed` comes back `MALFORMED`, and that means "not yet", not
 * "give up"**. The handshake, the namespace acknowledgement and engine.io's
 * pings are all ordinary traffic on this socket. The transport keeps offering
 * frames until one parses or its own deadline expires, and the deadline — not
 * this function — is what produces `TIMEOUT`.
 *
 * `now` is a parameter rather than a `Date` read inside, so the function stays
 * pure and a test can pin the timestamp. It is passed through unexamined: the
 * vault's price store canonicalises and range-checks every instant it is given
 * (`vault/db/prices.ts`), and a second opinion here would be a second home for
 * that rule.
 */
export function parseSnapshotFrame(
  text: string,
  provider: string,
  now: string
): PriceResult<Snapshot> {
  if (text.length === 0 || text.length > MAX_SNAPSHOT_FRAME_CHARS) return fail('MALFORMED')

  const open = text.indexOf('[')
  if (open === -1) return fail('MALFORMED')
  if (!FRAME_PREFIX_RE.test(text.slice(0, open))) return fail('MALFORMED')

  let frame: unknown
  try {
    frame = parseKeepingText(text.slice(open))
  } catch {
    return fail('MALFORMED')
  }

  if (!Array.isArray(frame)) return fail('MALFORMED')
  const parts: readonly unknown[] = frame
  if (parts[0] !== PRICE_EVENT) return fail('MALFORMED')

  const payload = parts[1]
  if (!isRecord(payload)) return fail('MALFORMED')

  // The instruments arrive under `data`. The unwrapping is tolerant of their
  // arriving at the top level instead, because the wrapper is the least
  // load-bearing thing in the frame and the one guarantee §14.1 gives is that
  // none of this is a contract. Tolerance costs nothing here: every instrument
  // still has to be an object carrying a well-formed satış before it becomes a
  // quote, so a frame of the wrong shape yields no quotes rather than bad ones.
  const nested = payload['data']
  const instruments = isRecord(nested) ? nested : payload

  // Every mapped instrument lands in exactly one of three buckets, and the
  // frame's own key set decides which. `Object.hasOwn` rather than `in`, so a
  // name that happens to sit on `Object.prototype` cannot present itself as an
  // instrument the source sent.
  //
  // The taxonomy is the point, so it is worth stating: an entry that arrives
  // with no readable satış is **unreadable**, not absent. The source sent the
  // instrument; the shape did not match. That is what separates a renamed field
  // (ten unreadable) from a renamed instrument (ten absent) from a source that
  // has genuinely stopped quoting one coin (one absent). The disposal rule above
  // is untouched — a single unreadable instrument is still dropped rather than
  // failing the frame — but it is no longer dropped *silently*.
  const quotes: Quote[] = []
  const unreadable: TypeCode[] = []
  const absent: TypeCode[] = []

  for (const { typeCode, sourceCode } of MAPPINGS) {
    if (!Object.hasOwn(instruments, sourceCode)) {
      absent.push(typeCode)
      continue
    }

    const entry = instruments[sourceCode]
    if (!isRecord(entry)) {
      unreadable.push(typeCode)
      continue
    }

    // satış, always (§14.3) — the owner's own purchase prices sit at or slightly
    // above it, so it is the only figure that means anything beside theirs.
    const value = usablePrice(entry['satis'])
    if (value === null) {
      unreadable.push(typeCode)
      continue
    }

    quotes.push({ typeCode, value })
  }

  // The source pushes all 55 instruments in every frame, so a frame yielding
  // none of the ten is not a snapshot that happens to be empty — it is a body
  // this parser could not read. Reporting it as an empty success would have the
  // service record a fetch that worked and store nothing.
  if (quotes.length === 0) return fail('MALFORMED')

  return { ok: true, value: { provider, fetchedAt: now, quotes, unreadable, absent } }
}

// --- History ---------------------------------------------------------------

/** `YYYY-MM-DD HH:MM:SS`, of which only the date half is a fact about the close. */
const TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2})(?:[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?)?$/

/** One record, after it has been read and before duplicates are resolved. */
interface DatedClose {
  day: number
  date: string
  /** The full `kayit_tarihi`, which decides which of two records for one day wins. */
  stamp: string
  value: number
}

/**
 * One `ajax/cur/history` body as daily closes — and the two §14.2 defences.
 *
 * Both silent failures arrive as HTTP 200 with `error:false`, so neither is
 * visible to the transport and both are checked here:
 *
 *   - **No `data` key at all** → `NO_DATA`. A span of thirty days or fewer
 *     returns valid JSON with the key simply absent; the source's own page
 *     guards on exactly this, which is what makes it expected behaviour rather
 *     than a fault. Absent is **not** the same as `data: []`, and the difference
 *     is kept: an empty array is a real answer meaning "no closes in that range"
 *     and comes back as an empty success.
 *   - **A returned range short of the range requested** → `STALE_RANGE`. A stale
 *     server-side cache truncates the tail behind a complete-looking series, and
 *     it is not monotone in the start date, so nothing about the request can
 *     predict it. Only the response can be asked.
 *
 * The staleness test compares the **newest** date present against the requested
 * `to`, not the last element of the array. Trusting the array's order would let
 * a single out-of-order record at the end report a healthy series as truncated;
 * taking the maximum cannot be fooled in the direction that matters, since a
 * maximum below the tolerance means no record anywhere in the body is recent.
 *
 * There is deliberately **no matching check against `from`.** The source's gold
 * series begins in 2012, so a request reaching further back legitimately returns
 * a later start, and refusing that would refuse the honest half of the answer.
 *
 * The closes carry `request.typeCode` because the body does not name its own
 * instrument — the `kod` went out in the form and nothing comes back with it. So
 * the request is the only witness to what these numbers are, which is why it is
 * a parameter here rather than something the caller stamps on afterwards.
 */
export function parseHistoryBody(
  text: string,
  request: HistoryRequest
): PriceResult<readonly Close[]> {
  if (text.length === 0 || text.length > MAX_HISTORY_BODY_CHARS) return fail('MALFORMED')

  // A body cannot be validated against a range that is not a range. This is a
  // caller's error rather than the source's, and it is reported as a malformed
  // answer rather than thrown: nothing in this layer throws (`provider.ts`).
  const requestedTo = dayNumber(request.to)
  if (requestedTo === null) return fail('MALFORMED')

  let body: unknown
  try {
    body = parseKeepingText(text)
  } catch {
    return fail('MALFORMED')
  }

  if (!isRecord(body)) return fail('MALFORMED')

  // A body that declares its own failure is not prices, whatever else it holds.
  if (body['error'] === true) return fail('MALFORMED')

  const rows = body['data']
  // `null` counts as absent along with a missing key: both say the response
  // carried no series, and inventing a distinction between two spellings of
  // nothing would give the service a fourth case to handle for no gain.
  if (rows === undefined || rows === null) return fail('NO_DATA')
  if (!Array.isArray(rows)) return fail('MALFORMED')

  const records: readonly unknown[] = rows
  if (records.length === 0) return { ok: true, value: [] }

  // Latest record per calendar date. A daily-close series should carry one row
  // per day, and two rows claiming the same day cannot both be its close — the
  // later timestamp is the nearer one. The rejected alternative was to return
  // both and let the vault's uniqueness constraint decide, which would make the
  // order of an insert loop load-bearing and would fail a whole write over a
  // duplicate the source is entitled to send.
  const byDate = new Map<string, DatedClose>()

  for (const record of records) {
    if (!isRecord(record)) continue

    const rawStamp = record['kayit_tarihi']
    if (typeof rawStamp !== 'string') continue
    // Trimmed once, here, and carried in that form from here on — the
    // comparison below is a plain string compare, and an untrimmed value
    // would let incidental leading whitespace (which sorts before every
    // digit) decide which of two same-day rows counts as "later" instead of
    // the timestamp actually doing so.
    const stamp = rawStamp.trim()

    const match = TIMESTAMP_RE.exec(stamp)
    const date = match?.[1]
    if (date === undefined) continue

    const day = dayNumber(date)
    if (day === null) continue

    const value = usablePrice(record['satis'])
    if (value === null) continue

    const seen = byDate.get(date)
    if (seen === undefined || seen.stamp <= stamp) byDate.set(date, { day, date, stamp, value })
  }

  // Rows arrived and not one of them was a price. That is a body this parser
  // could not read — reporting it as an empty series would tell the owner the
  // market had no closes in four years.
  if (byDate.size === 0) return fail('MALFORMED')

  const closes: DatedClose[] = [...byDate.values()].sort((a, b) => a.day - b.day)

  // Non-null by the size check above; taken from the sorted tail rather than
  // trusting the source's own ordering.
  const newest = closes[closes.length - 1]
  if (newest === undefined) return fail('MALFORMED')
  if (requestedTo - newest.day > STALE_RANGE_TOLERANCE_DAYS) return fail('STALE_RANGE')

  const typeCode: TypeCode = request.typeCode
  return {
    ok: true,
    value: closes.map((close) => ({ typeCode, date: close.date, value: close.value }))
  }
}
