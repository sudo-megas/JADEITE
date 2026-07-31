/**
 * Overview's selection layer, and the four states that are not zero.
 *
 * Every expectation below is a **hand-typed constant**. The tempting alternative
 * was to compute each expectation by running the same engine the selector runs,
 * which would prove only that a function equals itself: a selector that summed
 * lira and dollars together would pass such a suite, because the expectation
 * would sum them too. So the arithmetic is done here on paper, in kuruş, and
 * written down — and if the engines ever change what they mean, this file fails
 * rather than agreeing with them.
 *
 * The fixtures are shapes, not the owner's records (rule 6 of the ladder): a
 * year of lira, a year that also took dollars, a year of dollars alone, a year
 * with no columns, a year that did not read; a grid with a card and a counter, a
 * grid of counters alone, a grid with nothing in it; a ledger priced in part, a
 * ledger priced not at all, and a ledger whose gold has gone.
 *
 * Three things are asserted **negatively**, because they are the mistakes that
 * would look right on screen: no figure ever sums across value types;
 * `TOTAL REMAINING LIMIT` is read rather than recomputed as limit − debt; and
 * unrealised gain is measured against `pricedCostBasis`, never `costBasis`. In
 * each case the wrong answer is written down beside the right one, so a future
 * simplification fails here instead of on the dashboard.
 */

import { describe, expect, it } from 'vitest'

import { computeWorkspace } from '@shared/section1/engine'
import type { Category, Entry, YearWorkspace } from '@shared/section1/types'
import { computeGrid } from '@shared/section2/engine'
import type { Bank, Cell, PaymentsGrid } from '@shared/section2/types'
import { computeHoldings } from '@shared/section3/engine'
import type {
  LedgerData,
  ManualPrice,
  Person,
  Transaction,
  TypeCode,
  ValuableType
} from '@shared/section3/types'
import {
  debtTile,
  headlineBucket,
  holdingsOf,
  incompleteReads,
  marketTile,
  netByMonthSeries,
  remainingTile,
  sortedTypeCodes,
  typeCodesAttribute,
  unrealisedTile,
  valueLine,
  yearCards,
  yoySeries,
  type OverviewYear
} from '../../src/renderer/src/sections/overview/selectors.js'

// --- Section 1 fixtures -----------------------------------------------------

function category(
  id: number,
  year: number,
  kind: Category['kind'],
  valueType: Category['valueType'],
  position: number
): Category {
  return { id, year, name: `c${id}`, kind, valueType, position }
}

function entry(categoryId: number, month: number, amount: number, isRefund = false): Entry {
  return { categoryId, month, amount, isRefund, note: null }
}

function workspace(year: number, categories: Category[], entries: Entry[]): YearWorkspace {
  return { year, accentOverride: null, categories, entries }
}

/**
 * 2024 — lira alone, and a refund.
 *
 * Ocak  income ₺5.000,00, expense ₺2.000,00  → net  +₺3.000,00
 * Şubat expense ₺3.500,00                    → net  −₺3.500,00
 * Mart  income ₺4.000,00, refund ₺500,00 off an expense → net +₺4.500,00
 *
 * Year: income ₺9.000,00, expense ₺5.000,00, net **₺4.000,00**.
 */
const W2024 = workspace(
  2024,
  [category(1, 2024, 'income', 'TRY', 0), category(2, 2024, 'expense', 'TRY', 0)],
  [
    entry(1, 1, 500_000),
    entry(2, 1, 200_000),
    entry(2, 2, 350_000),
    entry(1, 3, 400_000),
    entry(2, 3, 50_000, true)
  ]
)

/**
 * 2025 — lira *and* dollars, which is the year the card must not add up.
 *
 * TRY: Ocak income ₺6.000,00 less expense ₺1.000,00; Haziran expense ₺2.500,00.
 *      Year net **₺2.500,00**.
 * USD: Ocak $9.000,00 and Eylül $1.000,00. Year net $10.000,00 — 1.000.000 in
 *      cents, which is the number a broken selector would add to the lira one.
 *
 * Eylül holds a dollar entry and no lira entry, so its lira month is empty of
 * lira while the month itself is not empty. That distinction is what `empty`
 * exists to draw.
 */
const W2025 = workspace(
  2025,
  [
    category(11, 2025, 'income', 'TRY', 0),
    category(12, 2025, 'expense', 'TRY', 0),
    category(13, 2025, 'income', 'USD', 1)
  ],
  [
    entry(11, 1, 600_000),
    entry(12, 1, 100_000),
    entry(13, 1, 900_000),
    entry(12, 6, 250_000),
    entry(13, 9, 100_000)
  ]
)

/** 2026 — dollars alone. There is no honest lira figure for this card. */
const W2026 = workspace(
  2026,
  [category(21, 2026, 'income', 'USD', 0)],
  [entry(21, 2, 123_456)]
)

/** 2023 — read perfectly, and holds no columns at all. */
const W2023 = workspace(2023, [], [])

// --- Section 2 fixtures -----------------------------------------------------

function bank(id: number, creditLimit: number, position: number): Bank {
  return { id, name: `b${id}`, creditLimit, position, isCounter: false, counterParty: null }
}

function counter(id: number, position: number): Bank {
  return {
    id,
    name: `k${id}`,
    creditLimit: 0,
    position,
    isCounter: true,
    counterParty: 'Sayaç A'
  }
}

function cell(bankId: number, month: number, amount: number): Cell {
  return { bankId, month, amount }
}

function grid(banks: Bank[], cells: Cell[]): PaymentsGrid {
  return { banks, cells }
}

/**
 * One card and one counter column, chosen so the three readings differ.
 *
 * Card: limit ₺100.000,00, charged ₺10.000,00 in Ocak and ₺20.000,00 in Şubat.
 * Counter: ₺20.000,00 in Ocak, which comes *off* the debt and carries no limit.
 *
 *   GRAND TOTAL DEBT      (₺10.000 − ₺20.000) + ₺20.000 = **₺10.000,00**
 *   TOTAL REMAINING LIMIT ₺100.000 − ₺30.000              = **₺70.000,00**
 *
 * The two wrong answers, both written down in `remainingTile`'s own test:
 *   limit − grand total debt        = ₺90.000,00
 *   Σ (limit − debt) over *every* column = ₺50.000,00
 */
const PAYMENTS = grid(
  [bank(1, 10_000_000, 0), counter(2, 0)],
  [cell(1, 1, 1_000_000), cell(1, 2, 2_000_000), cell(2, 1, 2_000_000)]
)

/** A counter column and nothing else. No card, therefore no headroom. */
const COUNTERS_ONLY = grid([counter(3, 0)], [cell(3, 1, 500_000)])

/** A grid with no columns whatsoever. */
const NO_COLUMNS = grid([], [])

// --- The five-year vault ----------------------------------------------------

/**
 * Deliberately out of order, because the store returns whatever `s1:years`
 * returned and nothing promises ascending.
 */
const YEARS: readonly OverviewYear[] = [
  { year: 2026, workspace: W2026 },
  { year: 2023, workspace: W2023 },
  { year: 2025, workspace: W2025 },
  { year: 2022, workspace: null },
  { year: 2024, workspace: W2024 }
]

/** Fixed, so a test never depends on the month it is run in. */
const MONTH = 7

// --- Section 3 fixtures -----------------------------------------------------

const TYPES: readonly ValuableType[] = [
  { code: 'gram', unit: 'mg', position: 0 },
  { code: 'ceyrek', unit: 'piece', position: 1 }
]

const PERSONS: readonly Person[] = [
  { id: 1, name: 'Ortak', colour: null, isBuiltin: true, position: 0 },
  { id: 2, name: 'Kişi A', colour: null, isBuiltin: false, position: 1 }
]

function transaction(
  seq: number,
  date: string,
  typeCode: TypeCode,
  direction: Transaction['direction'],
  denomination: number,
  count: number,
  unitPrice: number
): Transaction {
  return {
    seq,
    date,
    dateProvisional: false,
    typeCode,
    direction,
    denomination,
    count,
    quantity: denomination * count,
    unitPrice,
    source: null,
    personId: 2,
    note: null
  }
}

/** Two pieces of five grams at ₺1.000,00/g — ₺10.000,00 paid. */
const T_GOLD = transaction(1, '2026-01-10', 'gram', 'acquire', 5_000, 2, 100_000)
/** Four çeyrek at ₺5.000,00 each — ₺20.000,00 paid. */
const T_COINS = transaction(2, '2026-02-20', 'ceyrek', 'acquire', 1, 4, 500_000)
/** The gold leaves again, at a price the ledger records and nothing else uses. */
const T_SOLD = transaction(3, '2026-03-05', 'gram', 'dispose', 5_000, 2, 300_000)

function ledger(transactions: Transaction[], manualPrices: ManualPrice[]): LedgerData {
  return {
    persons: PERSONS,
    types: TYPES,
    transactions,
    manualPrices,
    livePrices: [],
    lastFetch: null
  }
}

/** Gold priced at ₺2.000,00/g; the çeyrek have no price at all. */
const PRICED: LedgerData = ledger(
  [T_GOLD, T_COINS],
  [{ typeCode: 'gram', value: 200_000, updatedAt: '2026-07-30T00:00:00.000Z' }]
)

/** The same drawer, and the owner has typed no price for anything in it. */
const UNPRICED: LedgerData = ledger([T_GOLD, T_COINS], [])

/** Bought and sold: history in full, nothing currently held. */
const SOLD: LedgerData = ledger([T_GOLD, T_SOLD], [])

const NOTHING: LedgerData = ledger([], [])

// --- The year card ----------------------------------------------------------

describe('headlineBucket — four cases, not two', () => {
  it('reads the lira bucket of a lira-only year', () => {
    expect(headlineBucket(computeWorkspace(W2024))).toEqual({
      kind: 'net',
      bucket: { valueType: 'TRY', income: 900_000, expense: 500_000, net: 400_000 },
      others: []
    })
  })

  it('never adds a dollar column into the lira figure', () => {
    const headline = headlineBucket(computeWorkspace(W2025))
    expect(headline).toEqual({
      kind: 'net',
      bucket: { valueType: 'TRY', income: 600_000, expense: 350_000, net: 250_000 },
      others: ['USD']
    })

    // ₺2.500,00 and $10.000,00 are the year's two answers. 1.250.000 is the
    // number that would appear if either were added to the other, and it means
    // nothing in any currency.
    if (headline.kind !== 'net') throw new Error('expected a net headline')
    expect(headline.bucket.net).not.toBe(1_250_000)
    expect(headline.others.length).toBeGreaterThan(0)
  })

  it('refuses to invent a lira zero for a year of dollars', () => {
    expect(headlineBucket(computeWorkspace(W2026))).toEqual({
      kind: 'other-only',
      others: ['USD']
    })
  })

  it('tells a year with no columns apart from a year with no lira column', () => {
    expect(headlineBucket(computeWorkspace(W2023))).toEqual({ kind: 'no-columns' })
  })

  it('still answers for a year that did not read', () => {
    expect(headlineBucket(null)).toEqual({ kind: 'unreadable' })
  })

  it('draws a card for every year, oldest first, including the unreadable one', () => {
    expect(yearCards(YEARS).map((card) => [card.year, card.headline.kind])).toEqual([
      [2022, 'unreadable'],
      [2023, 'no-columns'],
      [2024, 'net'],
      [2025, 'net'],
      [2026, 'other-only']
    ])
  })
})

// --- The trend charts -------------------------------------------------------

describe('netByMonthSeries', () => {
  const series = netByMonthSeries(YEARS)

  it('is chronological however the store ordered the years', () => {
    expect(series.points.length).toBe(24)
    expect(series.points[0]).toEqual({ year: 2024, month: 1, net: 300_000, empty: false })
    expect(series.points[11]).toEqual({ year: 2024, month: 12, net: 0, empty: true })
    expect(series.points[12]).toEqual({ year: 2025, month: 1, net: 500_000, empty: false })
    expect(series.points[23]).toEqual({ year: 2025, month: 12, net: 0, empty: true })
  })

  it('pins every month of 2024, refund included', () => {
    const of2024 = series.points.filter((point) => point.year === 2024)
    expect(of2024.map((point) => point.net)).toEqual([
      300_000, -350_000, 450_000, 0, 0, 0, 0, 0, 0, 0, 0, 0
    ])
  })

  it('calls a month empty of lira when its only entry was in dollars', () => {
    const eylul = series.points.find((point) => point.year === 2025 && point.month === 9)
    expect(eylul).toEqual({ year: 2025, month: 9, net: 0, empty: true })

    const haziran = series.points.find((point) => point.year === 2025 && point.month === 6)
    expect(haziran).toEqual({ year: 2025, month: 6, net: -250_000, empty: false })
  })

  it('names the years it did not draw, and why', () => {
    expect(series.excluded).toEqual([
      { year: 2022, reason: 'unreadable' },
      { year: 2023, reason: 'no-columns' },
      { year: 2026, reason: 'other-only' }
    ])
  })

  it('names the value types it is not showing', () => {
    expect(series.otherValueTypes).toEqual(['USD'])
  })
})

describe('yoySeries', () => {
  const series = yoySeries(YEARS)

  it('gives every drawn year twelve points and its own year figure', () => {
    expect(series.years.map((line) => line.year)).toEqual([2024, 2025])
    for (const line of series.years) expect(line.months.length).toBe(12)
    expect(series.years.map((line) => line.net)).toEqual([400_000, 250_000])
  })

  it('reads the year figure from yearBuckets, and the two axes agree', () => {
    for (const line of series.years) {
      const summed = line.months.reduce((total, month) => total + month.net, 0)
      expect(summed).toBe(line.net)
    }
    // Written down rather than only derived, so a change to either axis fails.
    expect(series.years[0]?.net).toBe(400_000)
  })

  it('excludes exactly what the continuous chart excludes', () => {
    expect(series.excluded).toEqual(netByMonthSeries(YEARS).excluded)
  })
})

// --- Current debt -----------------------------------------------------------

/*
 * There is no `selectDebtYear` any more, and no test for one.
 *
 * Section 2 held a grid per year until point revision v0.8b, so a grand tile had
 * to choose which of them it spoke for — the latest year that had begun, failing
 * that the earliest on record, with every tile state labelled by its year. §7.1
 * as amended leaves one standing grid of the twelve months the owner is living
 * in, so the tile is about now by construction. The `no-years` state went with
 * the choice: a vault with no years still has a Payments grid.
 */

describe('debtTile', () => {
  it('is GRAND TOTAL DEBT, counters already netted off', () => {
    expect(debtTile(PAYMENTS, MONTH)).toEqual({ kind: 'figure', debt: 1_000_000 })
  })

  it('reports a negative grand total rather than clamping it', () => {
    expect(debtTile(COUNTERS_ONLY, MONTH)).toEqual({ kind: 'figure', debt: -500_000 })
  })

  it('does not print zero for a grid that has no columns', () => {
    expect(debtTile(NO_COLUMNS, MONTH)).toEqual({ kind: 'no-columns' })
  })

  it('says so rather than showing a figure when the grid could not be read', () => {
    expect(debtTile(null, MONTH)).toEqual({ kind: 'unreadable' })
  })

  it('is the same figure in any month, the total being all twelve', () => {
    expect(debtTile(PAYMENTS, 1)).toEqual(debtTile(PAYMENTS, 12))
  })
})

// --- Remaining limit --------------------------------------------------------

describe('remainingTile', () => {
  it('reads TOTAL REMAINING LIMIT and never recomputes it', () => {
    const tile = remainingTile(PAYMENTS, MONTH)
    expect(tile).toEqual({
      kind: 'figure',
      remaining: 7_000_000,
      creditLimit: 10_000_000
    })

    // The two plausible recomputations, both wrong, both written down. A counter
    // column carries debt and no limit, so subtracting the grand total from the
    // credit limit credits headroom to a card that was never charged, and
    // subtracting per column charges the counter's own limit of nothing.
    const computed = computeGrid(PAYMENTS, MONTH)
    expect(computed.totalCreditLimit - computed.grandTotalDebt).toBe(9_000_000)
    const perColumn = computed.columns.reduce(
      (total, column) => total + (column.bank.creditLimit - column.debt),
      0
    )
    expect(perColumn).toBe(5_000_000)

    if (tile.kind !== 'figure') throw new Error('expected a figure')
    expect(tile.remaining).not.toBe(9_000_000)
    expect(tile.remaining).not.toBe(5_000_000)
  })

  it('refuses to say "no headroom left" about a grid that has no cards', () => {
    expect(remainingTile(COUNTERS_ONLY, MONTH)).toEqual({ kind: 'no-limits', counters: 1 })
    expect(remainingTile(NO_COLUMNS, MONTH)).toEqual({ kind: 'no-limits', counters: 0 })
  })

  it('carries the same unreadable state as the debt tile', () => {
    expect(remainingTile(null, MONTH)).toEqual({ kind: 'unreadable' })
  })
})

// --- Valuables --------------------------------------------------------------

describe('marketTile', () => {
  it('is the priced part of the drawer, and names what is not priced', () => {
    expect(marketTile(holdingsOf(PRICED))).toEqual({
      kind: 'figure',
      marketValue: 2_000_000,
      unpricedTypes: ['ceyrek']
    })
  })

  it('says "no price yet" rather than ₺0,00 when nothing is priced', () => {
    const holdings = holdingsOf(UNPRICED)
    // The engine's own figure here is a real zero, which is exactly the trap.
    expect(holdings?.marketValue).toBe(0)
    expect(marketTile(holdings)).toEqual({
      kind: 'none-priced',
      unpricedTypes: ['ceyrek', 'gram']
    })
  })

  it('tells an empty drawer apart from an unpriced one', () => {
    expect(marketTile(holdingsOf(NOTHING))).toEqual({ kind: 'nothing-held' })
    expect(marketTile(holdingsOf(SOLD))).toEqual({ kind: 'nothing-held' })
  })

  it('tells a ledger that did not read apart from both', () => {
    expect(holdingsOf(null)).toBe(null)
    expect(marketTile(null)).toEqual({ kind: 'no-ledger' })
  })
})

describe('unrealisedTile', () => {
  it('measures against pricedCostBasis, never costBasis', () => {
    const holdings = computeHoldings(PRICED)

    // Paid ₺10.000,00 for the gold and ₺20.000,00 for the coins; only the gold
    // has a price. Comparing ₺20.000,00 of market value against the whole
    // ₺30.000,00 would report a ₺10.000,00 loss on a drawer that is up by that
    // much — the unpriced coins would be counted as having become worthless.
    expect(holdings.costBasis).toBe(3_000_000)
    expect(holdings.pricedCostBasis).toBe(1_000_000)
    expect(holdings.marketValue - holdings.costBasis).toBe(-1_000_000)

    const tile = unrealisedTile(holdings)
    expect(tile).toEqual({
      kind: 'figure',
      unrealised: 1_000_000,
      marketValue: 2_000_000,
      pricedCostBasis: 1_000_000,
      unpricedTypes: ['ceyrek']
    })

    if (tile.kind !== 'figure') throw new Error('expected a figure')
    expect(tile.unrealised).toBe(tile.marketValue - tile.pricedCostBasis)
    expect(tile.unrealised).not.toBe(-1_000_000)
  })

  it('is absent rather than zero when nothing is priced', () => {
    const holdings = holdingsOf(UNPRICED)
    // Arithmetically 0 − 0. Semantically: nobody has said what any of it is worth.
    expect(holdings?.unrealised).toBe(0)
    expect(unrealisedTile(holdings)).toEqual({
      kind: 'none-priced',
      unpricedTypes: ['ceyrek', 'gram']
    })
  })

  it('carries the same empty and unreadable states as the market tile', () => {
    expect(unrealisedTile(holdingsOf(NOTHING))).toEqual({ kind: 'nothing-held' })
    expect(unrealisedTile(null)).toEqual({ kind: 'no-ledger' })
  })
})

describe('the unpriced-types attribute', () => {
  it('is sorted, so two places naming the same types write the same string', () => {
    expect(sortedTypeCodes(['gram', 'ceyrek', 'usd'])).toEqual(['ceyrek', 'gram', 'usd'])
    expect(sortedTypeCodes(['usd', 'ceyrek', 'gram'])).toEqual(['ceyrek', 'gram', 'usd'])
    expect(typeCodesAttribute(['gram', 'ceyrek'])).toBe('ceyrek gram')
    expect(typeCodesAttribute([])).toBe('')
  })

  it('does not depend on the order the engine happened to find them in', () => {
    const holdings = computeHoldings(UNPRICED)
    expect(typeCodesAttribute(holdings.missingPrices)).toBe('ceyrek gram')
  })
})

// --- The valuables value line ----------------------------------------------

describe('valueLine', () => {
  it('is buildSeries, point for point, with no arithmetic of its own', () => {
    expect(valueLine(PRICED)).toEqual({
      kind: 'line',
      points: [
        { date: '2026-01-10', value: 1_000_000 },
        { date: '2026-02-20', value: 3_000_000 }
      ],
      latest: { date: '2026-02-20', value: 3_000_000 }
    })
  })

  it('does not end at the market tile, because the two read different prices', () => {
    const line = valueLine(PRICED)
    const tile = marketTile(holdingsOf(PRICED))
    if (line.kind !== 'line') throw new Error('expected a line')
    if (tile.kind !== 'figure') throw new Error('expected a figure')

    // The line values 10 g at the ₺1.000,00/g the ledger row recorded, plus four
    // çeyrek at the ₺5.000,00 their own row recorded: ₺30.000,00 on the day of
    // the last transaction. The tile values the same 10 g at the owner's current
    // ₺2.000,00/g and leaves the unpriced çeyrek out entirely: ₺20.000,00 now.
    // Both are right about different questions; a selector that made them agree
    // would have invented a price history nobody keeps.
    expect(line.latest.value).toBe(3_000_000)
    expect(tile.marketValue).toBe(2_000_000)
    expect(line.latest.value).not.toBe(tile.marketValue)
  })

  it('separates a ledger with no dated points from one that did not read', () => {
    expect(valueLine(NOTHING)).toEqual({ kind: 'empty' })
    expect(valueLine(null)).toEqual({ kind: 'no-ledger' })
  })
})

// --- What did not load ------------------------------------------------------

describe('incompleteReads', () => {
  it('names the failures per section, oldest year first', () => {
    expect(incompleteReads(YEARS, PAYMENTS, PRICED)).toEqual({
      workspaceYears: [2022],
      payments: false,
      ledger: false,
      any: true
    })
  })

  it('reports a Payments grid that did not read as one failure, not a list', () => {
    expect(incompleteReads([], null, PRICED)).toEqual({
      workspaceYears: [],
      payments: true,
      ledger: false,
      any: true
    })
  })

  it('reports a ledger that did not read', () => {
    expect(incompleteReads([], PAYMENTS, null)).toEqual({
      workspaceYears: [],
      payments: false,
      ledger: true,
      any: true
    })
  })

  it('is quiet when everything read', () => {
    const whole: readonly OverviewYear[] = [{ year: 2025, workspace: W2025 }]
    expect(incompleteReads(whole, PAYMENTS, PRICED)).toEqual({
      workspaceYears: [],
      payments: false,
      ledger: false,
      any: false
    })
  })
})
