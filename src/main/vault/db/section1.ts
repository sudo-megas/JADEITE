/**
 * Section 1 storage — column sets and cells, within a year.
 *
 * Everything here is a write against the encrypted database or a read out of
 * it. No arithmetic lives in this file: totals are computed by
 * shared/section1/engine.ts and stored nowhere (§5.3), so there is no cached
 * sum that can fall out of step with the rows it claims to describe.
 *
 * The year lifecycle itself moved to db/years.ts in Realisation IV, because
 * `years` parents Section 2's tables too and one section should not own the
 * table another one hangs from. It is re-exported below so every caller keeps
 * the import it already had.
 *
 * The invariant that makes most of these functions transactions: positions are
 * contiguous from zero within a (year, kind) group, so a reorder cannot leave a
 * gap that later reads have to guess about.
 */

import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'

import type {
  Category,
  CategoryDraft,
  CategoryKind,
  CategoryUsage,
  Entry,
  EntryPatch,
  ValueType,
  YearWorkspace
} from '../../../shared/section1/types.js'
import {
  MAX_CATEGORY_NAME_LENGTH,
  MAX_NOTE_LENGTH,
  VALUE_TYPES
} from '../../../shared/section1/types.js'
import { isMonth, isValidYear } from '../../../shared/calendar.js'
import { VaultDataError } from './errors.js'
import { yearExists } from './years.js'

/**
 * The year lifecycle, re-exported.
 *
 * Section 1 was where these lived and is where the rest of the app still looks
 * for them; moving the file without moving the import surface keeps Realisation
 * IV's refactor invisible to `section1-ipc.ts` and to the Realisation III
 * suites, which is how it stays reviewable as a move rather than a rewrite.
 */
export {
  accentAnchorYear,
  createYear,
  deleteYear,
  ensureAnyYear,
  isValidYear,
  listYears,
  setAccentOverride,
  yearExists,
  yearUsage
} from './years.js'

/** Thrown inside a transaction and turned into a Result by the IPC layer. */
export class Section1Error extends VaultDataError {
  constructor(code: string) {
    super(code)
    this.name = 'Section1Error'
  }
}

function fail(code: string): never {
  throw new Section1Error(code)
}

// --- Validation ------------------------------------------------------------

function cleanName(name: unknown): string {
  if (typeof name !== 'string') fail('INVALID_NAME')
  const trimmed = name.trim().replace(/\s+/g, ' ')
  if (trimmed.length === 0 || trimmed.length > MAX_CATEGORY_NAME_LENGTH) fail('INVALID_NAME')
  return trimmed
}

function cleanNote(note: unknown): string | null {
  if (note === null || note === undefined) return null
  if (typeof note !== 'string') fail('INTERNAL')
  const trimmed = note.trim()
  if (trimmed.length === 0) return null
  return trimmed.slice(0, MAX_NOTE_LENGTH)
}

function cleanValueType(valueType: unknown): ValueType {
  if (typeof valueType !== 'string' || !VALUE_TYPES.includes(valueType as ValueType)) {
    fail('INTERNAL')
  }
  return valueType as ValueType
}

function cleanKind(kind: unknown): CategoryKind {
  if (kind !== 'income' && kind !== 'expense') fail('INTERNAL')
  return kind
}

// --- Reading a workspace ---------------------------------------------------

/** The parent row, read for the accent the workspace paints itself with. */
interface YearRow {
  year: number
  accent_override: string | null
}

interface CategoryRow {
  id: number
  year: number
  name: string
  kind: string
  value_type: string
  position: number
}

interface EntryRow {
  category_id: number
  month: number
  amount: number
  is_refund: number
  note: string | null
}

export function readWorkspace(db: DatabaseType, year: number): YearWorkspace {
  if (!isValidYear(year)) fail('INVALID_YEAR')

  const yearRow = db.prepare('SELECT year, accent_override FROM years WHERE year = ?').get(year) as
    | YearRow
    | undefined
  if (!yearRow) fail('NO_SUCH_YEAR')

  // Income group first, then expenses, each by position — the order §6.2 draws
  // and the same order shared/section1/engine.ts:orderedCategories produces.
  // Sorting on `kind` alphabetically would put expenses first and leave the
  // repository and the engine disagreeing about what "first" means.
  const categoryRows = db
    .prepare(
      `SELECT id, year, name, kind, value_type, position
         FROM s1_categories WHERE year = ?
        ORDER BY CASE kind WHEN 'income' THEN 0 ELSE 1 END, position, id`
    )
    .all(year) as CategoryRow[]

  const categories: Category[] = categoryRows.map((row) => ({
    id: row.id,
    year: row.year,
    name: row.name,
    kind: row.kind as CategoryKind,
    valueType: row.value_type as ValueType,
    position: row.position
  }))

  const entryRows = db
    .prepare(
      `SELECT category_id, month, amount, is_refund, note
         FROM s1_entries WHERE year = ? ORDER BY month, category_id`
    )
    .all(year) as EntryRow[]

  const entries: Entry[] = entryRows.map((row) => ({
    categoryId: row.category_id,
    month: row.month,
    amount: row.amount,
    isRefund: row.is_refund === 1,
    note: row.note
  }))

  return { year, accentOverride: yearRow.accent_override, categories, entries }
}

// --- Column management -----------------------------------------------------

function nextPosition(db: DatabaseType, year: number, kind: CategoryKind): number {
  const row = db
    .prepare('SELECT COALESCE(MAX(position) + 1, 0) AS next FROM s1_categories WHERE year = ? AND kind = ?')
    .get(year, kind) as { next: number }
  return row.next
}

/** Duplicate names are refused before SQLite does it, so the reason survives. */
function assertNameFree(db: DatabaseType, year: number, name: string, exceptId?: number): void {
  const row = db
    .prepare('SELECT id FROM s1_categories WHERE year = ? AND name = ?')
    .get(year, name) as { id: number } | undefined
  if (row && row.id !== exceptId) fail('DUPLICATE_NAME')
}

export function addCategory(db: DatabaseType, year: number, draft: CategoryDraft): number {
  if (!isValidYear(year)) fail('INVALID_YEAR')
  const name = cleanName(draft.name)
  const kind = cleanKind(draft.kind)
  const valueType = cleanValueType(draft.valueType)

  const run = db.transaction(() => {
    if (!yearExists(db, year)) fail('NO_SUCH_YEAR')
    assertNameFree(db, year, name)
    const result = db
      .prepare(
        'INSERT INTO s1_categories (year, name, kind, value_type, position) VALUES (?, ?, ?, ?, ?)'
      )
      .run(year, name, kind, valueType, nextPosition(db, year, kind))
    return Number(result.lastInsertRowid)
  })

  return run()
}

function categoryOf(db: DatabaseType, id: number): CategoryRow {
  const row = db
    .prepare('SELECT id, year, name, kind, value_type, position FROM s1_categories WHERE id = ?')
    .get(id) as CategoryRow | undefined
  if (!row) fail('NO_SUCH_CATEGORY')
  return row
}

export function renameCategory(db: DatabaseType, id: number, name: unknown): void {
  const cleaned = cleanName(name)
  const run = db.transaction(() => {
    const category = categoryOf(db, id)
    assertNameFree(db, category.year, cleaned, id)
    db.prepare('UPDATE s1_categories SET name = ? WHERE id = ?').run(cleaned, id)
  })
  run()
}

/**
 * Retype a column.
 *
 * The stored amounts are untouched — they are integer hundredths whatever the
 * type says — so this changes which bucket the column is totalled into and how
 * it is rendered, and nothing else. Retyping a column of lira to dollars does
 * not convert anything, and no exchange rate exists anywhere in JADEITE.
 */
export function setCategoryValueType(db: DatabaseType, id: number, valueType: unknown): void {
  const cleaned = cleanValueType(valueType)
  categoryOf(db, id)
  db.prepare('UPDATE s1_categories SET value_type = ? WHERE id = ?').run(cleaned, id)
}

/**
 * Reorder one group of one year.
 *
 * The caller sends the group's ids in their new order; anything missing from
 * that list keeps its relative order after the ones supplied. Positions are
 * rewritten contiguously so the next insert cannot collide.
 */
export function reorderCategories(
  db: DatabaseType,
  year: number,
  kind: CategoryKind,
  orderedIds: readonly number[]
): void {
  if (!isValidYear(year)) fail('INVALID_YEAR')
  const cleanKindValue = cleanKind(kind)

  const run = db.transaction(() => {
    const current = db
      .prepare('SELECT id FROM s1_categories WHERE year = ? AND kind = ? ORDER BY position, id')
      .all(year, cleanKindValue) as { id: number }[]

    const known = new Set(current.map((r) => r.id))
    const ordered: number[] = []
    for (const id of orderedIds) {
      if (known.has(id) && !ordered.includes(id)) ordered.push(id)
    }
    for (const row of current) {
      if (!ordered.includes(row.id)) ordered.push(row.id)
    }

    const update = db.prepare('UPDATE s1_categories SET position = ? WHERE id = ?')
    ordered.forEach((id, index) => update.run(index, id))
  })

  run()
}

export function categoryUsage(db: DatabaseType, id: number): CategoryUsage {
  const category = categoryOf(db, id)
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n,
              COALESCE(SUM(CASE WHEN is_refund = 1 THEN -amount ELSE amount END), 0) AS total
         FROM s1_entries WHERE category_id = ?`
    )
    .get(id) as { n: number; total: number }

  return { entryCount: row.n, total: row.total, valueType: category.value_type as ValueType }
}

/**
 * Delete a column from one year.
 *
 * This is the destructive half of "retire". The other half is not inheriting a
 * column when the next year is created, which destroys nothing at all and is
 * the operation §6.2 actually describes. Deleting here removes only this year's
 * column row; the same category in earlier years is a different row with a
 * different id, and cannot be reached from this one.
 */
export function deleteCategory(db: DatabaseType, id: number): void {
  const run = db.transaction(() => {
    const category = categoryOf(db, id)
    // ON DELETE CASCADE takes this year's entries with it.
    db.prepare('DELETE FROM s1_categories WHERE id = ?').run(id)

    const survivors = db
      .prepare('SELECT id FROM s1_categories WHERE year = ? AND kind = ? ORDER BY position, id')
      .all(category.year, category.kind) as { id: number }[]
    const update = db.prepare('UPDATE s1_categories SET position = ? WHERE id = ?')
    survivors.forEach((row, index) => update.run(index, row.id))
  })
  run()
}

// --- Cells -----------------------------------------------------------------

/**
 * Write, or clear, one cell.
 *
 * A null amount deletes the row. It does not write a zero: an absent row means
 * "nothing here" and a stored zero means "this was zero", and those are two
 * different facts about a month. The note and the refund flag belong to the
 * row, so clearing the amount takes them with it — a note is a note about a
 * number, and there is no number left.
 */
export function setEntry(db: DatabaseType, patch: EntryPatch): void {
  if (!isValidYear(patch.year)) fail('INVALID_YEAR')
  if (!isMonth(patch.month)) fail('INTERNAL')

  const note = cleanNote(patch.note)

  const run = db.transaction(() => {
    const category = categoryOf(db, patch.categoryId)
    if (category.year !== patch.year) fail('NO_SUCH_CATEGORY')

    if (patch.amount === null) {
      db.prepare('DELETE FROM s1_entries WHERE year = ? AND month = ? AND category_id = ?').run(
        patch.year,
        patch.month,
        patch.categoryId
      )
      return
    }

    if (!Number.isSafeInteger(patch.amount) || patch.amount < 0) fail('INVALID_AMOUNT')

    db.prepare(
      `INSERT INTO s1_entries (year, month, category_id, amount, is_refund, note)
            VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (year, month, category_id) DO UPDATE SET
            amount = excluded.amount,
            is_refund = excluded.is_refund,
            note = excluded.note`
    ).run(
      patch.year,
      patch.month,
      patch.categoryId,
      patch.amount,
      patch.isRefund ? 1 : 0,
      note
    )
  })

  run()
}
