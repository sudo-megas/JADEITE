/**
 * The two silent failures of §14.2, and the parser that refuses them.
 *
 * Both arrive as HTTP 200 with `error:false`, so nothing above this layer can
 * see them: a truncated series looks exactly like a healthy one until its last
 * date is compared with the date that was asked for, and a body with no `data`
 * key is valid JSON that a trusting reader turns into zero closes. Two of
 * Realisation VII's seven acceptance boxes are these two cases, and they are
 * provable here — under plain Node, against hand-authored bodies, with no
 * socket, no vault and no network — because `parse.ts` is pure.
 *
 * The rest of the file is the same claim from the other side: this is untrusted
 * input from an unofficial source, so every shape it could arrive in is tried
 * and none of them may throw. A parser that throws past its caller lands in a
 * handler written for a database error, which is the arrangement `provider.ts`
 * exists to forbid.
 */

import { describe, expect, it } from 'vitest'

import { MAX_UNIT_PRICE } from '@shared/section3/units'
import type { TypeCode } from '@shared/section3/types'
import { MAPPINGS, sourceCodeFor, typeCodeFor } from '../../src/main/prices/haremaltin/mapping.js'
import {
  MAX_HISTORY_BODY_CHARS,
  MAX_SNAPSHOT_FRAME_CHARS,
  STALE_RANGE_TOLERANCE_DAYS,
  parseHistoryBody,
  parseSnapshotFrame
} from '../../src/main/prices/haremaltin/parse.js'
import {
  DATALESS_HISTORY,
  DATALESS_HISTORY_REQUEST,
  GOOD_HISTORY,
  GOOD_HISTORY_REQUEST,
  PRICE_CHANGED_FRAME,
  TRUNCATED_HISTORY,
  TRUNCATED_HISTORY_REQUEST
} from '../../src/main/prices/mock/recorded.js'
import type { HistoryRequest, PriceErrorCode, PriceResult } from '../../src/main/prices/provider.js'

const PROVIDER = 'haremaltin'
const NOW = '2026-07-30T18:42:13.000Z'

function value<T>(result: PriceResult<T>): T {
  if (!result.ok) throw new Error(`expected a value, got ${result.error}`)
  return result.value
}

function error(result: PriceResult<unknown>): PriceErrorCode {
  if (result.ok) throw new Error('expected a failure, got a value')
  return result.error
}

/** A frame carrying exactly the instruments given, for isolating one behaviour. */
function frame(instruments: Readonly<Record<string, string>>): string {
  const body = Object.entries(instruments)
    .map(([code, satis]) => `"${code}":{"code":"${code}","alis":"0.0000","satis":"${satis}"}`)
    .join(',')
  return `42["price_changed",{"data":{${body}}}]`
}

/** A history body from `[date, satış]` pairs, in the recorded envelope. */
function historyBody(rows: readonly (readonly [string, string])[]): string {
  const data = rows
    .map(([date, satis]) => `{"alis":"0.0000","satis":"${satis}","kayit_tarihi":"${date} 23:59:02"}`)
    .join(',')
  return `{"message":"","error":false,"data":[${data}]}`
}

const MS_PER_DAY = 86_400_000

/** Dates for the tolerance boundary, derived from the constant rather than retyped. */
function plusDays(date: string, days: number): string {
  const shifted = new Date(Date.parse(`${date}T00:00:00Z`) + days * MS_PER_DAY)
  return shifted.toISOString().slice(0, 10)
}

function withTo(request: HistoryRequest, to: string): HistoryRequest {
  return { ...request, to }
}

/** The last close in `GOOD_HISTORY`, which every range check below is measured from. */
const NEWEST_GOOD_CLOSE = '2026-05-08'

describe('the §14.3 type mapping', () => {
  it('is total over the ten types, and round-trips in both directions', () => {
    expect(MAPPINGS).toHaveLength(10)

    for (const { typeCode, sourceCode } of MAPPINGS) {
      expect(sourceCodeFor(typeCode)).toBe(sourceCode)
      expect(typeCodeFor(sourceCode)).toBe(typeCode)
    }

    // Ten distinct instruments: two types sharing one source code would price
    // both from one series and no later read could separate them.
    expect(new Set(MAPPINGS.map((row) => row.sourceCode)).size).toBe(10)
  })

  it('takes the ESKİ coins, gram from KULCEALTIN, and silver per gram', () => {
    expect(sourceCodeFor('gram')).toBe('KULCEALTIN')
    expect(sourceCodeFor('ceyrek')).toBe('CEYREK_ESKI')
    expect(sourceCodeFor('ata')).toBe('ATA_ESKI')
    expect(sourceCodeFor('besli')).toBe('ATA5_ESKI')
    // GUMUSUSD is per kilogram, and is the trap this row exists to avoid.
    expect(sourceCodeFor('gumus')).toBe('GUMUSTRY')
  })

  it('knows nothing about the instruments it does not price', () => {
    // HAS ALTIN, which the label tempts and the evidence refuses; ziynet's old
    // row, struck from the closed list this rung; and the per-kilogram silver.
    expect(typeCodeFor('ALTIN')).toBeNull()
    expect(typeCodeFor('AYAR22')).toBeNull()
    expect(typeCodeFor('GUMUSUSD')).toBeNull()
    // Case is not folded — see the Turkish dotless-i argument in mapping.ts.
    expect(typeCodeFor('kulcealtin')).toBeNull()
    expect(typeCodeFor('')).toBeNull()
  })
})

describe('a price_changed frame', () => {
  it('reads every instrument the ceiling admits, in closed-list order', () => {
    const snapshot = value(parseSnapshotFrame(PRICE_CHANGED_FRAME, PROVIDER, NOW))

    expect(snapshot.provider).toBe(PROVIDER)
    expect(snapshot.fetchedAt).toBe(NOW)

    const priced = new Map<TypeCode, number>(snapshot.quotes.map((q) => [q.typeCode, q.value]))

    // Integer kuruş per major unit, satış, assembled from digits — and every
    // one of these came off the wire, so the decimal shapes are the source's
    // own rather than a convention this project imagined. `10124` carries no
    // decimal point at all, `94.017` carries three and `47.3600` four, in the
    // same frame. A parser that assumed four would have read a çeyrek as
    // ₺1,01 and stored it without complaint.
    expect(priced.get('gram')).toBe(625_137)
    expect(priced.get('ceyrek')).toBe(1_012_400)
    expect(priced.get('yarim')).toBe(2_019_300)
    expect(priced.get('tam')).toBe(4_013_600)
    expect(priced.get('ata')).toBe(4_130_900)
    expect(priced.get('usd')).toBe(4_736)
    expect(priced.get('eur')).toBe(5_452)
    expect(priced.get('gumus')).toBe(9_402)

    // Closed-list order, so the interface never has to sort a snapshot.
    const order = MAPPINGS.map((row) => row.typeCode).filter((code) => priced.has(code))
    expect(snapshot.quotes.map((q) => q.typeCode)).toEqual(order)
  })

  it('rounds the third decimal half away from zero, as a person would', () => {
    const snapshot = value(
      parseSnapshotFrame(
        frame({
          KULCEALTIN: '1051.4950',
          USDTRY: '41.2950',
          EURTRY: '46.8712',
          GUMUSTRY: '84.1749'
        }),
        PROVIDER,
        NOW
      )
    )
    const priced = new Map<TypeCode, number>(snapshot.quotes.map((q) => [q.typeCode, q.value]))

    // The gram figure is the one that separates the two readings: the double
    // nearest 1051.4950 is below it, so `Math.round(parseFloat(s) * 100)` gives
    // 105149 where the digits give 105150. One kuruş, on about one four-decimal
    // string in two thousand, and always in the direction of disagreeing with
    // the owner's own arithmetic for a reason they could never have discovered.
    expect(priced.get('gram')).toBe(105_150)
    expect(Math.round(parseFloat('1051.4950') * 100)).toBe(105_149)

    expect(priced.get('usd')).toBe(4_130)
    expect(priced.get('eur')).toBe(4_687)
    expect(priced.get('gumus')).toBe(8_417)
  })

  it('prices all ten types, the two largest coins included', () => {
    const snapshot = value(parseSnapshotFrame(PRICE_CHANGED_FRAME, PROVIDER, NOW))
    const priced = new Map<TypeCode, number>(snapshot.quotes.map((q) => [q.typeCode, q.value]))

    // This assertion is the ceiling fix, stated as a fact about the output.
    // §8.2 puts 2.5 at 9.444× a çeyrek and 5 at 18.996×, so at a çeyrek
    // consistent with a çeyrek near ₺11.000 they quote around ₺103.714 and ₺208.614 —
    // both above the ₺100.000 bound `units.ts` carried until this Realisation,
    // which meant a frame containing them stored *nothing at all*. Raising the
    // bound is what makes a real frame usable, and this is where that shows.
    expect(priced.has('iki_bucuk')).toBe(true)
    expect(priced.has('besli')).toBe(true)
    expect(priced.get('besli')).toBe(20_686_900)
    expect(snapshot.quotes).toHaveLength(10)

    // The boundary itself, written against the constant rather than a literal so
    // that moving it again cannot leave this test quietly asserting the old one.
    const ceiling = (MAX_UNIT_PRICE / 100).toFixed(4)
    const overBy1Kurus = ((MAX_UNIT_PRICE + 1) / 100).toFixed(4)

    const atCeiling = value(parseSnapshotFrame(frame({ ATA5_ESKI: ceiling }), PROVIDER, NOW))
    expect(atCeiling.quotes.map((q) => q.value)).toEqual([MAX_UNIT_PRICE])
    expect(error(parseSnapshotFrame(frame({ ATA5_ESKI: overBy1Kurus }), PROVIDER, NOW))).toBe(
      'MALFORMED'
    )
  })

  it('drops one unstorable instrument rather than losing the other nine', () => {
    // A figure the vault could not hold whatever the ceiling were — a decimal
    // point in the wrong place at the source, which is exactly the kind of thing
    // an unofficial feed does. The type is *absent* rather than clamped: a
    // holding with no live price must read as having none, never as being worth
    // something nobody quoted. And the other nine survive, because §14 wants a
    // broken provider to be quiet rather than total.
    const absurd = frame({
      KULCEALTIN: '6505.0000',
      CEYREK_ESKI: '10982.0000',
      ATA5_ESKI: '99999999.0000'
    })
    const snapshot = value(parseSnapshotFrame(absurd, PROVIDER, NOW))
    const priced = snapshot.quotes.map((q) => q.typeCode)

    expect(priced.includes('besli')).toBe(false)
    expect(priced.includes('gram')).toBe(true)
    expect(priced.includes('ceyrek')).toBe(true)
    expect(snapshot.quotes).toHaveLength(2)
  })

  it('ignores the forty-five instruments it does not price', () => {
    const snapshot = value(parseSnapshotFrame(PRICE_CHANGED_FRAME, PROVIDER, NOW))
    const values = snapshot.quotes.map((q) => q.value)

    // HAS ALTIN at 6238.89, AYAR22 at 5731.00 and silver-per-kilogram at
    // 1985.50 are all in the frame and none of them is in the snapshot. The last
    // is the one that would have gone unnoticed: ₺1.985,50 is a perfectly
    // plausible-looking unit price, and it is a thousand grams of the metal.
    // AYAR22 is the second: it was ziynet's mapping until §8.2's amendment
    // struck the type, and it quotes 22-ayar gram gold — near enough to the
    // gram figure to look right and eight per cent below it.
    expect(values).not.toContain(623_889)
    expect(values).not.toContain(573_100)
    expect(values).not.toContain(198_550)

    // An unknown instrument is not fatal — the source may add one at any time.
    const snapshotWithStranger = value(
      parseSnapshotFrame(frame({ NEWCOIN_2027: '5000.0000', KULCEALTIN: '6505.0000' }), PROVIDER, NOW)
    )
    expect(snapshotWithStranger.quotes).toEqual([{ typeCode: 'gram', value: 650_500 }])
  })

  it('drops a price that is not one, rather than storing a zero', () => {
    // The source publishes 0 or an empty string for an instrument that is not
    // trading. A stored zero renders as ₺0,00, which is the one thing §14 says a
    // type with no live price must never look like.
    for (const satis of ['0.0000', '0', '', ' ', '-12.5000', 'n/a', '1,234.50', '6.505e3']) {
      expect(error(parseSnapshotFrame(frame({ KULCEALTIN: satis }), PROVIDER, NOW))).toBe('MALFORMED')
    }

    // A JSON number is refused too: by the time it could be read it has already
    // been through a double, which is precisely the drift the string assembly
    // exists to avoid.
    const numeric = '42["price_changed",{"data":{"KULCEALTIN":{"satis":6505.0}}}]'
    expect(error(parseSnapshotFrame(numeric, PROVIDER, NOW))).toBe('MALFORMED')
  })

  it('accepts the envelope in the shapes socket.io actually sends it', () => {
    const instruments = '{"data":{"KULCEALTIN":{"satis":"6505.0000"}}}'

    for (const text of [
      `42["price_changed",${instruments}]`,
      `["price_changed",${instruments}]`,
      `42/prices,["price_changed",${instruments}]`,
      // The wrapper is not a contract (§14.1): the map may arrive unwrapped.
      '42["price_changed",{"KULCEALTIN":{"satis":"6505.0000"}}]'
    ]) {
      expect(value(parseSnapshotFrame(text, PROVIDER, NOW)).quotes).toEqual([
        { typeCode: 'gram', value: 650_500 }
      ])
    }
  })

  it('refuses everything else without throwing', () => {
    const junk = [
      '',
      'not json at all',
      'null',
      '42',
      '42[',
      '42[]',
      '{"data":{}}',
      'x42["price_changed",{"data":{}}]',
      '42["price_changed"]',
      '42["price_changed",null]',
      '42["price_changed",[]]',
      // A frame for some other event. The transport reads this as "not yet" and
      // keeps waiting: the handshake and engine.io's pings both land here.
      '42["heartbeat",{"data":{}}]',
      // Well-formed, and naming none of the ten. The source pushes all 55 every
      // time, so this is a body that could not be read rather than an empty one.
      '42["price_changed",{"data":{"ALTIN":{"satis":"6703.5000"}}}]',
      `42["price_changed",{"data":{}}]`.padEnd(MAX_SNAPSHOT_FRAME_CHARS + 1, ' ')
    ]

    for (const text of junk) {
      expect(() => parseSnapshotFrame(text, PROVIDER, NOW)).not.toThrow()
      expect(error(parseSnapshotFrame(text, PROVIDER, NOW))).toBe('MALFORMED')
    }
  })
})

describe('a history body', () => {
  it('reads a well-formed series into dated closes', () => {
    const closes = value(parseHistoryBody(GOOD_HISTORY, GOOD_HISTORY_REQUEST))

    expect(closes).toHaveLength(10)
    expect(closes[0]).toEqual({ typeCode: 'gram', date: '2026-03-30', value: 632_200 })
    expect(closes[9]).toEqual({ typeCode: 'gram', date: NEWEST_GOOD_CLOSE, value: 650_500 })

    // The body names no instrument — the `kod` went out in the form and nothing
    // comes back with it — so every close is stamped from the request.
    expect(closes.every((close) => close.typeCode === 'gram')).toBe(true)

    const dates = closes.map((close) => close.date)
    expect([...dates].sort()).toEqual(dates)
  })

  it('rejects a range that falls short of the range requested (§14.2 item 1)', () => {
    // The recorded stale response: error:false, a plausible four-year climb, and
    // a tail stopping 123 days before the date asked for. Nothing inside the
    // body says so, which is the whole reason this check exists.
    expect(error(parseHistoryBody(TRUNCATED_HISTORY, TRUNCATED_HISTORY_REQUEST))).toBe('STALE_RANGE')
  })

  it('treats a missing data key as absent, not as zero closes (§14.2 item 2)', () => {
    expect(error(parseHistoryBody(DATALESS_HISTORY, DATALESS_HISTORY_REQUEST))).toBe('NO_DATA')
    // `meta` is present in that body and is not mistaken for a series.
    expect(error(parseHistoryBody('{"message":"","error":false}', DATALESS_HISTORY_REQUEST))).toBe(
      'NO_DATA'
    )
    expect(
      error(parseHistoryBody('{"message":"","error":false,"data":null}', DATALESS_HISTORY_REQUEST))
    ).toBe('NO_DATA')
  })

  it('distinguishes an absent data key from an empty one', () => {
    // `data: []` is an answer — "no closes in that range" — and emphatically not
    // the §14.2 failure. Conflating them would report a working provider as
    // broken every time the owner asked for a range the market never traded in.
    const empty = value(parseHistoryBody(historyBody([]), GOOD_HISTORY_REQUEST))
    expect(empty).toEqual([])
  })

  it('tolerates a weekend and refuses a stale cache — both sides of the boundary', () => {
    const within = withTo(GOOD_HISTORY_REQUEST, plusDays(NEWEST_GOOD_CLOSE, 1))
    const atTolerance = withTo(
      GOOD_HISTORY_REQUEST,
      plusDays(NEWEST_GOOD_CLOSE, STALE_RANGE_TOLERANCE_DAYS)
    )
    const beyondTolerance = withTo(
      GOOD_HISTORY_REQUEST,
      plusDays(NEWEST_GOOD_CLOSE, STALE_RANGE_TOLERANCE_DAYS + 1)
    )

    // A Friday close answering a Saturday request is one day short and healthy.
    expect(value(parseHistoryBody(GOOD_HISTORY, within))).toHaveLength(10)
    // A weekend plus an adjoining public holiday is the widest legitimate gap.
    expect(value(parseHistoryBody(GOOD_HISTORY, atTolerance))).toHaveLength(10)
    // One day further is no longer a market closure; the observed cache bug was
    // four months, and there is no honest series between the two.
    expect(error(parseHistoryBody(GOOD_HISTORY, beyondTolerance))).toBe('STALE_RANGE')
  })

  it('judges staleness by the newest date present, not by the last row', () => {
    // Rows arriving newest-first would make the last element the oldest, and a
    // parser trusting the order would call a current series four months stale.
    const descending = historyBody([
      ['2026-05-08', '6505.0000'],
      ['2026-05-05', '6486.0000'],
      ['2026-03-30', '6322.0000']
    ])
    const closes = value(parseHistoryBody(descending, GOOD_HISTORY_REQUEST))
    expect(closes.map((close) => close.date)).toEqual(['2026-03-30', '2026-05-05', '2026-05-08'])
  })

  it('keeps one close per day, the later timestamp winning', () => {
    const doubled =
      '{"message":"","error":false,"data":[' +
      '{"satis":"6600.0000","kayit_tarihi":"2026-05-08 11:03:00"},' +
      '{"satis":"6505.0000","kayit_tarihi":"2026-05-08 23:59:01"}' +
      ']}'
    const closes = value(parseHistoryBody(doubled, GOOD_HISTORY_REQUEST))
    expect(closes).toEqual([{ typeCode: 'gram', date: '2026-05-08', value: 650_500 }])
  })

  it('lets the two defences compose when the tail is unreadable', () => {
    // Every row well-formed, and the last two above MAX_UNIT_PRICE — a source
    // that lost a decimal point partway through a series. The unstorable rows
    // are dropped, which leaves the newest survivor six weeks short of the range
    // requested, and *that* fails the fetch as stale. Neither defence alone
    // catches this: dropping the rows quietly would chart a series that stops in
    // March and say nothing about why.
    const body = historyBody([
      ['2026-03-30', '6322.0000'],
      ['2026-05-05', '80000000.0000'],
      ['2026-05-08', '80000114.1000']
    ])
    expect(error(parseHistoryBody(body, GOOD_HISTORY_REQUEST))).toBe('STALE_RANGE')
  })

  it('refuses a body it cannot read, without throwing', () => {
    const junk = [
      '',
      'not json at all',
      'null',
      '[]',
      '"a string"',
      // The source declaring its own failure. Whatever else it holds, it is not
      // prices.
      '{"message":"hata","error":true,"data":[]}',
      '{"error":false,"data":{"2026-05-08":"6505.0000"}}',
      '{"error":false,"data":"nope"}',
      // Rows arrived and not one was a price. Reporting that as an empty series
      // would tell the owner the market had no closes for four years.
      '{"error":false,"data":[1,2,3]}',
      '{"error":false,"data":[{"satis":"6505.0000"}]}',
      '{"error":false,"data":[{"satis":"6505.0000","kayit_tarihi":"2026-02-31 23:59:01"}]}',
      '{"error":false,"data":[{"satis":"nope","kayit_tarihi":"2026-05-08 23:59:01"}]}',
      '{"error":false,"data":[]}'.padEnd(MAX_HISTORY_BODY_CHARS + 1, ' ')
    ]

    for (const text of junk) {
      expect(() => parseHistoryBody(text, GOOD_HISTORY_REQUEST)).not.toThrow()
      expect(error(parseHistoryBody(text, GOOD_HISTORY_REQUEST))).toBe('MALFORMED')
    }
  })

  it('refuses a request whose range is not a range', () => {
    // A caller's error rather than the source's, and reported rather than
    // thrown: nothing in this layer throws.
    expect(error(parseHistoryBody(GOOD_HISTORY, withTo(GOOD_HISTORY_REQUEST, '')))).toBe('MALFORMED')
    expect(error(parseHistoryBody(GOOD_HISTORY, withTo(GOOD_HISTORY_REQUEST, '2026-02-31')))).toBe(
      'MALFORMED'
    )
    expect(error(parseHistoryBody(GOOD_HISTORY, withTo(GOOD_HISTORY_REQUEST, '08-05-2026')))).toBe(
      'MALFORMED'
    )
  })
})
