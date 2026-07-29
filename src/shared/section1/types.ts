/**
 * Section 1 — Income & Expenses. The shapes both sides of the bridge agree on.
 *
 * Types only, so this module can be imported by the sandboxed renderer, the
 * main process and the tests without dragging any runtime behaviour along.
 */

/** Which side of the ledger a column sits on (§6.2). */
export type CategoryKind = 'income' | 'expense'

/**
 * What a column's numbers *are* (§6.2).
 *
 * Three currencies and a plain number. This is not decoration: it decides which
 * total a column may be added into, because adding lira to dollars is the
 * category of silent nonsense JADEITE exists to end.
 */
export type ValueType = 'TRY' | 'USD' | 'EUR' | 'plain'

export const VALUE_TYPES: readonly ValueType[] = Object.freeze(['TRY', 'USD', 'EUR', 'plain'])

/** The default a new column takes, per §6.2. */
export const DEFAULT_VALUE_TYPE: ValueType = 'TRY'

/** Ocak … Aralık. Twelve rows, always, in this order (§6.1). */
export const MONTHS: readonly number[] = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])

export function isMonth(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 12
}

/** A column of one year's workspace. Each year owns its own set (§6.2). */
export interface Category {
  id: number
  year: number
  name: string
  kind: CategoryKind
  valueType: ValueType
  /** Ordering within its group; contiguous from 0 after any reorder. */
  position: number
}

/**
 * One cell.
 *
 * `amount` is integer minor units and always positive (§5.2); the category's
 * kind carries the sign, and `isRefund` inverts the entry's contribution to its
 * own category. An absent entry is an empty cell — there is no zero-that-means-
 * nothing and no '-' placeholder (§6.3).
 */
export interface Entry {
  categoryId: number
  month: number
  amount: number
  isRefund: boolean
  note: string | null
}

/** Everything one year workspace needs to render itself. */
export interface YearWorkspace {
  year: number
  /** A manual per-year accent override (§12.3), or null for the sequence value. */
  accentOverride: string | null
  categories: readonly Category[]
  entries: readonly Entry[]
}

/** What a cell edit asks the vault to do. Clearing is a delete, not a zero. */
export interface EntryPatch {
  year: number
  month: number
  categoryId: number
  /** null clears the cell entirely (§6.3: empty is empty). */
  amount: number | null
  isRefund: boolean
  note: string | null
}

export interface CategoryDraft {
  name: string
  kind: CategoryKind
  valueType: ValueType
}

/**
 * What deleting a column would destroy.
 *
 * Asked for before the offer is made, so the confirmation can name the number
 * of cells and the money in them rather than asking "are you sure?" about an
 * unspecified quantity of the owner's own records.
 */
export interface CategoryUsage {
  entryCount: number
  /** Signed total, refunds applied — the same arithmetic the grid shows. */
  total: number
  valueType: ValueType
}

/**
 * What deleting a whole year would destroy.
 *
 * Counted rather than summed: a year can hold several value types, and a
 * confirmation is not the place to explain currency buckets. The counts are
 * enough to say plainly how much work is about to disappear.
 */
export interface YearUsage {
  categoryCount: number
  entryCount: number
}

/** Coarse failure reasons for Section 1, in the style of VaultErrorCode. */
export type Section1ErrorCode =
  | 'LOCKED'
  | 'NO_SUCH_YEAR'
  | 'YEAR_EXISTS'
  /** The last remaining year cannot go: the switcher must have somewhere to be. */
  | 'LAST_YEAR'
  | 'NO_SUCH_CATEGORY'
  | 'DUPLICATE_NAME'
  | 'INVALID_NAME'
  | 'INVALID_AMOUNT'
  | 'INVALID_YEAR'
  | 'INTERNAL'

/**
 * Bounds on a year number.
 *
 * Wide enough to be nobody's problem and narrow enough that a typo cannot
 * create a workspace at year 202600 and leave it in the switcher forever.
 */
export const MIN_YEAR = 1970
export const MAX_YEAR = 2200

/** A column name has to fit in a header and be told apart from its neighbours. */
export const MAX_CATEGORY_NAME_LENGTH = 48
export const MAX_NOTE_LENGTH = 512
