/**
 * Section 2 storage — bank columns and their cells.
 *
 * Everything here is a write against the encrypted database or a read out of
 * it. No arithmetic lives in this file: totals are computed by
 * shared/section2/engine.ts and stored nowhere (§5.3), so there is no cached
 * grand total that can fall out of step with the cells it claims to describe.
 *
 * One bank definition drives every appearance (§7.1). The source workbook kept
 * its bank list in two places and they had already diverged by the time it was
 * inspected; here there is one row per column, and every figure that mentions a
 * bank reads that row.
 *
 * **There is no year here** (§7.1, §7.3 as amended by point revision v0.8b).
 * Section 2 is one standing grid of the twelve months the owner is living in,
 * because the owner does not log previous years' bank debts. With the year went
 * the rollover freeze, the archive, and every `year` predicate that used to
 * appear in the statements below. `years` is Section 1's table now, and
 * db/years.ts no longer touches this section's rows.
 */

import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'

import { isMonth } from '../../../shared/calendar.js'
import type {
  Bank,
  BankDraft,
  BankUsage,
  Cell,
  CellPatch,
  PaymentsGrid
} from '../../../shared/section2/types.js'
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
      'SELECT id, name, credit_limit, position, is_counter, counter_party FROM s2_banks WHERE id = ?'
    )
    .get(id) as BankRow | undefined
  if (!row) fail('NO_SUCH_BANK')
  return row
}

// --- Reading the grid ------------------------------------------------------

export function readGrid(db: DatabaseType): PaymentsGrid {
  // Banks first, then counter columns, each by position — the order §7.1 draws
  // and the same order shared/section2/engine.ts:orderedBanks produces. The two
  // must agree or the grid and the engine disagree about what "first" means.
  const bankRows = db
    .prepare(
      `SELECT id, name, credit_limit, position, is_counter, counter_party
         FROM s2_banks
        ORDER BY is_counter, position, id`
    )
    .all() as BankRow[]

  const cellRows = db
    .prepare('SELECT bank_id, month, amount FROM s2_cells ORDER BY month, bank_id')
    .all() as CellRow[]

  const cells: Cell[] = cellRows.map((row) => ({
    bankId: row.bank_id,
    month: row.month,
    amount: row.amount
  }))

  return { banks: bankRows.map(toBank), cells }
}

// --- Column management -----------------------------------------------------

function nextPosition(db: DatabaseType, isCounter: boolean): number {
  const row = db
    .prepare('SELECT COALESCE(MAX(position) + 1, 0) AS next FROM s2_banks WHERE is_counter = ?')
    .get(isCounter ? 1 : 0) as { next: number }
  return row.next
}

/**
 * Duplicate names are refused before SQLite does it, so the reason survives.
 *
 * Never scoped to `is_counter`: a counter column called "Banka A" beside a card
 * called "Banka A" would put one name in two header rows meaning two things.
 * That was true when the check also carried a year, and the v4 migration's
 * `UNIQUE (name)` relies on its having been true.
 */
function assertNameFree(db: DatabaseType, name: string, exceptId?: number): void {
  const row = db.prepare('SELECT id FROM s2_banks WHERE name = ?').get(name) as
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
export function addBank(db: DatabaseType, draft: BankDraft): number {
  const name = cleanName(draft.name)
  const isCounter = draft.isCounter === true
  const creditLimit = isCounter ? 0 : cleanLimit(draft.creditLimit)
  const counterParty = isCounter ? cleanParty(draft.counterParty) : null

  const run = db.transaction(() => {
    assertNameFree(db, name)
    const result = db
      .prepare(
        `INSERT INTO s2_banks (name, credit_limit, position, is_counter, counter_party)
              VALUES (?, ?, ?, ?, ?)`
      )
      .run(name, creditLimit, nextPosition(db, isCounter), isCounter ? 1 : 0, counterParty)
    return Number(result.lastInsertRowid)
  })

  return run()
}

export function renameBank(db: DatabaseType, id: number, name: unknown): void {
  const cleaned = cleanName(name)
  const run = db.transaction(() => {
    bankOf(db, id)
    assertNameFree(db, cleaned, id)
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
  isCounter: boolean,
  orderedIds: readonly number[]
): void {
  const run = db.transaction(() => {
    const existing = db
      .prepare('SELECT id FROM s2_banks WHERE is_counter = ? ORDER BY position, id')
      .all(isCounter ? 1 : 0) as { id: number }[]
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

/** Delete a column, and with it the twelve cells that hung off it. */
export function deleteBank(db: DatabaseType, id: number): void {
  const run = db.transaction(() => {
    const bank = bankOf(db, id)

    // ON DELETE CASCADE takes this column's cells with it.
    db.prepare('DELETE FROM s2_banks WHERE id = ?').run(id)

    const survivors = db
      .prepare('SELECT id FROM s2_banks WHERE is_counter = ? ORDER BY position, id')
      .all(bank.is_counter) as { id: number }[]
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
  if (!isMonth(patch.month)) fail('INVALID_MONTH')

  const run = db.transaction(() => {
    // The column is named on the row, so it may not be taken on trust.
    bankOf(db, patch.bankId)

    if (patch.amount === null) {
      db.prepare('DELETE FROM s2_cells WHERE month = ? AND bank_id = ?').run(
        patch.month,
        patch.bankId
      )
      return
    }

    if (!Number.isSafeInteger(patch.amount) || patch.amount < 0) fail('INVALID_AMOUNT')

    db.prepare(
      `INSERT INTO s2_cells (month, bank_id, amount)
            VALUES (?, ?, ?)
       ON CONFLICT (month, bank_id) DO UPDATE SET
            amount = excluded.amount`
    ).run(patch.month, patch.bankId, patch.amount)
  })

  run()
}
