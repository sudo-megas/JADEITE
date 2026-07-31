/**
 * Section 4 storage — the scratchpad's boxes.
 *
 * Everything here is a write against the encrypted database or a read out of it.
 * The three statistics live in shared/section4/engine.ts and are stored nowhere
 * (§5.3): a scratchpad whose total was a stored column would be the spreadsheet
 * this application replaces, in miniature.
 *
 * The table is sparse (schema.ts, v4), and that decides the shape of everything
 * below. An untouched box has no row, so emptying one is a delete rather than a
 * write of null; there is no `value IS NULL` branch anywhere here, and a grid of
 * a thousand boxes with nine figures in it costs nine rows. It also means
 * emptying a box that was already empty is not a failure — the row that was
 * asked for is gone either way, which is why nothing in this file has an
 * equivalent of the old `NO_SUCH_LINE`.
 *
 * One statement apiece, so none of these opens a transaction: the upsert is
 * atomic in SQLite by itself, and there is no read-then-write here to protect.
 *
 * There is no year and no person here. §9 is deliberately unfancy, and so is this.
 */

import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'

import type { Cell, CellPatch } from '../../../shared/section4/types.js'
import { COLUMNS, MAX_ROWS } from '../../../shared/section4/types.js'
import { VaultDataError } from './errors.js'

/** Thrown inside a transaction and turned into a Result by the IPC layer. */
export class Section4Error extends VaultDataError {
  constructor(code: string) {
    super(code)
    this.name = 'Section4Error'
  }
}

function fail(code: string): never {
  throw new Section4Error(code)
}

// --- Validation ------------------------------------------------------------

/** One past the last box the grid can ever draw. */
const SLOT_LIMIT = COLUMNS * MAX_ROWS

/**
 * A box number.
 *
 * Bounded above as well as below, which the SQL cannot do for us: `slot` is a
 * primary key with a `CHECK (slot >= 0)` and no ceiling, so a renderer asking to
 * write box nine million would be obliged and the row would sit there for ever,
 * counted in every total and reachable from no screen. The grid draws at most
 * `MAX_ROWS` rows of `COLUMNS`, so that is where the slots stop.
 */
function cleanSlot(slot: unknown): number {
  if (typeof slot !== 'number' || !Number.isSafeInteger(slot) || slot < 0 || slot >= SLOT_LIMIT) {
    fail('INVALID_SLOT')
  }
  return slot
}

/**
 * Integer hundredths.
 *
 * Non-negative, because figures reach this section through the same parser as
 * every other figure in the app and that parser refuses a leading minus (§5.2).
 * Clearing a box is a null on the patch and never reaches here.
 */
function cleanValue(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    fail('INVALID_VALUE')
  }
  return value
}

// --- Rows ------------------------------------------------------------------

export function readCells(db: DatabaseType): Cell[] {
  return db.prepare('SELECT slot, value FROM s4_cells ORDER BY slot').all() as Cell[]
}

/**
 * Write one box, or empty it.
 *
 * An upsert rather than an update-or-insert pair: the grid sends the same write
 * whether the box has been used before or not, and asking the database which
 * case it is would be a read the statement itself already performs.
 */
export function setCell(db: DatabaseType, patch: CellPatch): void {
  const slot = cleanSlot(patch.slot)

  if (patch.value === null) {
    db.prepare('DELETE FROM s4_cells WHERE slot = ?').run(slot)
    return
  }

  db.prepare(
    `INSERT INTO s4_cells (slot, value) VALUES (?, ?)
       ON CONFLICT (slot) DO UPDATE SET value = excluded.value`
  ).run(slot, cleanValue(patch.value))
}

/**
 * Empty every box.
 *
 * The scratchpad is the one place in this application where wiping everything is
 * an ordinary act rather than a destruction: §9 is where a month's arithmetic is
 * done and then done with. It is still behind a confirmation in the interface —
 * the two-click one the ledger uses, not a dialogue (§6.4 forbids one on the
 * common path, and this is a near-common path).
 */
export function clearCells(db: DatabaseType): void {
  db.prepare('DELETE FROM s4_cells').run()
}
