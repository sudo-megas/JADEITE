/**
 * Section 1 storage — year workspaces, their column sets, and their cells.
 *
 * Everything here is a write against the encrypted database or a read out of
 * it. No arithmetic lives in this file: totals are computed by
 * shared/section1/engine.ts and stored nowhere (§5.3), so there is no cached
 * sum that can fall out of step with the rows it claims to describe.
 *
 * Two invariants are the reason most of these functions are transactions:
 *
 *   - positions are contiguous from zero within a (year, kind) group, so a
 *     reorder cannot leave a gap that later reads have to guess about;
 *   - a year's rows are created together with the year, so a workspace never
 *     half-exists.
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
  YearUsage,
  YearWorkspace
} from '../../../shared/section1/types.js'
import {
  MAX_CATEGORY_NAME_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_YEAR,
  MIN_YEAR,
  VALUE_TYPES,
  isMonth
} from '../../../shared/section1/types.js'
import { SETTING_KEYS } from '../../../shared/ipc-contract.js'
import { getSetting, setSetting } from './settings.js'

/** Thrown inside a transaction and turned into a Result by the IPC layer. */
export class Section1Error extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'Section1Error'
  }
}

function fail(code: string): never {
  throw new Section1Error(code)
}

// --- Validation ------------------------------------------------------------

export function isValidYear(year: unknown): year is number {
  return typeof year === 'number' && Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR
}

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

// --- Years -----------------------------------------------------------------

interface YearRow {
  year: number
  accent_override: string | null
}

export function listYears(db: DatabaseType): number[] {
  const rows = db.prepare('SELECT year FROM years ORDER BY year ASC').all() as { year: number }[]
  return rows.map((r) => r.year)
}

export function yearExists(db: DatabaseType, year: number): boolean {
  const row = db.prepare('SELECT 1 AS present FROM years WHERE year = ?').get(year)
  return row !== undefined
}

/**
 * The accent anchor — the year the palette's accent sequence starts counting
 * from (§12.3).
 *
 * It is written once and never recomputed. Deriving it from the earliest year
 * present would make every year's colour a function of the whole dataset, so
 * back-filling one older year would repaint every workspace the owner had
 * already learnt to recognise. The accent is how a year is known at a glance;
 * it does not get to move.
 */
export function accentAnchorYear(db: DatabaseType): number {
  const stored = getSetting(db, SETTING_KEYS.accentAnchorYear)
  const parsed = stored === null ? NaN : Number.parseInt(stored, 10)
  if (isValidYear(parsed)) return parsed

  // Absent only for a vault that predates Realisation III. Repaired once, to a
  // fixed value, and then treated as frozen like any other anchor.
  const years = listYears(db)
  const repaired = years[0] ?? new Date().getFullYear()
  setSetting(db, SETTING_KEYS.accentAnchorYear, String(repaired))
  return repaired
}

/**
 * Create a year, inheriting the previous year's columns as a starting point.
 *
 * "Previous" is strictly backwards: the donor is the newest year older than
 * this one. A year created before every existing year inherits nothing, because
 * borrowing forwards would furnish a historical workspace with categories the
 * owner had not invented yet. Columns are copied; amounts never are.
 */
export function createYear(db: DatabaseType, year: number): void {
  if (!isValidYear(year)) fail('INVALID_YEAR')

  const run = db.transaction(() => {
    if (yearExists(db, year)) fail('YEAR_EXISTS')

    db.prepare('INSERT INTO years (year, created_at) VALUES (?, ?)').run(
      year,
      new Date().toISOString()
    )

    const donor = db
      .prepare('SELECT year FROM years WHERE year < ? ORDER BY year DESC LIMIT 1')
      .get(year) as { year: number } | undefined

    if (donor) {
      db.prepare(
        `INSERT INTO s1_categories (year, name, kind, value_type, position)
           SELECT ?, name, kind, value_type, position
             FROM s1_categories WHERE year = ?
            ORDER BY kind, position`
      ).run(year, donor.year)
    }

    // The anchor belongs to the first year this vault ever had.
    if (getSetting(db, SETTING_KEYS.accentAnchorYear) === null) {
      setSetting(db, SETTING_KEYS.accentAnchorYear, String(year))
    }
  })

  run()
}

/**
 * The year a fresh vault opens on.
 *
 * The system clock is read for the year number. That is not OS-locale
 * detection: §13 prohibits taking the *language* or the formatting conventions
 * from the machine, and the vault already timestamps every row it writes.
 */
export function ensureAnyYear(db: DatabaseType): number {
  const existing = listYears(db)
  const first = existing[0]
  if (first !== undefined) return first

  const currentYear = new Date().getFullYear()
  createYear(db, currentYear)
  return currentYear
}

/** What deleting a year would destroy, asked for before the offer is made. */
export function yearUsage(db: DatabaseType, year: number): YearUsage {
  if (!isValidYear(year)) fail('INVALID_YEAR')
  if (!yearExists(db, year)) fail('NO_SUCH_YEAR')

  const categories = db
    .prepare('SELECT COUNT(*) AS n FROM s1_categories WHERE year = ?')
    .get(year) as { n: number }
  const entries = db
    .prepare('SELECT COUNT(*) AS n FROM s1_entries WHERE year = ?')
    .get(year) as { n: number }

  return { categoryCount: categories.n, entryCount: entries.n }
}

/**
 * Delete a year and everything in it.
 *
 * "Everything" is broader than Section 1: `years` is the parent of `s2_banks`
 * and `s2_cells` too (schema.ts), so from Realisation IV onward this also
 * removes that year's Payments grid. The confirmation says so — a dialogue that
 * named only columns would be describing half of what it does.
 *
 * The last remaining year is refused. The switcher has to have somewhere to be,
 * and a vault with no years would meet the owner with a modal instead of a grid.
 *
 * The accent anchor is a settings row and is deliberately untouched: deleting
 * and recreating a year gives it back the colour it had.
 */
export function deleteYear(db: DatabaseType, year: number): void {
  if (!isValidYear(year)) fail('INVALID_YEAR')

  const run = db.transaction(() => {
    if (!yearExists(db, year)) fail('NO_SUCH_YEAR')
    if (listYears(db).length <= 1) fail('LAST_YEAR')
    db.prepare('DELETE FROM years WHERE year = ?').run(year)
  })

  run()
}

/** The manual per-year accent override of §12.3, or null for the sequence value. */
export function setAccentOverride(db: DatabaseType, year: number, accent: string | null): void {
  if (!isValidYear(year)) fail('INVALID_YEAR')
  if (!yearExists(db, year)) fail('NO_SUCH_YEAR')

  // Only a palette-shaped token is accepted. The renderer paints this straight
  // into a custom property, so anything else would be a stylesheet injection
  // with extra steps.
  const cleaned =
    accent === null || accent.trim().length === 0
      ? null
      : /^#[0-9a-fA-F]{3,8}$/.test(accent.trim())
        ? accent.trim()
        : fail('INTERNAL')

  db.prepare('UPDATE years SET accent_override = ? WHERE year = ?').run(cleaned, year)
}

// --- Reading a workspace ---------------------------------------------------

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
