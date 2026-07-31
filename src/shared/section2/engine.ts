/**
 * The Section 2 arithmetic — written once, tested, and never re-typed per cell.
 *
 * The workbook this replaces computed its December total and its grand total
 * with formulas that *named* their inputs, and one of those names was left out:
 * `SUM(C..E)+G+H` where a column F had quietly appeared. The total went on
 * looking like a total. Nothing here names a column. Every total iterates the
 * columns that exist, so a column cannot be forgotten by a formula that was
 * written before it was added.
 *
 * Four rules govern everything below.
 *
 * 1. **Integers only.** Amounts are minor units (kuruş). No float participates.
 *
 * 2. **The stored number is never signed.** Amounts are positive (§5.2); a
 *    column's `isCounter` decides whether it adds to the debt or comes off it,
 *    and that is applied in exactly one function. The sheet stores counter
 *    values negative; that is the shape §5.2 exists to make unrepresentable.
 *
 * 3. **The two axes must agree.** The grid can be totalled down its months or
 *    across its columns, and `grandTotalDebt` is computed from the months while
 *    each column's `debt` is computed from the same placed cells. The unit
 *    suite asserts the two are equal, because disagreement between the axes is
 *    precisely what the sheet lost.
 *
 * 4. **A remaining limit belongs to a card.** `TOTAL REMAINING LIMIT` is the
 *    total of the Remaining Limit *row* (§7.1, bottom bar row 3), and counter
 *    columns have no cell in that row — they have no limit. Money someone else
 *    is paying back reduces what is owed; it does not restore headroom on a
 *    card. This is also the only reading that reproduces the acceptance figure
 *    in REALISATION.md.
 */

import { MONTHS } from '../calendar.js'
import type { Bank, Cell, PaymentsGrid } from './types.js'

/**
 * What one cell contributes to every total it touches.
 *
 * Stored positive with a flag on its column (§7.1) and inverted exactly here —
 * the one place in the app that knows what `is_counter` means. Mirror of
 * shared/section1/engine.ts:signedContribution, for the same reason: a rule
 * about the owner's money written down twice is a rule that will be changed
 * once.
 */
export function signedDebt(
  cell: Pick<Cell, 'amount'>,
  bank: Pick<Bank, 'isCounter'>
): number {
  return bank.isCounter ? -cell.amount : cell.amount
}

/**
 * Where a month sits relative to now (§7.2's "paid/pending state cues").
 *
 * Derived, never stored: `s2_cells` has no paid flag, and inventing one would
 * ask the owner to maintain a second record of something the calendar already
 * knows.
 *
 * The comparison is between two months of one standing grid (§7.1 as amended).
 * It used to take a year as well, and read a whole past year as settled and a
 * whole future one as pending; with the year gone from Section 2 there is no
 * such grid to describe, and the twelve lines always straddle the present.
 */
export type MonthState = 'settled' | 'current' | 'pending'

/**
 * The month the owner is in, 1–12. Supplied by the caller rather than read here,
 * so this module stays pure and the tests never race a clock.
 */
export function monthState(month: number, currentMonth: number): MonthState {
  if (month === currentMonth) return 'current'
  return month < currentMonth ? 'settled' : 'pending'
}

/** One of the twelve lines of §7.1. */
export interface MonthLine {
  month: number
  /** Present cells only, by bank id. An absent id is an empty cell, not a zero. */
  cells: ReadonlyMap<number, Cell>
  /** The TOTAL DEBT column: bank columns less counter columns. */
  totalDebt: number
  /** Bank columns alone, unsigned. Kept so the two axes can be checked. */
  bankTotal: number
  /** Counter columns alone, as a positive magnitude. */
  counterTotal: number
  state: MonthState
}

/** One column of §7.1, with the two bottom-bar figures it owns. */
export interface BankColumn {
  bank: Bank
  /** The DEBT row: this column's twelve cells, unsigned. */
  debt: number
  /** The Remaining Limit row. **null for a counter column** — it has no limit. */
  remaining: number | null
}

export interface ComputedGrid {
  /** Twelve lines, Ocak → Aralık, always all twelve even when empty. */
  months: readonly MonthLine[]
  /** Every column in draw order: banks by position, then counters. */
  columns: readonly BankColumn[]
  banks: readonly BankColumn[]
  counters: readonly BankColumn[]
  /** The DEBT row × TOTAL DEBT column intersection (§7.1). */
  grandTotalDebt: number
  /** Σ credit limits over real banks. Counters carry none. */
  totalCreditLimit: number
  /** Σ of the Remaining Limit row. Counters have no cell in it. */
  totalRemainingLimit: number
  /** The largest |TOTAL DEBT| of the twelve, for scaling the magnitude bar. */
  peakMonthDebt: number
}

/**
 * Draw order: banks first by position, then counter columns by position.
 *
 * §7.1 places counter columns after the TOTAL DEBT column, so they come last.
 * The repository's ORDER BY produces the same sequence; the two must agree or
 * the grid and the store disagree about which column is first.
 */
export function orderedBanks(banks: readonly Bank[]): Bank[] {
  const rank = (bank: Bank): number => (bank.isCounter ? 1 : 0)
  return [...banks].sort(
    (a, b) => rank(a) - rank(b) || a.position - b.position || a.id - b.id
  )
}

/**
 * Compute everything the Payments grid displays.
 *
 * Cells referring to a column that is not in this grid are ignored rather than
 * trusted: a deleted column must not go on contributing to a total from beyond
 * the grave. Cells are placed into the grid first and totalled from what was
 * placed, so a total can never count a row the grid does not draw.
 */
export function computeGrid(grid: PaymentsGrid, currentMonth: number): ComputedGrid {
  const ordered = orderedBanks(grid.banks)
  const banksById = new Map<number, Bank>()
  for (const bank of ordered) banksById.set(bank.id, bank)

  const cellsByMonth = new Map<number, Map<number, Cell>>()
  for (const month of MONTHS) cellsByMonth.set(month, new Map<number, Cell>())

  const debtByBank = new Map<number, number>()
  for (const bank of ordered) debtByBank.set(bank.id, 0)

  for (const cell of grid.cells) {
    if (!banksById.has(cell.bankId)) continue
    const row = cellsByMonth.get(cell.month)
    if (!row) continue
    row.set(cell.bankId, cell)
    debtByBank.set(cell.bankId, (debtByBank.get(cell.bankId) ?? 0) + cell.amount)
  }

  const months: MonthLine[] = MONTHS.map((month) => {
    const cells = cellsByMonth.get(month) ?? new Map<number, Cell>()
    let bankTotal = 0
    let counterTotal = 0

    for (const cell of cells.values()) {
      const bank = banksById.get(cell.bankId)
      if (!bank) continue
      if (bank.isCounter) counterTotal += cell.amount
      else bankTotal += cell.amount
    }

    return {
      month,
      cells,
      totalDebt: bankTotal - counterTotal,
      bankTotal,
      counterTotal,
      state: monthState(month, currentMonth)
    }
  })

  const columns: BankColumn[] = ordered.map((bank) => {
    const debt = debtByBank.get(bank.id) ?? 0
    return {
      bank,
      debt,
      // A counter column has no limit, so it has no remainder — not a zero,
      // which would read as "no headroom left" and join the row's total.
      remaining: bank.isCounter ? null : bank.creditLimit - debt
    }
  })

  const banks = columns.filter((column) => !column.bank.isCounter)
  const counters = columns.filter((column) => column.bank.isCounter)

  let grandTotalDebt = 0
  let peakMonthDebt = 0
  for (const line of months) {
    grandTotalDebt += line.totalDebt
    const magnitude = Math.abs(line.totalDebt)
    if (magnitude > peakMonthDebt) peakMonthDebt = magnitude
  }

  let totalCreditLimit = 0
  let totalRemainingLimit = 0
  for (const column of banks) {
    totalCreditLimit += column.bank.creditLimit
    totalRemainingLimit += column.remaining ?? 0
  }

  return {
    months,
    columns,
    banks,
    counters,
    grandTotalDebt,
    totalCreditLimit,
    totalRemainingLimit,
    peakMonthDebt
  }
}
