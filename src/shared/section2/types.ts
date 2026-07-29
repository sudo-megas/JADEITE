/**
 * Section 2 — Payments / Installments. The shapes both sides of the bridge
 * agree on.
 *
 * Types only, so this module can be imported by the sandboxed renderer, the
 * main process and the tests without dragging any runtime behaviour along.
 *
 * Section 2 is lira throughout. Section 1 carries a value type per column
 * because a year of income and expenses can honestly hold dollars; a credit
 * limit and the debt against it are one card's currency by definition, and
 * `s2_banks` has no `value_type` column to say otherwise (schema.ts).
 */

export { MAX_YEAR, MIN_YEAR, MONTHS, isMonth, isValidYear } from '../calendar.js'

/**
 * A column of one year's Payments grid (§7.1).
 *
 * Two kinds of column live in one table because they occupy one row of the top
 * bar and one line of the grid each, and because the source workbook's defect
 * was keeping one list of banks in two places until they disagreed. A counter
 * column is a bank column with `isCounter` set — not a second table, not a
 * second list.
 */
export interface Bank {
  id: number
  year: number
  name: string
  /**
   * Integer minor units, never negative. Always 0 for a counter column: §7.1
   * puts the person in that column's second top-bar row, where a bank keeps its
   * limit, so a counter has no limit to state.
   */
  creditLimit: number
  /** Ordering within its own side; contiguous from 0 after any reorder. */
  position: number
  /** Its values reduce the totals instead of adding to them. */
  isCounter: boolean
  /** The person a counter column belongs to (§7.1, "row 2 = person"). Null for a bank. */
  counterParty: string | null
}

export interface BankDraft {
  name: string
  creditLimit: number
  isCounter: boolean
  counterParty: string | null
}

/**
 * One cell.
 *
 * `amount` is integer minor units and always positive (§5.2); the column's
 * `isCounter` carries the sign. An absent cell is an empty cell — there is no
 * zero-that-means-nothing (§6.3, which Section 2 keeps).
 *
 * There is no note and no refund flag: `s2_cells` has neither, because Section 2
 * records what is due rather than what happened.
 */
export interface Cell {
  bankId: number
  month: number
  amount: number
}

/** What a cell edit asks the vault to do. Clearing is a delete, not a zero. */
export interface CellPatch {
  year: number
  month: number
  bankId: number
  /** null clears the cell entirely. */
  amount: number | null
}

/** Everything one year's Payments grid needs to render itself. */
export interface YearGrid {
  year: number
  /** Frozen by the rollover of §7.3. Readable; every mutation refuses. */
  archived: boolean
  /** The year's accent (§12.3), so both sections wear the same one. */
  accentOverride: string | null
  banks: readonly Bank[]
  cells: readonly Cell[]
}

/**
 * What deleting a column would destroy.
 *
 * Asked for before the offer is made, so the confirmation can name the number
 * of cells and the money in them rather than asking "are you sure?" about an
 * unspecified quantity of the owner's own records.
 */
export interface BankUsage {
  cellCount: number
  /** Unsigned total of this column's own cells. */
  total: number
  isCounter: boolean
}

/** Coarse failure reasons for Section 2, in the style of VaultErrorCode. */
export type Section2ErrorCode =
  | 'LOCKED'
  | 'NO_SUCH_YEAR'
  | 'YEAR_EXISTS'
  /** The year is frozen (§7.3). Reopen it and the same edit will be accepted. */
  | 'ARCHIVED'
  | 'NO_SUCH_BANK'
  | 'DUPLICATE_NAME'
  | 'INVALID_NAME'
  | 'INVALID_AMOUNT'
  | 'INVALID_LIMIT'
  | 'INVALID_YEAR'
  | 'INTERNAL'

/** A column name has to fit in a header and be told apart from its neighbours. */
export const MAX_BANK_NAME_LENGTH = 48

/** A person's name, in a counter column's second top-bar row. */
export const MAX_COUNTER_PARTY_LENGTH = 48
