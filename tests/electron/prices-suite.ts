/**
 * Live price storage — the append-only-on-change rule, and the fetch record.
 *
 * Inside Electron because it opens a real SQLCipher database, and against real
 * rows rather than a stubbed table: what is being proved is that ten types
 * polled every quarter of an hour leave behind a price *history* and not a log
 * of polling, and that is a claim about what SQLite ends up holding.
 *
 * Every instant below is written out in full rather than taken from the clock.
 * Two `new Date().toISOString()` calls in a row can land in the same millisecond,
 * and the whole of `readLivePrices` turns on which of two rows is later — a
 * suite that made that a race would fail once a fortnight and be believed.
 *
 * The second half of the file goes a layer up and drives `refreshPrices` end to
 * end against the shipped mock providers — the swap, and §14.2's two silent
 * failures. It lives beside the storage tests rather than in a suite of its own
 * because every one of its claims is finally a claim about rows: *which* figures
 * are in the vault after a swap, and that a refused response leaves none at all.
 *
 * No network, by REALISATION.md rule 6: every figure here is typed by hand, the
 * provider ids are names rather than endpoints, and the three providers these
 * tests select all declare `hosts: []`.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'
import { afterEach, beforeEach, describe, expect, it } from './harness.js'

import { generateDek } from '../../src/main/vault/dek.js'
import { closeDatabase, openDatabase } from '../../src/main/vault/db/connection.js'
import { seedDefaultSettings } from '../../src/main/vault/db/settings.js'
import * as prices from '../../src/main/vault/db/prices.js'
import type { Close, PriceResult, Snapshot } from '../../src/main/prices/provider.js'
import { cancelInFlight, refreshPrices, resetLimiterForTests } from '../../src/main/prices/service.js'
import { loadProvider } from '../../src/main/prices/registry.js'
import { MOCK_TYPE_COUNT } from '../../src/main/prices/mock/index.js'
import {
  DATALESS_HISTORY_REQUEST,
  GOOD_HISTORY_REQUEST,
  TRUNCATED_HISTORY_REQUEST
} from '../../src/main/prices/mock/recorded.js'
import type { TypeCode } from '../../src/shared/section3/types.js'
import { MAX_UNIT_PRICE } from '../../src/shared/section3/units.js'

let dir: string
let db: DatabaseType

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'jadeite-prices-'))
  db = openDatabase(join(dir, 'jadeite.db'), generateDek())
  seedDefaultSettings(db)
})

afterEach(() => {
  closeDatabase(db)
  rmSync(dir, { recursive: true, force: true })
})

/** Quarter-hour apart, which is the auto-refresh interval §14 describes. */
const T1 = '2026-07-30T09:00:00.000Z'
const T2 = '2026-07-30T09:15:00.000Z'
const T3 = '2026-07-30T09:30:00.000Z'

function snapshot(
  provider: string,
  fetchedAt: string,
  quotes: readonly (readonly [TypeCode, number])[],
  coverage: { unreadable?: readonly TypeCode[]; absent?: readonly TypeCode[] } = {}
): Snapshot {
  // The two coverage lists are written out rather than defaulted away, because
  // a `Snapshot` that does not say what it failed to price is the shape that let
  // a two-of-ten frame be recorded as a success. A helper is allowed to default
  // them to empty — every case here quotes what it means to quote — but it is
  // not allowed to omit them.
  return {
    provider,
    fetchedAt,
    quotes: quotes.map(([typeCode, value]) => ({ typeCode, value })),
    unreadable: coverage.unreadable ?? [],
    absent: coverage.absent ?? []
  }
}

/**
 * A code the closed list no longer has, and an outcome the vocabulary never had.
 *
 * Both are widened through `string` on the way to their union, because neither
 * union contains them — which is exactly what makes them worth testing. A cast
 * straight from the literal is refused by the compiler, and rightly: the point
 * of these two constants is to smuggle past the type system a value that only
 * the runtime check can catch, which is the case the runtime check exists for.
 */
const RETIRED_TYPE = 'ziynet' as string as TypeCode
const RETIRED_OUTCOME = 'RATE_LIMITED' as string as prices.FetchOutcome

/** Counted straight out of the table: the rule is about rows, so rows are read. */
function rowCount(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM s3_prices_live').get() as { n: number }).n
}

// --- The append-only-on-change rule ----------------------------------------

describe('a snapshot is appended only when a figure has moved (§14)', () => {
  it('writes every quote of the first frame, there being nothing to compare against', () => {
    const written = prices.appendSnapshot(
      db,
      snapshot('haremaltin', T1, [
        ['gram', 650_500],
        ['ceyrek', 1_100_000],
        ['usd', 4_130]
      ])
    )

    expect(written).toBe(3)
    expect(rowCount()).toBe(3)
  })

  /**
   * The whole reason the rule exists. Fifteen minutes later the market has not
   * moved, and the vault must be exactly as it was — not ten rows heavier.
   */
  it('writes nothing at all when the next frame agrees, and that is not a failure', () => {
    const frame = [
      ['gram', 650_500],
      ['ceyrek', 1_100_000]
    ] as const

    expect(prices.appendSnapshot(db, snapshot('haremaltin', T1, frame))).toBe(2)
    expect(prices.appendSnapshot(db, snapshot('haremaltin', T2, frame))).toBe(0)
    expect(rowCount()).toBe(2)
  })

  it('writes only the figures that moved, and leaves the rest alone', () => {
    prices.appendSnapshot(
      db,
      snapshot('haremaltin', T1, [
        ['gram', 650_500],
        ['ceyrek', 1_100_000]
      ])
    )

    const written = prices.appendSnapshot(
      db,
      snapshot('haremaltin', T2, [
        ['gram', 671_200],
        ['ceyrek', 1_100_000]
      ])
    )

    expect(written).toBe(1)
    expect(rowCount()).toBe(3)
  })

  /**
   * 100 → 110 → 100 is three observations, not two. The comparison is against
   * the latest row only; anything that asked "have we ever seen this value"
   * would drop the third and leave a history claiming the price never came back.
   */
  it('treats a return to a previous value as the observation it is', () => {
    prices.appendSnapshot(db, snapshot('haremaltin', T1, [['gram', 100]]))
    prices.appendSnapshot(db, snapshot('haremaltin', T2, [['gram', 110]]))
    const written = prices.appendSnapshot(db, snapshot('haremaltin', T3, [['gram', 100]]))

    expect(written).toBe(1)
    expect(rowCount()).toBe(3)

    const live = prices.readLivePrices(db)
    expect(live).toHaveLength(1)
    expect(live[0]?.value).toBe(100)
    expect(live[0]?.fetchedAt).toBe(T3)
  })

  /**
   * Asserted on the row count rather than through `readLivePrices`, which scopes
   * to one provider by design and would show only the later of the two.
   */
  it('keeps two providers apart, the dedup key being type and provider', () => {
    expect(prices.appendSnapshot(db, snapshot('haremaltin', T1, [['gram', 650_500]]))).toBe(1)
    expect(prices.appendSnapshot(db, snapshot('mock', T2, [['gram', 650_500]]))).toBe(1)
    expect(rowCount()).toBe(2)

    // And each still deduplicates against itself.
    expect(prices.appendSnapshot(db, snapshot('mock', T3, [['gram', 650_500]]))).toBe(0)
    expect(rowCount()).toBe(2)
  })

  it('accepts a frame with no quotes, writing nothing', () => {
    expect(prices.appendSnapshot(db, snapshot('haremaltin', T1, []))).toBe(0)
    expect(rowCount()).toBe(0)
  })
})

// --- What a provider may not get past this layer ----------------------------

describe('a quote is re-checked rather than trusted', () => {
  it('refuses a type outside the closed list (§8.2)', () => {
    // Ziynet was in the list until schema v3 and is the pointed case: a provider
    // written against the old list would still be quoting it.
    expect(() =>
      prices.appendSnapshot(db, snapshot('haremaltin', T1, [[RETIRED_TYPE, 650_500]]))
    ).toThrow()
    expect(rowCount()).toBe(0)
  })

  it('refuses a negative price, a fractional one, and one past the ceiling', () => {
    expect(() => prices.appendSnapshot(db, snapshot('haremaltin', T1, [['gram', -1]]))).toThrow()
    expect(() =>
      prices.appendSnapshot(db, snapshot('haremaltin', T1, [['gram', 650_500.5]]))
    ).toThrow()
    // The bound itself rather than a figure, so this survives `MAX_UNIT_PRICE`
    // changing — which it must, since beşli quotes above it at present prices.
    expect(() =>
      prices.appendSnapshot(db, snapshot('haremaltin', T1, [['gram', MAX_UNIT_PRICE + 1]]))
    ).toThrow()
    expect(() =>
      prices.appendSnapshot(db, snapshot('haremaltin', T1, [['gram', MAX_UNIT_PRICE]]))
    ).not.toThrow()
  })

  it('accepts a price of zero, a provider quoting nothing being a fact about it', () => {
    expect(() => prices.appendSnapshot(db, snapshot('haremaltin', T1, [['gram', 0]]))).not.toThrow()
  })

  it('refuses a frame that quotes one type twice', () => {
    expect(() =>
      prices.appendSnapshot(
        db,
        snapshot('haremaltin', T1, [
          ['gram', 650_500],
          ['gram', 671_200]
        ])
      )
    ).toThrow()
    expect(rowCount()).toBe(0)
  })

  /**
   * A frame is one observation of the market. Nine types stored and one refused
   * would leave the vault holding a moment that never existed.
   */
  it('stores none of a frame when one quote in it is bad', () => {
    prices.appendSnapshot(db, snapshot('haremaltin', T1, [['gram', 650_500]]))

    expect(() =>
      prices.appendSnapshot(
        db,
        snapshot('haremaltin', T2, [
          ['gram', 671_200],
          ['ceyrek', 1_100_000],
          ['usd', -1]
        ])
      )
    ).toThrow()

    expect(rowCount()).toBe(1)
    expect(prices.readLivePrices(db)[0]?.value).toBe(650_500)
  })

  it('refuses a timestamp that is not an instant', () => {
    expect(() =>
      prices.appendSnapshot(db, snapshot('haremaltin', '2026-07-30', [['gram', 1]]))
    ).toThrow()
    expect(() => prices.appendSnapshot(db, snapshot('haremaltin', '', [['gram', 1]]))).toThrow()
    expect(() =>
      prices.appendSnapshot(db, snapshot('haremaltin', 'dün öğleden sonra', [['gram', 1]]))
    ).toThrow()
  })

  it('refuses a date the calendar does not have, which Date.parse would roll forward', () => {
    expect(() =>
      prices.appendSnapshot(db, snapshot('haremaltin', '2026-02-31T12:00:00.000Z', [['gram', 1]]))
    ).toThrow()
    expect(() =>
      prices.appendSnapshot(db, snapshot('haremaltin', '2026-07-30T24:00:00.000Z', [['gram', 1]]))
    ).toThrow()
  })

  it('refuses a provider that names nothing', () => {
    expect(() => prices.appendSnapshot(db, snapshot('   ', T1, [['gram', 1]]))).toThrow()
  })

  /**
   * `ORDER BY fetched_at` on a TEXT column is lexicographic, so an offset-bearing
   * instant would sort by its printed hour rather than the moment it names. The
   * stored form is rewritten, not refused.
   */
  it('rewrites an offset-bearing instant into the one spelling that sorts', () => {
    prices.appendSnapshot(db, snapshot('haremaltin', '2026-07-30T12:00:00+03:00', [['gram', 1]]))
    expect(prices.readLivePrices(db)[0]?.fetchedAt).toBe('2026-07-30T09:00:00.000Z')
  })

  it('accepts an instant without seconds, and stores it canonically', () => {
    prices.appendSnapshot(db, snapshot('haremaltin', '2026-07-30T09:00Z', [['gram', 1]]))
    expect(prices.readLivePrices(db)[0]?.fetchedAt).toBe(T1)
  })
})

// --- Reading the live column ------------------------------------------------

describe('the live column reads the provider in force', () => {
  it('is empty on a vault that has never fetched', () => {
    expect(prices.readLivePrices(db)).toHaveLength(0)
  })

  it('returns the latest row per type, one row per type and no more', () => {
    prices.appendSnapshot(
      db,
      snapshot('haremaltin', T1, [
        ['gram', 650_500],
        ['ceyrek', 1_100_000]
      ])
    )
    prices.appendSnapshot(
      db,
      snapshot('haremaltin', T2, [
        ['gram', 671_200],
        ['ceyrek', 1_104_000]
      ])
    )
    prices.appendSnapshot(db, snapshot('haremaltin', T3, [['gram', 669_000]]))

    const live = prices.readLivePrices(db)
    expect(live).toHaveLength(2)

    const gram = live.find((p) => p.typeCode === 'gram')
    const ceyrek = live.find((p) => p.typeCode === 'ceyrek')
    expect(gram?.value).toBe(669_000)
    expect(gram?.fetchedAt).toBe(T3)
    expect(ceyrek?.value).toBe(1_104_000)
    expect(ceyrek?.fetchedAt).toBe(T2)
  })

  it('names the provider on every row it returns', () => {
    prices.appendSnapshot(db, snapshot('haremaltin', T1, [['gram', 650_500]]))
    expect(prices.readLivePrices(db)[0]?.provider).toBe('haremaltin')
  })

  /**
   * Not a blend of sources. Two providers in one vault would otherwise yield
   * gram from one and çeyrek from the other, presented as one moment's view of a
   * market that never quoted it.
   */
  it('shows one provider — whichever wrote last — and not a blend of two', () => {
    prices.appendSnapshot(
      db,
      snapshot('haremaltin', T1, [
        ['gram', 650_500],
        ['ceyrek', 1_100_000]
      ])
    )
    prices.appendSnapshot(db, snapshot('mock', T2, [['gram', 1]]))

    const live = prices.readLivePrices(db)
    expect(live).toHaveLength(1)
    expect(live[0]?.provider).toBe('mock')
    expect(live[0]?.value).toBe(1)

    // The earlier provider takes it back by writing again, and brings its whole
    // list with it — the çeyrek the mock never quoted is visible once more.
    prices.appendSnapshot(db, snapshot('haremaltin', T3, [['gram', 671_200]]))
    const back = prices.readLivePrices(db)
    expect(back).toHaveLength(2)
    expect(back.every((p) => p.provider === 'haremaltin')).toBe(true)
  })
})

// --- When the app last looked ------------------------------------------------

describe('the fetch record is when the app looked, not when a price moved (§14)', () => {
  it('is null on a vault that has never asked', () => {
    expect(prices.readLastFetch(db)).toBeNull()
  })

  it('keeps exactly one row however many attempts are made', () => {
    prices.recordFetch(db, { provider: 'haremaltin', attemptedAt: T1, outcome: 'ok' })
    prices.recordFetch(db, { provider: 'haremaltin', attemptedAt: T2, outcome: 'OFFLINE' })
    prices.recordFetch(db, { provider: 'haremaltin', attemptedAt: T3, outcome: 'TIMEOUT' })

    const rows = (db.prepare('SELECT COUNT(*) AS n FROM s3_price_fetch').get() as { n: number }).n
    expect(rows).toBe(1)
    expect(prices.readLastFetch(db)?.attemptedAt).toBe(T3)
    expect(prices.readLastFetch(db)?.outcome).toBe('TIMEOUT')
  })

  /**
   * The offline spell of §14: 3c must go on showing Tuesday's figure with an
   * honest age rather than blanking, so the last success outlives the failures
   * that follow it.
   */
  it('preserves the last success across a failure', () => {
    prices.recordFetch(db, {
      provider: 'haremaltin',
      attemptedAt: T1,
      outcome: 'ok',
      succeededAt: T1
    })
    prices.recordFetch(db, { provider: 'haremaltin', attemptedAt: T2, outcome: 'OFFLINE' })

    const record = prices.readLastFetch(db)
    expect(record?.attemptedAt).toBe(T2)
    expect(record?.outcome).toBe('OFFLINE')
    expect(record?.succeededAt).toBe(T1)
  })

  /**
   * A record saying "the last attempt succeeded" and "the last success was hours
   * ago" describes a state that cannot occur, and the interface would render it
   * as stale while the provider was working perfectly.
   */
  it('takes the attempt’s own instant when a success does not say when', () => {
    prices.recordFetch(db, {
      provider: 'haremaltin',
      attemptedAt: T1,
      outcome: 'ok',
      succeededAt: T1
    })
    prices.recordFetch(db, { provider: 'haremaltin', attemptedAt: T3, outcome: 'ok' })

    expect(prices.readLastFetch(db)?.succeededAt).toBe(T3)
  })

  it('leaves the last success null while no attempt has ever worked', () => {
    prices.recordFetch(db, { provider: 'haremaltin', attemptedAt: T1, outcome: 'OFFLINE' })
    const record = prices.readLastFetch(db)
    expect(record?.succeededAt ?? null).toBeNull()
    expect(record?.provider).toBe('haremaltin')
  })

  it('records a provider swap, the new name replacing the old', () => {
    prices.recordFetch(db, { provider: 'haremaltin', attemptedAt: T1, outcome: 'ok' })
    prices.recordFetch(db, { provider: 'mock', attemptedAt: T2, outcome: 'ok' })
    expect(prices.readLastFetch(db)?.provider).toBe('mock')
  })

  it('refuses an outcome outside the vocabulary', () => {
    expect(() =>
      prices.recordFetch(db, {
        provider: 'haremaltin',
        attemptedAt: T1,
        outcome: RETIRED_OUTCOME
      })
    ).toThrow()
    expect(prices.readLastFetch(db)).toBeNull()
  })

  it('refuses an attempt that is not an instant, and canonicalises one that is', () => {
    expect(() =>
      prices.recordFetch(db, { provider: 'haremaltin', attemptedAt: 'az önce', outcome: 'ok' })
    ).toThrow()

    prices.recordFetch(db, {
      provider: 'haremaltin',
      attemptedAt: '2026-07-30T12:00:00+03:00',
      outcome: 'ok'
    })
    expect(prices.readLastFetch(db)?.attemptedAt).toBe('2026-07-30T09:00:00.000Z')
  })

  /**
   * The two tables answer different questions, which is why there are two. A
   * refresh that confirms an unchanged price writes no price row at all, and the
   * fetch record is the only thing that then says the provider is alive.
   */
  it('advances while the price table does not', () => {
    prices.appendSnapshot(db, snapshot('haremaltin', T1, [['gram', 650_500]]))
    prices.recordFetch(db, { provider: 'haremaltin', attemptedAt: T1, outcome: 'ok' })

    expect(prices.appendSnapshot(db, snapshot('haremaltin', T3, [['gram', 650_500]]))).toBe(0)
    prices.recordFetch(db, { provider: 'haremaltin', attemptedAt: T3, outcome: 'ok' })

    expect(prices.readLivePrices(db)[0]?.fetchedAt).toBe(T1)
    expect(prices.readLastFetch(db)?.attemptedAt).toBe(T3)
  })
})

// === One press of the refresh button ========================================

/**
 * Point the service at a provider, and forget whatever the limiter remembers.
 *
 * The reset is not tidiness. `MIN_INTERVAL_MS` is a full minute and a failed
 * attempt earns exponential backoff on top of it, so without this a test that
 * follows a failing one gets `status: 'skipped'` and asserts nothing it meant
 * to. Every test below that calls `refreshPrices` goes through here first.
 */
function useProvider(id: string): void {
  process.env['JADEITE_PRICE_PROVIDER'] = id
  resetLimiterForTests()
}

/**
 * Put the environment back the way it was found.
 *
 * `delete` rather than assigning `''`: `selectedProviderId` and
 * `selectedFixture` both fall back on an unrecognised value, so an empty string
 * would work — and would leave the next suite in the same process running with
 * variables this file set, which is the kind of coupling that makes a failure
 * depend on registration order.
 */
function forgetProviderChoice(): void {
  delete process.env['JADEITE_PRICE_PROVIDER']
  delete process.env['JADEITE_PRICE_FIXTURE']
  resetLimiterForTests()
}

/** The error code, or `null` on success — the harness has no `.rejects` and no way to narrow. */
function errorOf(result: PriceResult<unknown>): string | null {
  return result.ok ? null : result.error
}

/** The closes, or none. A failed `PriceResult` has no `value` field to read (`provider.ts`). */
function closesOf(result: PriceResult<readonly Close[]>): readonly Close[] {
  return result.ok ? result.value : []
}

/** No caller here abandons a fetch, so one live signal serves them all. */
function liveSignal(): AbortSignal {
  return new AbortController().signal
}

// --- The provider swap -------------------------------------------------------

/**
 * "Provider swap demonstrated with a mock second provider behind the same
 * interface" — mock against mock, and both of them succeeding.
 *
 * Demonstrating the swap against `offline-mock` would have been easier and would
 * have proved only that a failure propagates. What has to be shown is that the
 * *figures on screen* followed the swap: two providers that both return a good
 * snapshot, whose numbers differ, and whose names end up on the rows they wrote.
 * Nothing in `service.ts`, `prices.ts` or the renderer is touched between the
 * two attempts — one environment variable changes, which is the whole claim §14
 * makes about coupling.
 */
describe('a second provider behind the same interface (§14)', () => {
  it('moves every figure and re-attributes every row', async () => {
    try {
      useProvider('mock')
      const first = await refreshPrices(db)
      expect(first.status, 'the first refresh').toBe('ok')
      expect(first.provider).toBe('mock')
      // Asserted against the mapping's own count rather than a literal ten: a
      // parser that silently dropped quotes would still pass every "the figures
      // differ" check below, on whatever subset survived.
      expect(first.written).toBe(MOCK_TYPE_COUNT)

      const before = prices.readLivePrices(db)
      expect(before).toHaveLength(MOCK_TYPE_COUNT)
      expect(before.every((row) => row.provider === 'mock')).toBe(true)

      useProvider('mock-b')
      const second = await refreshPrices(db)
      expect(second.status, 'the second refresh').toBe('ok')
      expect(second.provider).toBe('mock-b')
      // Every figure again, because the dedup key is type *and* provider: a
      // newly swapped-in provider has nothing of its own to be compared against,
      // so its first success populates the whole list and the live column is
      // never half one source and half the other.
      expect(second.written).toBe(MOCK_TYPE_COUNT)

      const after = prices.readLivePrices(db)
      expect(after).toHaveLength(MOCK_TYPE_COUNT)

      // The figures moved — all of them, not merely the total.
      const everyFigureMoved = after.every((row) => {
        const was = before.find((earlier) => earlier.typeCode === row.typeCode)
        return was !== undefined && row.value > was.value
      })
      expect(everyFigureMoved, 'every quote is above the one it replaced').toBe(true)

      // And each row names the provider that actually said so.
      expect(after.every((row) => row.provider === 'mock-b')).toBe(true)
      expect(prices.readLastFetch(db)?.provider).toBe('mock-b')

      // Neither provider's history was overwritten: twenty rows, two sources.
      expect(rowCount()).toBe(MOCK_TYPE_COUNT * 2)
    } finally {
      forgetProviderChoice()
    }
  })

  /**
   * Two figures pinned to the recorded frame's own strings, so the swap above is
   * anchored to something a person can check with a pencil rather than to
   * whatever the mock happens to produce.
   *
   * `KULCEALTIN` quotes satış `6251.37` — two decimals — and `USDTRY` quotes
   * `47.3600` — four, and one of the shapes §14.1 measured on the real socket.
   * Both arrive as integer kuruş: ₺6.251,37 the gram and ₺47,36 the dollar.
   */
  it('stores the recorded satış figures as kuruş, to the last digit', async () => {
    try {
      useProvider('mock')
      expect((await refreshPrices(db)).status).toBe('ok')

      const live = prices.readLivePrices(db)
      expect(live.find((row) => row.typeCode === 'gram')?.value, 'gram').toBe(625_137)
      expect(live.find((row) => row.typeCode === 'usd')?.value, 'usd').toBe(4_736)
    } finally {
      forgetProviderChoice()
    }
  })
})

// --- The two silent failures, driven through the provider --------------------

/**
 * §14.2's two traps, asked of the **provider** rather than of the parser.
 *
 * `tests/unit/prices-parse.test.ts` already proves that `parseHistoryBody`
 * refuses these two bodies. That is a claim about a pure function; what the
 * acceptance checks ask is whether the thing the application actually calls
 * refuses them, which is a different question and is answered here — through
 * `loadProvider`, so the registry's allowlist check runs too.
 *
 * **"Not stored" is structural, and the row counts are the lesser half of the
 * proof.** A refused `PriceResult` is `{ok: false, error}` — it carries no
 * `value` field at all, so there is no `Close[]` in existence for any caller to
 * store, whether or not that caller remembers to check `ok`. The vault is
 * counted before and after anyway, because a claim about what is *not* in the
 * database should be made against the database.
 */
describe('a response that looks like an answer and is not (§14.2)', () => {
  it('refuses a range that falls short of the range asked for, and stores nothing', async () => {
    try {
      expect(rowCount(), 'nothing stored before').toBe(0)
      process.env['JADEITE_PRICE_FIXTURE'] = 'truncated'

      const provider = await loadProvider('mock')
      const result = await provider.history(TRUNCATED_HISTORY_REQUEST, liveSignal())

      // One hundred and twenty-three days short, behind `error:false` and a
      // plausible four-year climb. Nothing inside the body says so.
      expect(errorOf(result)).toBe('STALE_RANGE')

      expect(rowCount(), 'and nothing stored after').toBe(0)
      expect(prices.readLastFetch(db)).toBeNull()
    } finally {
      forgetProviderChoice()
    }
  })

  it('treats a body with no data key as absent data, and not as zero', async () => {
    try {
      expect(rowCount(), 'nothing stored before').toBe(0)
      process.env['JADEITE_PRICE_FIXTURE'] = 'dataless'

      const provider = await loadProvider('mock')
      const result = await provider.history(DATALESS_HISTORY_REQUEST, liveSignal())

      // Not `ok` with an empty series, which would render as a flat line at
      // nothing; not a zero, which would render as a price.
      expect(errorOf(result)).toBe('NO_DATA')

      expect(rowCount(), 'and nothing stored after').toBe(0)
      expect(prices.readLastFetch(db)).toBeNull()
    } finally {
      forgetProviderChoice()
    }
  })

  /**
   * The control, without which the two refusals above prove only that this mock
   * always fails. The same provider, the same call, a different recorded body —
   * and a series that reaches the day it was asked for.
   */
  it('accepts the recorded good response, ending on the date requested', async () => {
    try {
      process.env['JADEITE_PRICE_FIXTURE'] = 'good'

      const provider = await loadProvider('mock')
      const result = await provider.history(GOOD_HISTORY_REQUEST, liveSignal())

      expect(errorOf(result)).toBeNull()
      const closes = closesOf(result)
      expect(closes).toHaveLength(10)
      expect(closes[closes.length - 1]?.date).toBe(GOOD_HISTORY_REQUEST.to)
      expect(closes[closes.length - 1]?.value, '₺6.505,00 the gram — §18.4').toBe(650_500)
      expect(closes.every((close) => close.typeCode === 'gram')).toBe(true)
    } finally {
      forgetProviderChoice()
    }
  })
})

// --- Everything that can go wrong on the way ---------------------------------

describe('a refresh that produces nothing still says what happened (§14)', () => {
  /**
   * The airplane-mode path, as far as it can be taken without unplugging
   * anything: everything downstream of `{ok: false, error: 'OFFLINE'}` is
   * identical to what a real unreachable network produces.
   */
  it('records a failed attempt and stores no price when the provider is unreachable', async () => {
    try {
      useProvider('offline-mock')
      const outcome = await refreshPrices(db)

      expect(outcome.status).toBe('OFFLINE')
      expect(outcome.written).toBe(0)
      expect(rowCount()).toBe(0)

      const record = prices.readLastFetch(db)
      expect(record?.provider).toBe('offline-mock')
      expect(record?.outcome).toBe('OFFLINE')
      // Never succeeded, so there is no last-good moment to show beside it.
      expect(record?.succeededAt ?? null).toBeNull()
    } finally {
      forgetProviderChoice()
    }
  })

  /**
   * The vault locks while a fetch is in flight, so the service abandons it.
   *
   * `refreshPrices` runs synchronously as far as its first `await`, which is
   * past the line that publishes the controller — so calling `cancelInFlight`
   * on the very next statement genuinely aborts a fetch that has started. The
   * provider sees the aborted signal and answers `TIMEOUT`; what matters is that
   * the promise settles at all rather than leaving the button spinning.
   */
  it('turns a fetch cut short into a failed attempt rather than a hang', async () => {
    try {
      useProvider('mock')
      const pending = refreshPrices(db)
      cancelInFlight()
      const outcome = await pending

      expect(outcome.status).toBe('TIMEOUT')
      expect(outcome.written).toBe(0)
      expect(rowCount()).toBe(0)
      expect(prices.readLastFetch(db)?.outcome).toBe('TIMEOUT')
    } finally {
      forgetProviderChoice()
    }
  })

  /**
   * Why `s3_price_fetch` exists, stated at the service layer.
   *
   * A second refresh against an unmoved market writes no price row — which is
   * the append-only-on-change rule working — and would leave an interface that
   * read its timestamp from the price table reporting a perfectly healthy
   * provider as days stale. The fetch record is the only thing that then says
   * the application looked and was answered.
   *
   * No instant is compared. Two refreshes can land in the same millisecond, and
   * a test that asserted the record had *advanced* would fail once a fortnight
   * and be believed. The race-free form of the same claim is that the price rows
   * did not move at all while the attempt was recorded `ok`.
   */
  it('writes nothing the second time while the fetch record answers for the provider', async () => {
    try {
      useProvider('mock')
      expect((await refreshPrices(db)).written).toBe(MOCK_TYPE_COUNT)
      const settled = prices.readLivePrices(db)

      resetLimiterForTests()
      const second = await refreshPrices(db)

      expect(second.status).toBe('ok')
      expect(second.written).toBe(0)
      expect(prices.readLivePrices(db)).toEqual(settled)
      expect(rowCount()).toBe(MOCK_TYPE_COUNT)
      expect(prices.readLastFetch(db)?.outcome).toBe('ok')
    } finally {
      forgetProviderChoice()
    }
  })

  /**
   * Politeness to an unofficial source (§14): a second press inside the minute
   * is declined, and declining is **not** a failure.
   *
   * `skipped` is its own status precisely so the interface keeps the timestamp
   * it already had instead of showing an error, and nothing is recorded — a
   * request that was never made was never an attempt.
   */
  it('declines a second refresh inside the minute without recording an attempt', async () => {
    try {
      useProvider('mock')
      expect((await refreshPrices(db)).status).toBe('ok')
      const afterFirst = prices.readLastFetch(db)

      // Deliberately no `resetLimiterForTests()` — the floor is the point.
      const second = await refreshPrices(db)
      expect(second.status).toBe('skipped')
      expect(second.written).toBe(0)
      expect(typeof second.retryAfterSeconds).toBe('number')

      expect(prices.readLastFetch(db)).toEqual(afterFirst)
      expect(rowCount()).toBe(MOCK_TYPE_COUNT)
    } finally {
      forgetProviderChoice()
    }
  })

  /**
   * The vault going away under a fetch must not become an exception at the
   * bridge.
   *
   * `withVaultAsync` checks the handle before the fetch and deliberately does
   * not check it again afterwards (`section3-ipc.ts`), because the service is
   * the thing that knows what to do about a lock that happened in the gap. This
   * asserts only the narrow claim that belongs to `refreshPrices`: a write into
   * a database that is no longer there resolves to an ordinary failed refresh
   * that stored nothing, rather than rejecting into a handler written for a
   * database error. Which failure *code* it picks is not asserted — the service
   * has no way to tell a lock from a broken provider, and pinning the current
   * answer would make a future improvement look like a regression.
   */
  it('resolves rather than throwing when the vault is gone by the time it writes', async () => {
    try {
      useProvider('mock')
      closeDatabase(db)

      const outcome = await refreshPrices(db)
      expect(outcome.provider).toBe('mock')
      expect(outcome.written).toBe(0)
      expect(outcome.status).not.toBe('ok')
    } finally {
      forgetProviderChoice()
    }
  })
})
