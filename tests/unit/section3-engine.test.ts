/**
 * The Section 3 arithmetic, including the Realisation V acceptance fixture.
 *
 * REALISATION.md asks Section 3 to reproduce six figures: holdings of 30 g, cost
 * basis ₺188.000, market value ₺195.150 at ₺6.505/g, unrealised +₺7.150, and per
 * person Kişi A ₺130.100 / Kişi B ₺65.050. Those figures come from the owner's own
 * retiring documents, and the documents themselves are never opened by anything
 * in this repository (XJADEITE §18.2).
 *
 * They do not need to be. The figures are enough to author a ledger that
 * produces them — three acquisitions and one disposal, exactly as the acceptance
 * line words it — and every step of it lands on an exact integer number of
 * kuruş. Nothing below is anybody's real history; what is proved is that the
 * arithmetic reaches those six numbers, which is a property of the engine rather
 * than of any particular purchase.
 *
 * The fixture is deliberately arranged so the disposal consumes a lot *entirely*
 * and leaves a later one untouched. That is the case which distinguishes
 * oldest-lot-first from every other reading of cost basis, and it is the case the
 * owner's real history is: the cheap early gold became a car, and what remains
 * was bought this year.
 */

import { describe, expect, it } from 'vitest'

import {
  computeHoldings,
  computeLedger,
  orderedTransactions,
  signedQuantity
} from '@shared/section3/engine'
import { transactionValue } from '@shared/section3/units'
import type {
  LedgerData,
  ManualPrice,
  Person,
  Transaction,
  TypeCode,
  ValuableType
} from '@shared/section3/types'

// --- Building a ledger ------------------------------------------------------

const ORTAK: Person = { id: 1, name: 'Ortak', colour: null, isBuiltin: true, position: 0 }
const KISI_A: Person = { id: 2, name: 'Kişi A', colour: null, isBuiltin: false, position: 1 }
const KISI_B: Person = { id: 3, name: 'Kişi B', colour: null, isBuiltin: false, position: 2 }

/** The seeded closed list of §8.2, in the order the vault holds it. */
const TYPES: ValuableType[] = [
  { code: 'gram', unit: 'mg', position: 1 },
  { code: 'ceyrek', unit: 'piece', position: 2 },
  { code: 'usd', unit: 'minor', position: 7 },
  { code: 'gumus', unit: 'mg', position: 9 }
]

/** ₺6.505,00 per gram — the manual price the acceptance figures are quoted at. */
const GOLD_PRICE = 650_500

let nextSeq = 1

interface RowOptions {
  provisional?: boolean
  source?: string | null
  personId?: number | null
}

function row(
  date: string,
  person: Person | null,
  typeCode: TypeCode,
  direction: 'acquire' | 'dispose',
  quantity: number,
  unitPrice: number,
  options: RowOptions = {}
): Transaction {
  return {
    seq: nextSeq++,
    date,
    dateProvisional: options.provisional ?? false,
    typeCode,
    direction,
    quantity,
    unitPrice,
    source: options.source ?? null,
    personId: options.personId !== undefined ? options.personId : (person?.id ?? null),
    note: null
  }
}

function ledger(
  transactions: Transaction[],
  prices: ManualPrice[] = [],
  persons: Person[] = [ORTAK, KISI_A, KISI_B]
): LedgerData {
  return { persons, types: TYPES, transactions, manualPrices: prices, livePrices: [] }
}

function price(typeCode: TypeCode, value: number): ManualPrice {
  return { typeCode, value, updatedAt: '2026-07-30T00:00:00.000Z' }
}

// --- The acceptance fixture -------------------------------------------------

/**
 * Three acquisitions and a disposal.
 *
 * Kişi A buys 10 g cheaply, then 20 g; Kişi B buys 10 g; Kişi A then disposes of
 * 10 g, which the oldest-first rule takes entirely from her January lot. What
 * survives is her 20 g at ₺5.900,00 and his 10 g at ₺7.000,00 — ₺118.000 plus
 * ₺70.000, which is the acceptance cost basis to the kuruş.
 *
 * The disposal carries a price of its own because it fetched something. That
 * price must touch no figure below except the ledger's own disposed-value total.
 */
function acceptanceFixture(): LedgerData {
  return ledger(
    [
      row('2026-01-15', KISI_A, 'gram', 'acquire', 10_000, 500_000),
      row('2026-02-20', KISI_A, 'gram', 'acquire', 20_000, 590_000),
      row('2026-03-10', KISI_B, 'gram', 'acquire', 10_000, 700_000),
      row('2026-04-05', KISI_A, 'gram', 'dispose', 10_000, 650_000)
    ],
    [price('gram', GOLD_PRICE)]
  )
}

describe('the Realisation V acceptance figures', () => {
  it('reaches all six from the ledger alone', () => {
    const view = computeHoldings(acceptanceFixture())

    // 30 g held, and the two axes agree about it.
    const quantity = view.byPerson.flatMap((entry) =>
      entry.holdings.map((holding) => holding.quantity)
    )
    expect(quantity.reduce((a, b) => a + b, 0)).toBe(30_000)

    expect(view.costBasis).toBe(18_800_000) // ₺188.000,00
    expect(view.marketValue).toBe(19_515_000) // ₺195.150,00
    expect(view.unrealised).toBe(715_000) // +₺7.150,00

    const kisiA = view.byPerson.find((entry) => entry.person.id === KISI_A.id)
    const kisiB = view.byPerson.find((entry) => entry.person.id === KISI_B.id)

    expect(kisiA?.marketValue).toBe(13_010_000) // ₺130.100,00
    expect(kisiB?.marketValue).toBe(6_505_000) // ₺65.050,00
  })

  it('splits the holding twenty grams to ten', () => {
    const view = computeHoldings(acceptanceFixture())
    const kisiA = view.byPerson.find((entry) => entry.person.id === KISI_A.id)
    const kisiB = view.byPerson.find((entry) => entry.person.id === KISI_B.id)

    expect(kisiA?.holdings[0]?.quantity).toBe(20_000)
    expect(kisiB?.holdings[0]?.quantity).toBe(10_000)
  })

  it('leaves Ortak out of the holdings entirely, having no rows', () => {
    const view = computeHoldings(acceptanceFixture())
    expect(view.byPerson.map((entry) => entry.person.name)).toEqual(['Kişi A', 'Kişi B'])
  })

  it('reports nothing unpriced and nothing amiss', () => {
    const view = computeHoldings(acceptanceFixture())
    expect(view.missingPrices).toEqual([])
    expect(view.discrepancies).toEqual([])
    expect(view.pricedCostBasis).toBe(view.costBasis)
  })
})

// --- Why oldest-lot-first ---------------------------------------------------

describe('cost basis is the cost of what is still held (§8.6)', () => {
  it('consumes the earliest lot first, so the surviving cost is the later price', () => {
    const view = computeHoldings(acceptanceFixture())
    const kisiA = view.byPerson.find((entry) => entry.person.id === KISI_A.id)

    // Her January lot is gone entirely; ₺118.000 is her February lot alone.
    expect(kisiA?.costBasis).toBe(11_800_000)
  })

  it('is not the lifetime acquisition total, which would report a false loss', () => {
    const view = computeHoldings(acceptanceFixture())
    const lifetime = 5_000_000 + 11_800_000 + 7_000_000
    expect(view.costBasis).not.toBe(lifetime)
    expect(view.costBasis).toBeLessThan(lifetime)
  })

  it('is not a weighted average, which would blend a cheap year into a dear one', () => {
    const view = computeHoldings(acceptanceFixture())
    // 40 g acquired for ₺243.850 averages ₺6.096,25/g; 30 g of that is ₺182.887,50.
    expect(view.costBasis).not.toBe(18_288_750)
  })

  it('takes only part of a lot when the disposal is smaller than it', () => {
    const view = computeHoldings(
      ledger(
        [
          row('2026-01-15', KISI_A, 'gram', 'acquire', 20_000, 500_000),
          row('2026-02-20', KISI_A, 'gram', 'dispose', 5_000, 650_000)
        ],
        [price('gram', GOLD_PRICE)]
      )
    )

    const kisiA = view.byPerson[0]
    expect(kisiA?.holdings[0]?.quantity).toBe(15_000)
    expect(kisiA?.costBasis).toBe(transactionValue(15_000, 500_000, 'mg'))
  })

  it('walks on to the next lot when one disposal spans two', () => {
    const view = computeHoldings(
      ledger(
        [
          row('2026-01-15', KISI_A, 'gram', 'acquire', 10_000, 500_000),
          row('2026-02-20', KISI_A, 'gram', 'acquire', 10_000, 700_000),
          row('2026-03-10', KISI_A, 'gram', 'dispose', 15_000, 650_000)
        ],
        [price('gram', GOLD_PRICE)]
      )
    )

    // The first lot goes whole and half the second follows it.
    expect(view.byPerson[0]?.holdings[0]?.quantity).toBe(5_000)
    expect(view.byPerson[0]?.costBasis).toBe(transactionValue(5_000, 700_000, 'mg'))
  })

  it('keeps one person’s lots out of another’s', () => {
    const view = computeHoldings(
      ledger(
        [
          row('2026-01-15', KISI_A, 'gram', 'acquire', 10_000, 500_000),
          row('2026-02-20', KISI_B, 'gram', 'acquire', 10_000, 700_000),
          // Kişi A disposes; only her lot may be consumed.
          row('2026-03-10', KISI_A, 'gram', 'dispose', 10_000, 650_000)
        ],
        [price('gram', GOLD_PRICE)]
      )
    )

    const kisiB = view.byPerson.find((entry) => entry.person.id === KISI_B.id)
    expect(kisiB?.holdings[0]?.quantity).toBe(10_000)
    expect(kisiB?.costBasis).toBe(7_000_000)
    // Kişi A is left holding nothing, so she has no current holding at all.
    expect(view.byPerson.some((entry) => entry.person.id === KISI_A.id)).toBe(false)
  })

  it('keeps one type’s lots out of another’s', () => {
    const view = computeHoldings(
      ledger(
        [
          row('2026-01-15', KISI_A, 'gram', 'acquire', 10_000, 500_000),
          row('2026-02-20', KISI_A, 'gumus', 'acquire', 10_000, 8_000),
          row('2026-03-10', KISI_A, 'gumus', 'dispose', 10_000, 8_500)
        ],
        [price('gram', GOLD_PRICE)]
      )
    )

    const holdings = view.byPerson[0]?.holdings ?? []
    expect(holdings.map((holding) => holding.typeCode)).toEqual(['gram'])
    expect(holdings[0]?.quantity).toBe(10_000)
  })
})

// --- A disposal never edits history ----------------------------------------

describe('disposals reduce holdings, never cost-basis history', () => {
  it('leaves every acquisition row showing what it cost on the day', () => {
    const view = computeLedger(acceptanceFixture())
    const totals = view.rows.map((r) => r.total)

    expect(totals[0]).toBe(5_000_000) // 10 g at ₺5.000,00
    expect(totals[1]).toBe(11_800_000) // 20 g at ₺5.900,00
    expect(totals[2]).toBe(7_000_000) // 10 g at ₺7.000,00
    expect(totals[3]).toBe(6_500_000) // the disposal, at what it fetched
  })

  it('totals what was acquired and what was disposed of separately', () => {
    const totals = computeLedger(acceptanceFixture()).totals
    expect(totals.acquiredValue).toBe(23_800_000)
    expect(totals.disposedValue).toBe(6_500_000)
  })

  it('lets the disposal price move without touching a single holding figure', () => {
    const before = computeHoldings(acceptanceFixture())

    const data = acceptanceFixture()
    const dearer = data.transactions.map((transaction) =>
      transaction.direction === 'dispose' ? { ...transaction, unitPrice: 999_999 } : transaction
    )
    const after = computeHoldings({ ...data, transactions: dearer })

    expect(after.costBasis).toBe(before.costBasis)
    expect(after.marketValue).toBe(before.marketValue)
    expect(after.unrealised).toBe(before.unrealised)
  })

  it('inverts the direction in exactly one place', () => {
    expect(signedQuantity({ direction: 'acquire', quantity: 10_000 })).toBe(10_000)
    expect(signedQuantity({ direction: 'dispose', quantity: 10_000 })).toBe(-10_000)
  })
})

// --- The two axes ----------------------------------------------------------

describe('the two axes must agree (§8.4’s cross-check)', () => {
  it('agrees on every holding of the fixture', () => {
    const view = computeHoldings(acceptanceFixture())
    for (const entry of view.byPerson) {
      for (const holding of entry.holdings) {
        expect(holding.quantity).toBe(holding.lotQuantity)
        expect(holding.oversold).toBe(false)
      }
    }
  })

  /**
   * The one way they can part: the ledger disposes of something it never
   * recorded acquiring. During the typing sessions of §18.5 this is the expected
   * state of gold until every purchase preceding the car has been entered, so it
   * is flagged and shown rather than clamped away.
   */
  it('flags a holding disposed of beyond what was acquired, and does not clamp it', () => {
    const view = computeHoldings(
      ledger(
        [
          row('2026-01-15', KISI_A, 'gram', 'acquire', 30_000, 500_000),
          row('2026-02-20', KISI_A, 'gram', 'dispose', 40_000, 650_000)
        ],
        [price('gram', GOLD_PRICE)]
      )
    )

    const holding = view.byPerson[0]?.holdings[0]
    expect(holding?.quantity).toBe(-10_000)
    expect(holding?.lotQuantity).toBe(0)
    expect(holding?.oversold).toBe(true)
    expect(view.discrepancies).toHaveLength(1)

    // The market value goes negative with it, rather than reading as nothing.
    expect(holding?.marketValue).toBe(-6_505_000)
  })

  it('reports no discrepancy for a holding that merely reached zero', () => {
    const view = computeHoldings(
      ledger(
        [
          row('2026-01-15', KISI_A, 'gram', 'acquire', 30_000, 500_000),
          row('2026-02-20', KISI_A, 'gram', 'dispose', 30_000, 650_000)
        ],
        [price('gram', GOLD_PRICE)]
      )
    )

    expect(view.discrepancies).toEqual([])
    expect(view.byPerson).toEqual([])
  })
})

// --- Ordering --------------------------------------------------------------

describe('the ledger is ordered by when things happened', () => {
  it('orders by date, then by seq for two rows on one day', () => {
    const later = row('2026-03-10', KISI_A, 'gram', 'acquire', 1_000, 100)
    const earlier = row('2026-01-15', KISI_A, 'gram', 'acquire', 1_000, 100)
    const sameDay = row('2026-03-10', KISI_A, 'gram', 'acquire', 1_000, 100)

    const ordered = orderedTransactions([sameDay, earlier, later])
    expect(ordered.map((t) => t.seq)).toEqual([earlier.seq, later.seq, sameDay.seq])
  })

  /**
   * A purchase remembered late must still be consumed in its own place. This is
   * the row of §18.3 item 6 — the one whose price proves its date is wrong — and
   * it will be typed long after the rows around it.
   */
  it('consumes a lot typed late but dated early, in its dated place', () => {
    const data = ledger(
      [
        row('2026-02-20', KISI_A, 'gram', 'acquire', 10_000, 700_000),
        row('2026-03-10', KISI_A, 'gram', 'dispose', 10_000, 650_000),
        // Typed third, dated first: this is the lot the disposal must take.
        row('2026-01-15', KISI_A, 'gram', 'acquire', 10_000, 500_000, { provisional: true })
      ],
      [price('gram', GOLD_PRICE)]
    )

    const view = computeHoldings(data)
    expect(view.byPerson[0]?.holdings[0]?.quantity).toBe(10_000)
    // The cheap January lot went; the February one at ₺7.000,00 survives.
    expect(view.byPerson[0]?.costBasis).toBe(7_000_000)
  })

  it('counts the rows still awaiting a date check', () => {
    const data = ledger([
      row('2026-01-15', KISI_A, 'gram', 'acquire', 10_000, 500_000, { provisional: true }),
      row('2026-02-20', KISI_A, 'gram', 'acquire', 10_000, 500_000)
    ])
    expect(computeLedger(data).totals.provisionalCount).toBe(1)
  })
})

// --- The running quantity column -------------------------------------------

describe('the Total Quantity column (§8.3)', () => {
  it('runs per type, so milligrams are never added to coins', () => {
    const data = ledger([
      row('2026-01-15', KISI_A, 'gram', 'acquire', 10_000, 500_000),
      row('2026-02-20', KISI_A, 'ceyrek', 'acquire', 4, 420_000),
      row('2026-03-10', KISI_A, 'gram', 'acquire', 20_000, 590_000)
    ])

    const rows = computeLedger(data).rows
    expect(rows.map((r) => r.runningQuantity)).toEqual([10_000, 4, 30_000])

    const byType = computeLedger(data).totals.quantityByType
    expect(byType.get('gram')).toBe(30_000)
    expect(byType.get('ceyrek')).toBe(4)
  })

  it('shows the disposal as a cliff rather than as a disagreement', () => {
    const rows = computeLedger(acceptanceFixture()).rows
    expect(rows.map((r) => r.runningQuantity)).toEqual([10_000, 30_000, 40_000, 30_000])
  })
})

// --- Unattributed rows -----------------------------------------------------

describe('a row with no person belongs to Ortak (§8.1)', () => {
  it('attributes a null person to the built-in', () => {
    const data = ledger(
      [row('2026-01-15', null, 'gram', 'acquire', 10_000, 500_000, { personId: null })],
      [price('gram', GOLD_PRICE)]
    )

    expect(computeLedger(data).rows[0]?.person.name).toBe('Ortak')
    expect(computeHoldings(data).byPerson[0]?.person.name).toBe('Ortak')
  })

  it('attributes a person who has since been removed to the built-in', () => {
    const data = ledger(
      [row('2026-01-15', null, 'gram', 'acquire', 10_000, 500_000, { personId: 999 })],
      [price('gram', GOLD_PRICE)]
    )
    expect(computeLedger(data).rows[0]?.person.name).toBe('Ortak')
  })
})

// --- Prices that are not there yet -----------------------------------------

describe('a holding with no price is counted but not valued (§8.5)', () => {
  it('names the type and keeps the unrealised figure like-for-like', () => {
    const view = computeHoldings(
      ledger(
        [
          row('2026-01-15', KISI_A, 'gram', 'acquire', 30_000, 590_000),
          row('2026-02-20', KISI_A, 'ceyrek', 'acquire', 4, 420_000)
        ],
        // Only gold has a manual price typed.
        [price('gram', GOLD_PRICE)]
      )
    )

    expect(view.missingPrices).toEqual(['ceyrek'])

    const coins = view.byPerson[0]?.holdings.find((h) => h.typeCode === 'ceyrek')
    expect(coins?.marketValue).toBeNull()
    expect(coins?.unrealised).toBeNull()

    // Cost basis counts both; the unrealised comparison counts only the priced
    // one, so it is never a market value measured against a cost it excludes.
    expect(view.costBasis).toBe(17_700_000 + 1_680_000)
    expect(view.pricedCostBasis).toBe(17_700_000)
    expect(view.unrealised).toBe(19_515_000 - 17_700_000)
  })
})

// --- The sweep -------------------------------------------------------------

/**
 * Section 2's suite walks all 108 cells asserting that changing any one of them
 * moves every dependent figure by exactly that amount. The same discipline, on
 * the axis Section 3 has: add a gram to any acquisition and the holding, the
 * market value and the cost basis must each move by exactly one gram's worth —
 * the cost at *that row's* price, because that is the lot which grows.
 */
describe('every acquisition moves every figure that depends on it', () => {
  it('moves holdings, market value and cost basis by exactly one gram', () => {
    const base = acceptanceFixture()
    const before = computeHoldings(base)

    base.transactions.forEach((transaction, index) => {
      if (transaction.direction !== 'acquire') return

      const bumped = base.transactions.map((candidate, i) =>
        i === index ? { ...candidate, quantity: candidate.quantity + 1_000 } : candidate
      )
      const after = computeHoldings({ ...base, transactions: bumped })

      const label = `row ${transaction.seq}`

      const heldBefore = before.byPerson.reduce(
        (sum, entry) => sum + entry.holdings.reduce((s, h) => s + h.quantity, 0),
        0
      )
      const heldAfter = after.byPerson.reduce(
        (sum, entry) => sum + entry.holdings.reduce((s, h) => s + h.quantity, 0),
        0
      )

      expect(heldAfter - heldBefore, label).toBe(1_000)
      expect(after.marketValue - before.marketValue, label).toBe(
        transactionValue(1_000, GOLD_PRICE, 'mg')
      )
      expect(after.costBasis - before.costBasis, label).toBe(
        transactionValue(1_000, transaction.unitPrice, 'mg')
      )
    })
  })
})
