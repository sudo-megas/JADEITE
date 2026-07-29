/**
 * Section 2 storage — bank columns, their cells, and the rollover freeze.
 *
 * Everything here is a write against the encrypted database or a read out of
 * it. No arithmetic lives in this file: totals are computed by
 * shared/section2/engine.ts and stored nowhere (§5.3), so there is no cached
 * grand total that can fall out of step with the cells it claims to describe.
 *
 * One bank definition drives every appearance (§7.1). The source workbook kept
 * its bank list in two places and they had already diverged by the time it was
 * inspected; here there is one row per column per year, and every figure that
 * mentions a bank reads that row.
 *
 * The year lifecycle lives in db/years.ts, because `years` parents this
 * section's tables as well as Section 1's.
 */

import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'

import { isMonth, isValidYear } from '../../../shared/calendar.js'
import type { Bank, BankDraft, BankUsage, Cell, CellPatch, YearGrid } from '../../../shared/section2/types.js'
import { MAX_BANK_NAME_LENGTH, MAX_COUNTER_PARTY_LENGTH } from '../../../shared/section2/types.js'
import { VaultDataError } from './errors.js'

/** Thrown inside a transaction and turned into a Result by the IPC layer. */
export class Section2Error extends VaultDataError {
  constructor(code: string) {
    super(code)
    this.name = 'Section2Error'
  }
}

function fail(code: string): never {
  throw new Section2Error(code)
}

// --- Validation ------------------------------------------------------------

function cleanName(name: unknown): string {
  if (typeof name !== 'string') fail('INVALID_NAME')
  const trimmed = name.trim().replace(/\s+/g, ' ')
  if (trimmed.length === 0 || trimmed.length > MAX_BANK_NAME_LENGTH) fail('INVALID_NAME')
  return trimmed
}

/** A person's name, or nothing at all. Blank collapses to null, never to ''. */
function cleanParty(party: unknown): string | null {
  if (party === null || party === undefined) return null
  if (typeof party !== 'string') fail('INTERNAL')
  const trimmed = party.trim().replace(/\s+/g, ' ')
  if (trimmed.length === 0) return null
  return trimmed.slice(0, MAX_COUNTER_PARTY_LENGTH)
}

function cleanLimit(limit: unknown): number {
  if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 0) fail('INVALID_LIMIT')
  return limit
}

// --- Rows ------------------------------------------------------------------

interface BankRow {
  id: number
  year: number
  name: string
  credit_limit: number
  position: number
  is_counter: number
  counter_party: string | null
}

interface CellRow {
  bank_id: number
  month: number
  amount: number
}

function toBank(row: BankRow): Bank {
  return {
    id: row.id,
    year: row.year,
    name: row.name,
    creditLimit: row.credit_limit,
    position: row.position,
    isCounter: row.is_counter === 1,
    counterParty: row.counter_party
  }
}

function bankOf(db: DatabaseType, id: number): BankRow {
  const row = db
    .prepare(
      'SELECT id, year, name, credit_limit, position, is_counter, counter_party FROM s2_banks WHERE id = ?'
    )
    .get(id) as BankRow | undefined
  if (!row) fail('NO_SUCH_BANK')
  return row
}

/**
 * A frozen year answers every question and accepts no change (§7.3).
 *
 * Checked inside the transaction that is about to write rather than at the IPC
 * edge: freezing is a state, and a state read outside the write it guards is a
 * race with whatever else the owner has open. It doubles as the year-exists
 * check, so a mutation against a year that is not there fails as NO_SUCH_YEAR
 * rather than silently writing nothing.
 */
function assertOpen(db: DatabaseType, year: number): void {
  const row = db.prepare('SELECT s2_archived FROM years WHERE year = ?').get(year) as
    | { s2_archived: number }
    | undefined
  if (!row) fail('NO_SUCH_YEAR')
  if (row.s2_archived === 1) fail('ARCHIVED')
}

// --- Reading a grid --------------------------------------------------------

export function readGrid(db: DatabaseType, year: number): YearGrid {
  if (!isValidYear(year)) fail('INVALID_YEAR')

  const yearRow = db
    .prepare('SELECT accent_override, s2_archived FROM years WHERE year = ?')
    .get(year) as { accent_override: string | null; s2_archived: number } | undefined
  if (!yearRow) fail('NO_SUCH_YEAR')

  // Banks first, then counter columns, each by position — the order §7.1 draws
  // and the same order shared/section2/engine.ts:orderedBanks produces. The two
  // must agree or the grid and the engine disagree about what "first" means.
  const bankRows = db
    .prepare(
      `SELECT id, year, name, credit_limit, position, is_counter, counter_party
         FROM s2_banks WHERE year = ?
        ORDER BY is_counter, position, id`
    )
    .all(year) as BankRow[]

  const cellRows = db
    .prepare(
      `SELECT bank_id, month, amount
         FROM s2_cells WHERE year = ? ORDER BY month, bank_id`
    )
    .all(year) as CellRow[]

  const cells: Cell[] = cellRows.map((row) => ({
    bankId: row.bank_id,
    month: row.month,
    amount: row.amount
  }))

  return {
    year,
    archived: yearRow.s2_archived === 1,
    accentOverride: yearRow.accent_override,
    banks: bankRows.map(toBank),
    cells
  }
}

// --- Column management -----------------------------------------------------

function nextPosition(db: DatabaseType, year: number, isCounter: boolean): number {
  const row = db
    .prepare(
      'SELECT COALESCE(MAX(position) + 1, 0) AS next FROM s2_banks WHERE year = ? AND is_counter = ?'
    )
    .get(year, isCounter ? 1 : 0) as { next: number }
  return row.next
}

/** Duplicate names are refused before SQLite does it, so the reason survives. */
function assertNameFree(db: DatabaseType, year: number, name: string, exceptId?: number): void {
  const row = db.prepare('SELECT id FROM s2_banks WHERE year = ? AND name = ?').get(year, name) as
    | { id: number }
    | undefined
  if (row && row.id !== exceptId) fail('DUPLICATE_NAME')
}

/**
 * Add a column.
 *
 * A counter column is stored with no limit and a person; a bank is stored with
 * a limit and no person. Both are forced here rather than trusted, so a stray
 * limit on a counter cannot quietly join the total credit limit, and a person
 * attached to a card cannot appear in a header that is meant to show money.
 */
export function addBank(db: DatabaseType, year: number, draft: BankDraft): number {
  if (!isValidYear(year)) fail('INVALID_YEAR')
  const name = cleanName(draft.name)
  const isCounter = draft.isCounter === true
  const creditLimit = isCounter ? 0 : cleanLimit(draft.creditLimit)
  const counterParty = isCounter ? cleanParty(draft.counterParty) : null

  const run = db.transaction(() => {
    assertOpen(db, year)
    assertNameFree(db, year, name)
    const result = db
      .prepare(
        `INSERT INTO s2_banks (year, name, credit_limit, position, is_counter, counter_party)
              VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(year, name, creditLimit, nextPosition(db, year, isCounter), isCounter ? 1 : 0, counterParty)
    return Number(result.lastInsertRowid)
  })

  return run()
}

export function renameBank(db: DatabaseType, id: number, name: unknown): void {
  const cleaned = cleanName(name)
  const run = db.transaction(() => {
    const bank = bankOf(db, id)
    assertOpen(db, bank.year)
    assertNameFree(db, bank.year, cleaned, id)
    db.prepare('UPDATE s2_banks SET name = ? WHERE id = ?').run(cleaned, id)
  })
  run()
}

/**
 * Set a card's credit limit.
 *
 * Refused for a counter column: §7.1 puts the person where a bank keeps its
 * limit, so a counter has nowhere to state one. That is a shape the interface
 * never offers, which is why it is INTERNAL rather than a code the owner could
 * be shown.
 */
export function setCreditLimit(db: DatabaseType, id: number, limit: unknown): void {
  const cleaned = cleanLimit(limit)
  const run = db.transaction(() => {
    const bank = bankOf(db, id)
    assertOpen(db, bank.year)
    if (bank.is_counter === 1) fail('INTERNAL')
    db.prepare('UPDATE s2_banks SET credit_limit = ? WHERE id = ?').run(cleaned, id)
  })
  run()
}

/** Set the person a counter column belongs to. Refused for a real bank. */
export function setCounterParty(db: DatabaseType, id: number, party: unknown): void {
  const cleaned = cleanParty(party)
  const run = db.transaction(() => {
    const bank = bankOf(db, id)
    assertOpen(db, bank.year)
    if (bank.is_counter === 0) fail('INTERNAL')
    db.prepare('UPDATE s2_banks SET counter_party = ? WHERE id = ?').run(cleaned, id)
  })
  run()
}

/**
 * Rewrite one side's order.
 *
 * Tolerant of an incomplete list, like Section 1's: unknown ids are dropped,
 * duplicates are dropped, and anything the caller omitted keeps its existing
 * relative order at the end. Positions are then rewritten contiguously, so a
 * reorder can never leave a gap for a later read to guess about.
 */
export function reorderBanks(
  db: DatabaseType,
  year: number,
  isCounter: boolean,
  orderedIds: readonly number[]
): void {
  if (!isValidYear(year)) fail('INVALID_YEAR')

  const run = db.transaction(() => {
    assertOpen(db, year)

    const existing = db
      .prepare('SELECT id FROM s2_banks WHERE year = ? AND is_counter = ? ORDER BY position, id')
      .all(year, isCounter ? 1 : 0) as { id: number }[]
    const present = new Set(existing.map((row) => row.id))

    const seen = new Set<number>()
    const order: number[] = []
    for (const id of orderedIds) {
      if (!present.has(id) || seen.has(id)) continue
      seen.add(id)
      order.push(id)
    }
    for (const row of existing) if (!seen.has(row.id)) order.push(row.id)

    const update = db.prepare('UPDATE s2_banks SET position = ? WHERE id = ?')
    order.forEach((id, index) => update.run(index, id))
  })

  run()
}

/** What deleting a column would destroy, asked for before the offer is made. */
export function bankUsage(db: DatabaseType, id: number): BankUsage {
  const bank = bankOf(db, id)
  const row = db
    .prepare('SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM s2_cells WHERE bank_id = ?')
    .get(id) as { n: number; total: number }

  return { cellCount: row.n, total: row.total, isCounter: bank.is_counter === 1 }
}

/**
 * Delete a column from one year.
 *
 * Only this year's column row goes; the same bank in another year is a
 * different row with a different id and cannot be reached from this one. That
 * is what makes a year's grid a record of that year rather than a view onto a
 * single mutable list — the defect the source workbook's duplicated bank list
 * produced.
 */
export function deleteBank(db: DatabaseType, id: number): void {
  const run = db.transaction(() => {
    const bank = bankOf(db, id)
    assertOpen(db, bank.year)

    // ON DELETE CASCADE takes this column's cells with it.
    db.prepare('DELETE FROM s2_banks WHERE id = ?').run(id)

    const survivors = db
      .prepare('SELECT id FROM s2_banks WHERE year = ? AND is_counter = ? ORDER BY position, id')
      .all(bank.year, bank.is_counter) as { id: number }[]
    const update = db.prepare('UPDATE s2_banks SET position = ? WHERE id = ?')
    survivors.forEach((row, index) => update.run(index, row.id))
  })
  run()
}

// --- Cells -----------------------------------------------------------------

/**
 * Write, or clear, one cell.
 *
 * A null amount deletes the row. It does not write a zero: an absent row means
 * "nothing due this month" and a stored zero means "this month's instalment is
 * zero", and those are two different facts about a card.
 */
export function setCell(db: DatabaseType, patch: CellPatch): void {
  if (!isValidYear(patch.year)) fail('INVALID_YEAR')
  if (!isMonth(patch.month)) fail('INTERNAL')

  const run = db.transaction(() => {
    assertOpen(db, patch.year)

    const bank = bankOf(db, patch.bankId)
    // Both parents are named on the row, so neither may be taken on trust.
    if (bank.year !== patch.year) fail('NO_SUCH_BANK')

    if (patch.amount === null) {
      db.prepare('DELETE FROM s2_cells WHERE year = ? AND month = ? AND bank_id = ?').run(
        patch.year,
        patch.month,
        patch.bankId
      )
      return
    }

    if (!Number.isSafeInteger(patch.amount) || patch.amount < 0) fail('INVALID_AMOUNT')

    db.prepare(
      `INSERT INTO s2_cells (year, month, bank_id, amount)
            VALUES (?, ?, ?, ?)
       ON CONFLICT (year, month, bank_id) DO UPDATE SET
            amount = excluded.amount`
    ).run(patch.year, patch.month, patch.bankId, patch.amount)
  })

  run()
}

// --- The rollover freeze (§7.3) --------------------------------------------

export function isArchived(db: DatabaseType, year: number): boolean {
  if (!isValidYear(year)) fail('INVALID_YEAR')
  const row = db.prepare('SELECT s2_archived FROM years WHERE year = ?').get(year) as
    | { s2_archived: number }
    | undefined
  if (!row) fail('NO_SUCH_YEAR')
  return row.s2_archived === 1
}

/**
 * Freeze a year's grid, or reopen it.
 *
 * §7.3 asks for a read-only archive so that "nothing is destroyed by January
 * anymore". It is set here by a deliberate act rather than as a side effect of
 * creating the next year: the owner who adds 2027's workspace in October has
 * not finished with November. Reopening is the same switch the other way, so
 * neither direction needs a frightening confirmation — nothing is lost either
 * way, which is the point of freezing rather than deleting.
 *
 * `assertOpen` is deliberately not called: this is the one operation that has
 * to work on an archived year.
 */
export function setArchived(db: DatabaseType, year: number, archived: boolean): void {
  if (!isValidYear(year)) fail('INVALID_YEAR')
  const run = db.transaction(() => {
    const row = db.prepare('SELECT 1 AS present FROM years WHERE year = ?').get(year)
    if (!row) fail('NO_SUCH_YEAR')
    db.prepare('UPDATE years SET s2_archived = ? WHERE year = ?').run(archived ? 1 : 0, year)
  })
  run()
}
