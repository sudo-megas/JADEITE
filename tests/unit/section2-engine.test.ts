/**
 * The Section 2 arithmetic, including the Realisation IV acceptance fixture.
 *
 * The fixture takes the retiring workbook's *shape* — six bank columns with
 * credit limits, three counter columns standing where the sheet keeps the
 * people who are paying some of it back, twelve month lines — and gives it
 * amounts that are nobody's. The workbook itself stays off this repository, so
 * its figures do too; what has to be proved here is that the five computed
 * figures of §7.1 total exactly and agree with each other, which is a property
 * of the arithmetic rather than of any particular row.
 *
 * The real inspected state was run through this same engine on the owner's
 * machine by scripts/verify-payments.mjs and reproduced the sheet's own grand
 * total debt and total remaining limit to the kuruş.
 */

import { describe, expect, it } from 'vitest'

import {
  computeGrid,
  monthState,
  orderedBanks,
  signedDebt,
  type Today
} from '@shared/section2/engine'
import type { Bank, Cell, YearGrid } from '@shared/section2/types'

let nextId = 1

function bank(name: string, creditLimit: number, position: number, year = 2026): Bank {
  return {
    id: nextId++,
    year,
    name,
    creditLimit,
    position,
    isCounter: false,
    counterParty: null
  }
}

function counter(name: string, party: string, position: number, year = 2026): Bank {
  return { id: nextId++, year, name, creditLimit: 0, position, isCounter: true, counterParty: party }
}

function cell(bankId: number, month: number, amount: number): Cell {
  return { bankId, month, amount }
}

function grid(banks: Bank[], cells: Cell[], year = 2026, archived = false): YearGrid {
  return { year, archived, accentOverride: null, banks, cells }
}

/** Fixed, so a test never depends on the day it is run. */
const TODAY: Today = { year: 2026, month: 7 }

// --- The acceptance fixture ------------------------------------------------

/**
 * Six banks and three counter columns, in the sheet's shape.
 *
 * The limits are round because a credit limit is; the debts are not, because
 * an instalment never is. Column F carries a December value on purpose: that
 * is the column and the month the sheet's own `I16`/`I18` formulas omit
 * (XJADEITE §18.2 finding 1), so every figure below depends on a cell the
 * workbook cannot see.
 */
function inspectedState(): YearGrid {
  const a = bank('A', 20_000_000, 0)
  const b = bank('B', 15_000_000, 1)
  const c = bank('C', 12_500_000, 2)
  const d = bank('D', 30_000_000, 3)
  const e = bank('E', 8_800_000, 4)
  const f = bank('F', 25_000_000, 5)

  const sayacA = counter('Sayaç A', 'Sayaç A', 0)
  const sayacB = counter('Sayaç B', 'Sayaç B', 1)
  const kisiC = counter('Sayaç C', 'Sayaç C', 2)

  return grid(
    [a, b, c, d, e, f, sayacA, sayacB, kisiC],
    [
      cell(a.id, 1, 100_000),
      cell(a.id, 2, 200_000),
      cell(b.id, 3, 450_000),
      // C is a card with a limit and nothing drawn on it.
      cell(d.id, 12, 725_050),
      cell(e.id, 6, 111_111),
      cell(f.id, 12, 900_000),
      cell(sayacA.id, 1, 50_000),
      cell(sayacB.id, 12, 25_025),
      cell(kisiC.id, 3, 10_000)
    ]
  )
}

const SUM_OF_LIMITS = 111_300_000
const SUM_OF_BANK_DEBTS = 2_486_161
const SUM_OF_COUNTERS = 85_025
const GRAND_TOTAL_DEBT = SUM_OF_BANK_DEBTS - SUM_OF_COUNTERS
const TOTAL_REMAINING_LIMIT = SUM_OF_LIMITS - SUM_OF_BANK_DEBTS

describe('the inspected state of §7.1 — the acceptance fixture', () => {
  it('draws twelve lines and nine columns, counters last', () => {
    const computed = computeGrid(inspectedState(), TODAY)

    expect(computed.months).toHaveLength(12)
    expect(computed.columns).toHaveLength(9)
    expect(computed.banks).toHaveLength(6)
    expect(computed.counters).toHaveLength(3)
    expect(computed.columns.slice(6).every((column) => column.bank.isCounter)).toBe(true)
    expect(computed.counters.map((column) => column.bank.counterParty)).toEqual([
      'Sayaç A',
      'Sayaç B',
      'Sayaç C'
    ])
  })

  it('totals each month to the kuruş, counters coming off the top', () => {
    const computed = computeGrid(inspectedState(), TODAY)
    const totals = computed.months.map((line) => line.totalDebt)

    //          Ocak    Şubat   Mart    Nis May Haz      Tem Ağu Eyl Eki Kas  Aralık
    expect(totals).toEqual([
      50_000, 200_000, 440_000, 0, 0, 111_111, 0, 0, 0, 0, 0, 1_600_025
    ])

    const ocak = computed.months[0]!
    expect(ocak.bankTotal).toBe(100_000)
    expect(ocak.counterTotal).toBe(50_000)
    expect(ocak.totalDebt).toBe(50_000)
  })

  it('reaches the grand total debt of the DEBT × TOTAL DEBT intersection', () => {
    const computed = computeGrid(inspectedState(), TODAY)
    expect(computed.grandTotalDebt).toBe(GRAND_TOTAL_DEBT)
  })

  it('gives each card its own debt and remainder', () => {
    const computed = computeGrid(inspectedState(), TODAY)

    expect(computed.banks.map((column) => column.debt)).toEqual([
      300_000, 450_000, 0, 725_050, 111_111, 900_000
    ])
    expect(computed.banks.map((column) => column.remaining)).toEqual([
      19_700_000, 14_550_000, 12_500_000, 29_274_950, 8_688_889, 24_100_000
    ])
  })

  it('totals the remaining limit from the row above it, and not from the grand total', () => {
    const computed = computeGrid(inspectedState(), TODAY)

    expect(computed.totalCreditLimit).toBe(SUM_OF_LIMITS)
    expect(computed.totalRemainingLimit).toBe(TOTAL_REMAINING_LIMIT)

    // The row's own total, summed independently of how the engine got there.
    const rowTotal = computed.banks.reduce((sum, column) => sum + (column.remaining ?? 0), 0)
    expect(rowTotal).toBe(computed.totalRemainingLimit)

    // And *not* Σ limits − grand total debt, which would credit the cards with
    // headroom that someone else's repayment created. The two differ by exactly
    // the counter total, which is the whole of the distinction.
    expect(SUM_OF_LIMITS - computed.grandTotalDebt).toBe(
      computed.totalRemainingLimit + SUM_OF_COUNTERS
    )
  })

  it('gives a counter column no remainder at all, rather than a zero', () => {
    const computed = computeGrid(inspectedState(), TODAY)

    for (const column of computed.counters) expect(column.remaining).toBeNull()

    // A zero would read as "no headroom left" and would join the row's total.
    expect(computed.counters.some((column) => column.remaining === 0)).toBe(false)
  })

  it('scales the magnitude bar from the largest month, not from the grand total', () => {
    const computed = computeGrid(inspectedState(), TODAY)
    expect(computed.peakMonthDebt).toBe(1_600_025)
  })
})

// --- The defect the section exists to make impossible -----------------------

describe('the December formula cannot be written down (§18.2 #1)', () => {
  /**
   * The sheet's `I16` and `I18` name their inputs and omit column F. Here every
   * total iterates the columns that exist, so the property to prove is that
   * *any* cell moves *every* figure that depends on it — for all 108 of them,
   * not for the one a reviewer happened to try.
   */
  it('moves every dependent total by exactly the amount added, in every cell', () => {
    const base = inspectedState()
    const delta = 12_345

    for (const column of base.banks) {
      for (let month = 1; month <= 12; month += 1) {
        const before = computeGrid(base, TODAY)
        const existing = base.cells.find((c) => c.bankId === column.id && c.month === month)
        const raised = base.cells
          .filter((c) => !(c.bankId === column.id && c.month === month))
          .concat(cell(column.id, month, (existing?.amount ?? 0) + delta))
        const after = computeGrid(grid([...base.banks], raised), TODAY)

        const sign = column.isCounter ? -1 : 1
        const label = `${column.name} · month ${month}`

        expect(after.months[month - 1]!.totalDebt, label).toBe(
          before.months[month - 1]!.totalDebt + sign * delta
        )
        expect(after.grandTotalDebt, label).toBe(before.grandTotalDebt + sign * delta)

        const beforeColumn = before.columns.find((c) => c.bank.id === column.id)!
        const afterColumn = after.columns.find((c) => c.bank.id === column.id)!
        expect(afterColumn.debt, label).toBe(beforeColumn.debt + delta)

        if (column.isCounter) {
          // A counter has no limit, so nothing in the limit row may move.
          expect(afterColumn.remaining, label).toBeNull()
          expect(after.totalRemainingLimit, label).toBe(before.totalRemainingLimit)
        } else {
          expect(afterColumn.remaining, label).toBe(beforeColumn.remaining! - delta)
          expect(after.totalRemainingLimit, label).toBe(before.totalRemainingLimit - delta)
        }
      }
    }
  })

  it('keeps the two axes equal — down the months and across the columns', () => {
    const computed = computeGrid(inspectedState(), TODAY)

    const downTheMonths = computed.months.reduce((sum, line) => sum + line.totalDebt, 0)
    const acrossTheColumns = computed.columns.reduce(
      (sum, column) => sum + (column.bank.isCounter ? -column.debt : column.debt),
      0
    )

    expect(downTheMonths).toBe(acrossTheColumns)
    expect(computed.grandTotalDebt).toBe(downTheMonths)
  })
})

// --- The sign, in one place -------------------------------------------------

describe('a counter column is one flag, inverted in one function (§5.2)', () => {
  it('reverses a counter and leaves a bank alone', () => {
    expect(signedDebt({ amount: 500 }, { isCounter: false })).toBe(500)
    expect(signedDebt({ amount: 500 }, { isCounter: true })).toBe(-500)
  })

  it('never stores the sign — every amount in the fixture is positive', () => {
    for (const c of inspectedState().cells) expect(c.amount > 0).toBe(true)
  })

  it('never lets a float touch the money', () => {
    const computed = computeGrid(inspectedState(), TODAY)
    const figures = [
      computed.grandTotalDebt,
      computed.totalCreditLimit,
      computed.totalRemainingLimit,
      computed.peakMonthDebt,
      ...computed.months.map((line) => line.totalDebt),
      ...computed.columns.map((column) => column.debt)
    ]
    for (const figure of figures) expect(Number.isSafeInteger(figure)).toBe(true)
  })
})

// --- Empty, absent and departed ---------------------------------------------

describe('empty is empty, and a departed column stays departed', () => {
  it('draws twelve zero lines for a year with nothing in it', () => {
    const computed = computeGrid(grid([bank('A', 10_000_000, 0)], []), TODAY)

    expect(computed.months).toHaveLength(12)
    expect(computed.months.every((line) => line.totalDebt === 0)).toBe(true)
    expect(computed.months.every((line) => line.cells.size === 0)).toBe(true)
    expect(computed.grandTotalDebt).toBe(0)
    expect(computed.peakMonthDebt).toBe(0)
    expect(computed.totalRemainingLimit).toBe(10_000_000)
  })

  it('ignores a cell whose column is not in the grid', () => {
    const a = bank('A', 10_000_000, 0)
    const computed = computeGrid(grid([a], [cell(a.id, 1, 5_000), cell(9_999, 1, 700_000)]), TODAY)

    expect(computed.months[0]!.totalDebt).toBe(5_000)
    expect(computed.grandTotalDebt).toBe(5_000)
    expect(computed.months[0]!.cells.size).toBe(1)
  })

  it('reports a card that is over its limit rather than clamping it', () => {
    const a = bank('A', 100_000, 0)
    const computed = computeGrid(grid([a], [cell(a.id, 1, 150_000)]), TODAY)

    expect(computed.banks[0]!.remaining).toBe(-50_000)
    expect(computed.totalRemainingLimit).toBe(-50_000)
  })
})

// --- Paid and pending, read from the calendar -------------------------------

describe('paid and pending are read from the calendar (§7.2)', () => {
  it('settles what is past, marks what is now, and leaves the rest pending', () => {
    expect(monthState(2026, 6, TODAY)).toBe('settled')
    expect(monthState(2026, 7, TODAY)).toBe('current')
    expect(monthState(2026, 8, TODAY)).toBe('pending')
  })

  it('reads a past year as wholly settled and a future one as wholly pending', () => {
    for (let month = 1; month <= 12; month += 1) {
      expect(monthState(2025, month, TODAY)).toBe('settled')
      expect(monthState(2027, month, TODAY)).toBe('pending')
    }
  })

  it('takes today from its caller, so the arithmetic never reads a clock', () => {
    const computed = computeGrid(inspectedState(), { year: 2026, month: 1 })
    expect(computed.months[0]!.state).toBe('current')
    expect(computed.months[11]!.state).toBe('pending')
  })
})

// --- Display order ----------------------------------------------------------

describe('display order puts counter columns after the total (§7.1)', () => {
  it('orders banks by position, then counters by position', () => {
    const later = bank('B', 0, 1)
    const earlier = bank('A', 0, 0)
    const counterLater = counter('Sayaç B', 'Sayaç B', 1)
    const counterEarlier = counter('Sayaç A', 'Sayaç A', 0)

    const ordered = orderedBanks([counterLater, later, counterEarlier, earlier])
    expect(ordered.map((b) => b.name)).toEqual(['A', 'B', 'Sayaç A', 'Sayaç B'])
  })
})
