/**
 * The Section 1 arithmetic — written once, tested, and never re-typed per cell.
 *
 * This module is the whole reason JADEITE exists. The workbook it replaces
 * computed its totals with a formula copied into every row, and one of those
 * copies quietly dropped a column reference; the total went on looking like a
 * total for years. Here there is one function, one test suite, and no way for
 * a row to disagree with its neighbours about what it is adding up.
 *
 * Three rules govern everything below.
 *
 * 1. **Integers only.** Amounts are minor units (kuruş). No float participates,
 *    so a year of additions is exact rather than nearly exact.
 *
 * 2. **The stored number is never signed.** Amounts are positive (§5.2); a
 *    category's `kind` decides which side of the ledger it lands on, and a
 *    refund inverts an entry's contribution to its own category (§6.3). A
 *    forgotten minus therefore cannot turn an expense into income — the shape
 *    that produced the June-2025 elektrik slip is not representable.
 *
 * 3. **Units never mix.** A column is lira, dollars, euro or a plain number,
 *    and a total only ever adds a column to others of the same type. This is
 *    why totals come back as a set of buckets rather than a single number: an
 *    all-lira year — the real workbook's case — yields exactly one bucket, and
 *    the grid draws exactly the income-subtotal and net pair §6.2 asks for. A
 *    year that also holds a dollar column gets a second bucket instead of a
 *    number that means nothing.
 */

import type { Category, Entry, ValueType, YearWorkspace } from './types.js'
import { MONTHS, VALUE_TYPES } from './types.js'

/**
 * What one entry contributes to its own category's total.
 *
 * A refund counts against its category (§6.3): money that came back out of an
 * expense, or income that was returned. It is stored positive with a flag, and
 * inverted exactly here — the one place in the app that knows what the flag
 * means.
 */
export function signedContribution(entry: Pick<Entry, 'amount' | 'isRefund'>): number {
  return entry.isRefund ? -entry.amount : entry.amount
}

/** Income subtotal, expense total and net, all in one value type. */
export interface Bucket {
  valueType: ValueType
  /** The GELİR TOPLAM of the source workbook: income columns, refunds applied. */
  income: number
  /** Expense columns, refunds applied. Positive means money went out. */
  expense: number
  /** income − expense. Negative is a real answer, not an error. */
  net: number
}

export interface MonthRow {
  month: number
  /** Present cells only. An absent category id is an empty cell, not a zero. */
  cells: ReadonlyMap<number, Entry>
  /** One bucket per value type in use, in a stable order. */
  buckets: readonly Bucket[]
}

export interface ComputedWorkspace {
  /** Value types that actually have a column this year, in a stable order. */
  valueTypesInUse: readonly ValueType[]
  /** Twelve rows, Ocak → Aralık, always all twelve even when empty. */
  months: readonly MonthRow[]
  /** Each category's total across the year, keyed by category id. */
  categoryTotals: ReadonlyMap<number, number>
  /** The year summary row (§ Realisation III scope), one bucket per type. */
  yearBuckets: readonly Bucket[]
}

function emptyBucket(valueType: ValueType): Bucket {
  return { valueType, income: 0, expense: 0, net: 0 }
}

/** Stable ordering, so a bucket never changes column position mid-session. */
function orderValueTypes(present: ReadonlySet<ValueType>): ValueType[] {
  return VALUE_TYPES.filter((t) => present.has(t))
}

/**
 * Add one entry into the bucket its category belongs to.
 *
 * The category decides both which bucket (its value type) and which side
 * (its kind); the entry decides only the magnitude and whether it is a refund.
 */
function accumulate(bucket: Bucket, category: Category, contribution: number): void {
  if (category.kind === 'income') bucket.income += contribution
  else bucket.expense += contribution
}

function settleNet(bucket: Bucket): void {
  bucket.net = bucket.income - bucket.expense
}

/**
 * Compute everything a year workspace displays.
 *
 * Entries referring to a category that is not in this workspace are ignored
 * rather than trusted: a retired column must not go on contributing to a total
 * from beyond the grave.
 */
export function computeWorkspace(workspace: YearWorkspace): ComputedWorkspace {
  const categoriesById = new Map<number, Category>()
  for (const category of workspace.categories) categoriesById.set(category.id, category)

  const present = new Set<ValueType>()
  for (const category of workspace.categories) present.add(category.valueType)
  const valueTypesInUse = orderValueTypes(present)

  const cellsByMonth = new Map<number, Map<number, Entry>>()
  for (const month of MONTHS) cellsByMonth.set(month, new Map())

  // Entries are placed first and totalled afterwards, from the placed cells
  // rather than from the incoming stream. The database already forbids two
  // entries in one cell (UNIQUE (year, month, category_id)), but a total that
  // counted a row the grid does not draw would be the source workbook's defect
  // wearing a different hat, so the two are made to read from one place.
  for (const entry of workspace.entries) {
    if (!categoriesById.has(entry.categoryId)) continue
    cellsByMonth.get(entry.month)?.set(entry.categoryId, entry)
  }

  const categoryTotals = new Map<number, number>()
  for (const category of workspace.categories) categoryTotals.set(category.id, 0)

  for (const cells of cellsByMonth.values()) {
    for (const entry of cells.values()) {
      categoryTotals.set(
        entry.categoryId,
        (categoryTotals.get(entry.categoryId) ?? 0) + signedContribution(entry)
      )
    }
  }

  const yearByType = new Map<ValueType, Bucket>()
  for (const valueType of valueTypesInUse) yearByType.set(valueType, emptyBucket(valueType))

  const months: MonthRow[] = MONTHS.map((month) => {
    const cells = cellsByMonth.get(month) ?? new Map<number, Entry>()
    const monthByType = new Map<ValueType, Bucket>()
    for (const valueType of valueTypesInUse) monthByType.set(valueType, emptyBucket(valueType))

    for (const entry of cells.values()) {
      const category = categoriesById.get(entry.categoryId)
      if (!category) continue
      const contribution = signedContribution(entry)

      const monthBucket = monthByType.get(category.valueType)
      if (monthBucket) accumulate(monthBucket, category, contribution)

      const yearBucket = yearByType.get(category.valueType)
      if (yearBucket) accumulate(yearBucket, category, contribution)
    }

    const buckets = valueTypesInUse.map((valueType) => {
      const bucket = monthByType.get(valueType) ?? emptyBucket(valueType)
      settleNet(bucket)
      return bucket
    })

    return { month, cells, buckets }
  })

  const yearBuckets = valueTypesInUse.map((valueType) => {
    const bucket = yearByType.get(valueType) ?? emptyBucket(valueType)
    settleNet(bucket)
    return bucket
  })

  return { valueTypesInUse, months, categoryTotals, yearBuckets }
}

/** The bucket of a given value type, or a zeroed one when the year has no such column. */
export function bucketOf(buckets: readonly Bucket[], valueType: ValueType): Bucket {
  return buckets.find((b) => b.valueType === valueType) ?? emptyBucket(valueType)
}

/**
 * Aggregate a subset of month rows — what the grid shows while a filter is on.
 *
 * The year summary never narrows to the filter: a total whose range silently
 * disagrees with its label is the exact defect §1 was written against. So a
 * filtered view gains a second, plainly separate line for the visible months,
 * and the year's own figure goes on saying what it always said.
 */
export function sumMonths(
  rows: readonly MonthRow[],
  valueTypesInUse: readonly ValueType[]
): Bucket[] {
  return valueTypesInUse.map((valueType) => {
    const total = emptyBucket(valueType)
    for (const row of rows) {
      const bucket = bucketOf(row.buckets, valueType)
      total.income += bucket.income
      total.expense += bucket.expense
    }
    settleNet(total)
    return total
  })
}

/**
 * A category's total across a subset of months.
 *
 * The per-column footer under a filter, computed from the same signed
 * contributions as everything else so it can never disagree with the row above.
 */
export function categoryTotalOver(rows: readonly MonthRow[], categoryId: number): number {
  let total = 0
  for (const row of rows) {
    const entry = row.cells.get(categoryId)
    if (entry) total += signedContribution(entry)
  }
  return total
}

/**
 * Categories in display order: income group, then expenses, each by position.
 *
 * Order is a property of the data, not of whatever order a query happened to
 * return, so the grid and any later consumer (Overview, the importer) agree.
 */
export function orderedCategories(categories: readonly Category[]): Category[] {
  const rank = (kind: Category['kind']): number => (kind === 'income' ? 0 : 1)
  return [...categories].sort(
    (a, b) => rank(a.kind) - rank(b.kind) || a.position - b.position || a.id - b.id
  )
}
