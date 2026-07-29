/**
 * Altın Eğrisi — the three series, derived entirely from the Section 3 ledger.
 *
 * This replaces two charts the owner maintained by hand in a third application,
 * because the spreadsheet could not visualise its own ledger. Those two drifted
 * apart — one ran a purchase behind the other — and they forced a falsification:
 * 300 g and 400 g were entered as `0.300` and `0.400` so that a linear axis would
 * not crush the small bars beside them.
 *
 * Both problems are answered here rather than in the chart library.
 *
 * **Drift is impossible** because nothing is maintained. There is no chart data
 * store, no second list of events, and no step at which a person could add a
 * purchase to one series and forget the other. `buildSeries` is a pure function of
 * the ledger, called on every read, and the ledger is the only input it has.
 *
 * **Falsification is unnecessary** because the axis can be told to be logarithmic
 * (§11). The 300 stays 300 forever. That toggle is a chart option rather than
 * anything in this module, but it is the reason this module never scales a value:
 * every quantity below is the real one, in the type's own stored unit.
 *
 * Dates are ISO-8601 strings, which is what makes a **true date axis** possible —
 * §11 asks for one specifically, because an out-of-order or mistyped date on a
 * category axis merely looks like the next bar along, while on a date axis it
 * lands visibly in the wrong year. That is how §18.3 item 6's impossible date was
 * found in the first place.
 */

import { orderedTransactions, signedQuantity } from '../section3/engine.js'
import { transactionValue } from '../section3/units.js'
import type { LedgerData, TypeCode, ValuableType } from '../section3/types.js'

/** One point of the Spektrum line: what a unit cost on a day. */
export interface PricePoint {
  date: string
  /** Integer kuruş per major unit, as the ledger row recorded it. */
  price: number
  /** So a hover can say what was bought, not merely what it cost. */
  quantity: number
  typeCode: TypeCode
}

/** One column of the Frekans chart: how much was acquired on a day. */
export interface QuantityPoint {
  date: string
  /** In the type's own stored unit. Never scaled — that was the falsification. */
  quantity: number
  typeCode: TypeCode
}

/** One point of the market-value line. */
export interface ValuePoint {
  date: string
  /** Holdings at that date valued at the newest price then known, in kuruş. */
  value: number
}

export interface Series {
  /** §11.1 — unit price over time, on a true date axis. */
  spektrum: readonly PricePoint[]
  /** §11.2 — acquisition quantity per date. Disposals are not acquisitions. */
  frekans: readonly QuantityPoint[]
  /** §11.3 — holdings × price history where available. */
  marketValue: readonly ValuePoint[]
  /** Every type the filtered ledger actually mentions, for the legend. */
  typesPresent: readonly TypeCode[]
  /** Rows whose date the owner has not yet confirmed (§18.3 item 6). */
  provisionalDates: readonly string[]
}

/**
 * What to include.
 *
 * An empty list means "everything", not "nothing": the charts open showing the
 * whole ledger, and a filter narrows it. Expressing "no filter" as an absent
 * constraint rather than as a list of all ten types means adding an eleventh type
 * to §8.2 would not need this module to be told.
 */
export interface SeriesFilter {
  types?: readonly TypeCode[]
  personIds?: readonly number[]
}

function included<T>(value: T, allowed: readonly T[] | undefined): boolean {
  return allowed === undefined || allowed.length === 0 || allowed.includes(value)
}

/**
 * Build all three series in one pass over the ledger.
 *
 * One pass rather than three, because the market-value line needs the running
 * holdings *and* the running price that the other two are already walking past.
 * Computing them separately would mean three orderings of the same events, and
 * three chances for one of them to differ — which is the defect the deck and the
 * workbook demonstrated.
 */
export function buildSeries(data: LedgerData, filter: SeriesFilter = {}): Series {
  const typesByCode = new Map<TypeCode, ValuableType>()
  for (const type of data.types) typesByCode.set(type.code, type)

  const spektrum: PricePoint[] = []
  const frekans: QuantityPoint[] = []
  const marketValue: ValuePoint[] = []
  const typesPresent: TypeCode[] = []
  const provisionalDates: string[] = []

  /** Running holdings per type, in that type's own unit. */
  const holdings = new Map<TypeCode, number>()
  /**
   * The newest unit price seen for each type, and the only price history there
   * is: §11 says "where available", and what is available is what the ledger's own
   * rows recorded on the days they happened. There is no price table to consult
   * (§8.5 keeps one current price, not a series), and inventing one would be a
   * second record for the owner to maintain.
   */
  const lastPrice = new Map<TypeCode, number>()

  for (const transaction of orderedTransactions(data.transactions)) {
    const type = typesByCode.get(transaction.typeCode)
    if (!type) continue

    if (!included(transaction.typeCode, filter.types)) continue
    // A null person is Ortak, which the engine resolves; here an unattributed row
    // simply cannot match a person filter, and matches when there is none.
    if (
      filter.personIds !== undefined &&
      filter.personIds.length > 0 &&
      (transaction.personId === null || !filter.personIds.includes(transaction.personId))
    ) {
      continue
    }

    if (!typesPresent.includes(transaction.typeCode)) typesPresent.push(transaction.typeCode)
    if (transaction.dateProvisional) provisionalDates.push(transaction.date)

    // A price of zero is a gift rather than a quotation, and a zero on a
    // logarithmic axis is not a point at all — so it is recorded as an event in
    // the other two series and left out of the price line.
    if (transaction.unitPrice > 0) {
      spektrum.push({
        date: transaction.date,
        price: transaction.unitPrice,
        quantity: transaction.quantity,
        typeCode: transaction.typeCode
      })
      lastPrice.set(transaction.typeCode, transaction.unitPrice)
    }

    if (transaction.direction === 'acquire') {
      frekans.push({
        date: transaction.date,
        quantity: transaction.quantity,
        typeCode: transaction.typeCode
      })
    }

    holdings.set(
      transaction.typeCode,
      (holdings.get(transaction.typeCode) ?? 0) + signedQuantity(transaction)
    )

    let total = 0
    for (const [code, quantity] of holdings) {
      const price = lastPrice.get(code)
      const unit = typesByCode.get(code)?.unit
      if (price === undefined || unit === undefined || quantity === 0) continue
      total +=
        Math.sign(quantity) * transactionValue(Math.abs(quantity), price, unit)
    }

    // One point per event date. Two events on one day collapse to the later
    // state, which is the true one — a chart that drew both would show a step
    // the owner never held.
    const previous = marketValue[marketValue.length - 1]
    if (previous && previous.date === transaction.date) previous.value = total
    else marketValue.push({ date: transaction.date, value: total })
  }

  return { spektrum, frekans, marketValue, typesPresent, provisionalDates }
}

/**
 * Whether a logarithmic axis would actually help.
 *
 * §11's acceptance asks for test data holding a 300 beside 10s, where the linear
 * view crushes the small bars. That is a *ratio* question, so it can be answered
 * from the data rather than left to the eye: when the largest value is an order of
 * magnitude beyond the smallest, the small ones are within a pixel or two of the
 * axis and the toggle is worth offering prominently.
 *
 * It never switches anything by itself. The owner asked for a toggle, and a chart
 * that changed its own axis would be a chart that could not be compared with the
 * one from last week.
 */
export function spansOrdersOfMagnitude(values: readonly number[]): boolean {
  let smallest = Infinity
  let largest = 0
  for (const value of values) {
    if (value <= 0) continue
    if (value < smallest) smallest = value
    if (value > largest) largest = value
  }
  if (smallest === Infinity || largest === 0) return false
  return largest / smallest >= 10
}
