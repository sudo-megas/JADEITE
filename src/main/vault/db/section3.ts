/**
 * Section 3 storage — persons, the ledger, and the owner's own prices.
 *
 * Everything here is a write against the encrypted database or a read out of it.
 * No arithmetic lives in this file: holdings, cost basis, market value and gain
 * are computed by shared/section3/engine.ts and stored nowhere (§5.3), so there
 * is no cached holding that can fall out of step with the rows it claims to
 * describe. That is the whole defect this section exists to retire — a ledger and
 * a chart deck, each maintained by hand, disagreeing about a kilogram of gold.
 *
 * There is no year lifecycle here and no reference to `years`. A valuables ledger
 * is a lifetime (see shared/section3/types.ts), so unlike Sections 1 and 2 this
 * module has no notion of a workspace to scope a query to.
 */

import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'

import { MAX_YEAR, MIN_YEAR } from '../../../shared/calendar.js'
import { MAX_QUANTITY, MAX_UNIT_PRICE } from '../../../shared/section3/units.js'
import type {
  Direction,
  LedgerData,
  ManualPrice,
  Person,
  PersonDraft,
  PersonUsage,
  QuantityUnit,
  Transaction,
  TransactionDraft,
  TransactionPatch,
  TypeCode,
  ValuableType
} from '../../../shared/section3/types.js'
import {
  MAX_NOTE_LENGTH,
  MAX_PERSON_NAME_LENGTH,
  MAX_SOURCE_LENGTH
} from '../../../shared/section3/types.js'
import { VaultDataError } from './errors.js'
import { readLastFetch, readLivePrices } from './prices.js'

/** Thrown inside a transaction and turned into a Result by the IPC layer. */
export class Section3Error extends VaultDataError {
  constructor(code: string) {
    super(code)
    this.name = 'Section3Error'
  }
}

function fail(code: string): never {
  throw new Section3Error(code)
}

// --- Validation ------------------------------------------------------------

function cleanName(name: unknown): string {
  if (typeof name !== 'string') fail('INVALID_NAME')
  const trimmed = name.trim().replace(/\s+/g, ' ')
  if (trimmed.length === 0 || trimmed.length > MAX_PERSON_NAME_LENGTH) fail('INVALID_NAME')
  return trimmed
}

/**
 * A person's colour dot is an **accent slot**, not a colour.
 *
 * Stored as a decimal string naming a position in the active palette's accent
 * sequence, exactly as a year's accent is chosen (§12.3), and resolved against
 * whichever palette is in force when it is drawn. So a person's dot harmonises
 * with all ten palettes instead of being a literal that looks considered in one
 * and wrong in the other nine — and no colour value exists anywhere near this
 * table for `audit-colours.mjs` to refuse.
 *
 * Null means "take the slot from the person's position", which is what every
 * person gets until the owner chooses otherwise.
 */
function cleanColour(colour: unknown): string | null {
  if (colour === null || colour === undefined) return null
  if (typeof colour === 'number') {
    if (!Number.isSafeInteger(colour) || colour < 0) fail('INTERNAL')
    return String(colour)
  }
  if (typeof colour !== 'string') fail('INTERNAL')
  const trimmed = colour.trim()
  if (trimmed.length === 0) return null
  if (!/^\d{1,4}$/.test(trimmed)) fail('INTERNAL')
  return String(Number(trimmed))
}

/**
 * An ISO-8601 calendar date that exists.
 *
 * The shape check alone would accept 2026-02-31, so the parsed date is compared
 * back against what was typed: anything the calendar rewrites was not a date.
 * The year bounds are the shared calendar's, so all three sections agree on what
 * a plausible year is — a floor against a mistyped century, not a guess at the
 * owner's history.
 */
function cleanDate(date: unknown): string {
  if (typeof date !== 'string') fail('INVALID_DATE')
  const trimmed = date.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) fail('INVALID_DATE')

  const [year, month, day] = trimmed.split('-').map(Number) as [number, number, number]
  if (year < MIN_YEAR || year > MAX_YEAR) fail('INVALID_DATE')

  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    fail('INVALID_DATE')
  }

  return trimmed
}

/**
 * A denomination and a count, checked against the product they will generate.
 *
 * `quantity` is a generated column (schema v2), so the bound that used to sit on
 * it is now unenforceable at the column — SQLite will happily generate a product
 * larger than `MAX_QUANTITY` from two individually legal factors. `MAX_QUANTITY`
 * exists so that quantity × price stays an exact integer (`units.ts`), and that
 * reason survives the migration unchanged, so the bound is checked here on the
 * product rather than on either factor.
 *
 * Both factors carry `> 0` CHECK constraints of their own; refused here too, so
 * the failure arrives as a code the interface can name rather than as a
 * constraint violation.
 */
function cleanDenomination(denomination: unknown, count: unknown): [number, number] {
  if (typeof denomination !== 'number' || !Number.isSafeInteger(denomination)) {
    fail('INVALID_QUANTITY')
  }
  if (typeof count !== 'number' || !Number.isSafeInteger(count)) fail('INVALID_QUANTITY')
  if (denomination <= 0 || count <= 0) fail('INVALID_QUANTITY')
  // Checked before multiplying, so an absurd pair cannot overflow on the way to
  // being rejected for overflowing.
  if (denomination > MAX_QUANTITY || count > MAX_QUANTITY) fail('INVALID_QUANTITY')
  if (denomination * count > MAX_QUANTITY) fail('INVALID_QUANTITY')
  return [denomination, count]
}

function cleanPrice(price: unknown): number {
  if (typeof price !== 'number' || !Number.isSafeInteger(price)) fail('INVALID_PRICE')
  if (price < 0 || price > MAX_UNIT_PRICE) fail('INVALID_PRICE')
  return price
}

function cleanDirection(direction: unknown): Direction {
  if (direction !== 'acquire' && direction !== 'dispose') fail('INTERNAL')
  return direction
}

/** Free text, trimmed. Blank collapses to null, never to an empty string. */
function cleanText(value: unknown, limit: number): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') fail('INTERNAL')
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  return trimmed.slice(0, limit)
}

/** The closed list is seeded (§8.2); a code outside it names nothing. */
function assertType(db: DatabaseType, code: unknown): TypeCode {
  if (typeof code !== 'string') fail('NO_SUCH_TYPE')
  const row = db.prepare('SELECT code FROM valuable_types WHERE code = ?').get(code) as
    | { code: string }
    | undefined
  if (!row) fail('NO_SUCH_TYPE')
  return row.code as TypeCode
}

// --- Rows ------------------------------------------------------------------

interface PersonRow {
  id: number
  name: string
  colour: string | null
  is_builtin: number
  position: number
}

function toPerson(row: PersonRow): Person {
  return {
    id: row.id,
    name: row.name,
    colour: row.colour,
    isBuiltin: row.is_builtin === 1,
    position: row.position
  }
}

interface TransactionRow {
  seq: number
  date: string
  date_provisional: number
  type_code: string
  direction: string
  denomination: number
  piece_count: number
  /** Generated by SQLite as `denomination × piece_count`; never written. */
  quantity: number
  unit_price: number
  source: string | null
  person_id: number | null
  note: string | null
}

function toTransaction(row: TransactionRow): Transaction {
  return {
    seq: row.seq,
    date: row.date,
    dateProvisional: row.date_provisional === 1,
    typeCode: row.type_code as TypeCode,
    direction: row.direction as Direction,
    denomination: row.denomination,
    count: row.piece_count,
    // Read back from the generated column rather than multiplied here, so the
    // figure the renderer sees is the one the database computed. Two
    // multiplications would be two places for the rule to live (§4.1).
    quantity: row.quantity,
    unitPrice: row.unit_price,
    source: row.source,
    personId: row.person_id,
    note: row.note
  }
}

function personRow(db: DatabaseType, id: number): PersonRow {
  const row = db
    .prepare('SELECT id, name, colour, is_builtin, position FROM persons WHERE id = ?')
    .get(id) as PersonRow | undefined
  if (!row) fail('NO_SUCH_PERSON')
  return row
}

/**
 * The person an unattributed row is written to (§8.1).
 *
 * Resolved on write rather than left null, so the stored row always names an
 * owner and the engine's fallback is a safety net rather than the normal path.
 */
function ortakId(db: DatabaseType): number {
  const row = db
    .prepare('SELECT id FROM persons WHERE is_builtin = 1 ORDER BY id LIMIT 1')
    .get() as { id: number } | undefined
  if (!row) fail('INTERNAL')
  return row.id
}

function resolvePersonId(db: DatabaseType, personId: unknown): number {
  if (personId === null || personId === undefined) return ortakId(db)
  if (typeof personId !== 'number' || !Number.isInteger(personId) || personId <= 0) {
    fail('NO_SUCH_PERSON')
  }
  return personRow(db, personId).id
}

// --- Reading everything ----------------------------------------------------

export function readLedger(db: DatabaseType): LedgerData {
  const persons = (
    db
      .prepare('SELECT id, name, colour, is_builtin, position FROM persons ORDER BY position, id')
      .all() as PersonRow[]
  ).map(toPerson)

  const types = (
    db.prepare('SELECT code, unit, position FROM valuable_types ORDER BY position').all() as {
      code: string
      unit: string
      position: number
    }[]
  ).map(
    (row): ValuableType => ({
      code: row.code as TypeCode,
      unit: row.unit as QuantityUnit,
      position: row.position
    })
  )

  // Ordered here as well as in the engine. The engine cannot trust its input's
  // order — it is handed data by tests too — but a stable read order keeps the
  // two from ever appearing to disagree while a bug is being looked for.
  const transactions = (
    db
      .prepare(
        `SELECT seq, date, date_provisional, type_code, direction,
                denomination, piece_count, quantity, unit_price,
                source, person_id, note
           FROM s3_transactions ORDER BY date, seq`
      )
      .all() as TransactionRow[]
  ).map(toTransaction)

  const manualPrices = (
    db
      .prepare('SELECT type_code, value, updated_at FROM s3_prices_manual ORDER BY type_code')
      .all() as { type_code: string; value: number; updated_at: string }[]
  ).map(
    (row): ManualPrice => ({
      typeCode: row.type_code as TypeCode,
      value: row.value,
      updatedAt: row.updated_at
    })
  )

  /**
   * The newest snapshot per type, and when the provider was last asked.
   *
   * These were an inline `MAX(fetched_at) … GROUP BY type_code` until
   * Realisation VII gave the table a `provider` column and made that query
   * wrong: it groups *across* providers, so a vault that has heard from two
   * would answer with gram from one and çeyrek from the other — a live column
   * no provider ever quoted, presented as a single moment's view. Adding
   * `provider` to the grouping does not repair it either; that returns ten rows
   * per provider. The decision belongs with the rest of the price reading, in
   * `prices.ts`, which settles the provider in force first and then takes the
   * latest row per type within it.
   */
  return {
    persons,
    types,
    transactions,
    manualPrices,
    livePrices: readLivePrices(db),
    lastFetch: readLastFetch(db)
  }
}

// --- Persons ---------------------------------------------------------------

function assertPersonNameFree(db: DatabaseType, name: string, exceptId?: number): void {
  const row = db.prepare('SELECT id FROM persons WHERE name = ?').get(name) as
    | { id: number }
    | undefined
  if (row && row.id !== exceptId) fail('DUPLICATE_NAME')
}

export function addPerson(db: DatabaseType, draft: PersonDraft): number {
  const name = cleanName(draft.name)
  const colour = cleanColour(draft.colour)

  const run = db.transaction(() => {
    assertPersonNameFree(db, name)
    const next = db.prepare('SELECT COALESCE(MAX(position) + 1, 0) AS next FROM persons').get() as {
      next: number
    }
    const result = db
      .prepare('INSERT INTO persons (name, colour, is_builtin, position) VALUES (?, ?, 0, ?)')
      .run(name, colour, next.next)
    return Number(result.lastInsertRowid)
  })

  return run()
}

/**
 * Rename a person. Ortak is refused.
 *
 * Ortak is not merely built in; it is where every other person's rows go when
 * they are removed, and where §18.3 item 8 sends every row whose owner the owner
 * cannot recall. Renaming it would rename that contract.
 */
export function renamePerson(db: DatabaseType, id: number, name: unknown): void {
  const cleaned = cleanName(name)
  const run = db.transaction(() => {
    const person = personRow(db, id)
    if (person.is_builtin === 1) fail('BUILTIN_PERSON')
    assertPersonNameFree(db, cleaned, id)
    db.prepare('UPDATE persons SET name = ? WHERE id = ?').run(cleaned, id)
  })
  run()
}

/** Ortak may take a colour: it is a real person in the grid, just an unnamed one. */
export function setPersonColour(db: DatabaseType, id: number, colour: unknown): void {
  const cleaned = cleanColour(colour)
  const run = db.transaction(() => {
    personRow(db, id)
    db.prepare('UPDATE persons SET colour = ? WHERE id = ?').run(cleaned, id)
  })
  run()
}

/**
 * Rewrite the person order.
 *
 * Tolerant of an incomplete list, like Section 1's and Section 2's: unknown ids
 * are dropped, duplicates are dropped, and anything omitted keeps its existing
 * relative order at the end. Positions are rewritten contiguously so a reorder
 * never leaves a gap for a later read to guess about.
 */
export function reorderPersons(db: DatabaseType, orderedIds: readonly number[]): void {
  const run = db.transaction(() => {
    const existing = db.prepare('SELECT id FROM persons ORDER BY position, id').all() as {
      id: number
    }[]
    const present = new Set(existing.map((row) => row.id))

    const seen = new Set<number>()
    const order: number[] = []
    for (const id of orderedIds) {
      if (!present.has(id) || seen.has(id)) continue
      seen.add(id)
      order.push(id)
    }
    for (const row of existing) if (!seen.has(row.id)) order.push(row.id)

    const update = db.prepare('UPDATE persons SET position = ? WHERE id = ?')
    order.forEach((id, index) => update.run(index, id))
  })
  run()
}

/** How many ledger rows would move if this person were removed. */
export function personUsage(db: DatabaseType, id: number): PersonUsage {
  const person = personRow(db, id)
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM s3_transactions WHERE person_id = ?')
    .get(id) as { n: number }
  return { transactionCount: row.n, isBuiltin: person.is_builtin === 1 }
}

/**
 * Remove a person. Their transactions move to Ortak; not one is deleted.
 *
 * `foreign_keys = ON` and `s3_transactions.person_id` carries no `ON DELETE`, so
 * a bare delete would be refused by SQLite — which is the right instinct wearing
 * the wrong error. A cascade would be far worse: it would delete a lifetime of
 * the owner's ledger because a name was tidied up. So ownership is reassigned
 * first, in the same transaction, and §8.1 already names Ortak as the home for
 * rows whose owner is unknown.
 */
export function deletePerson(db: DatabaseType, id: number): void {
  const run = db.transaction(() => {
    const person = personRow(db, id)
    if (person.is_builtin === 1) fail('BUILTIN_PERSON')

    db.prepare('UPDATE s3_transactions SET person_id = ? WHERE person_id = ?').run(ortakId(db), id)
    db.prepare('DELETE FROM persons WHERE id = ?').run(id)

    const survivors = db.prepare('SELECT id FROM persons ORDER BY position, id').all() as {
      id: number
    }[]
    const update = db.prepare('UPDATE persons SET position = ? WHERE id = ?')
    survivors.forEach((row, index) => update.run(index, row.id))
  })
  run()
}

// --- The ledger ------------------------------------------------------------

export function addTransaction(db: DatabaseType, draft: TransactionDraft): number {
  const run = db.transaction(() => {
    const typeCode = assertType(db, draft.typeCode)
    const date = cleanDate(draft.date)
    const direction = cleanDirection(draft.direction)
    const [denomination, count] = cleanDenomination(draft.denomination, draft.count)
    const unitPrice = cleanPrice(draft.unitPrice)
    const source = cleanText(draft.source, MAX_SOURCE_LENGTH)
    const note = cleanText(draft.note, MAX_NOTE_LENGTH)
    const personId = resolvePersonId(db, draft.personId)

    // `quantity` is absent by design: it is a generated column, and SQLite
    // refuses an INSERT that names it.
    const result = db
      .prepare(
        `INSERT INTO s3_transactions
              (date, date_provisional, type_code, direction,
               denomination, piece_count, unit_price,
               source, person_id, note)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        date,
        draft.dateProvisional === true ? 1 : 0,
        typeCode,
        direction,
        denomination,
        count,
        unitPrice,
        source,
        personId,
        note
      )

    return Number(result.lastInsertRowid)
  })

  return run()
}

/**
 * Edit one row.
 *
 * Absent fields are left alone; an explicit null clears a nullable one. `seq` is
 * never among them — it is the **No** column of §8.3, assigned once by
 * `AUTOINCREMENT` and never rewritten, because a row's number is its identity
 * and the source workbook's hand-typed duplicates are what that column exists to
 * make impossible.
 */
export function updateTransaction(db: DatabaseType, patch: TransactionPatch): void {
  const run = db.transaction(() => {
    const existing = db
      .prepare(
        'SELECT seq, type_code, denomination, piece_count FROM s3_transactions WHERE seq = ?'
      )
      .get(patch.seq) as
      | { seq: number; type_code: string; denomination: number; piece_count: number }
      | undefined
    if (!existing) fail('NO_SUCH_TRANSACTION')

    const sets: string[] = []
    const values: (string | number | null)[] = []

    const set = (column: string, value: string | number | null): void => {
      sets.push(`${column} = ?`)
      values.push(value)
    }

    if (patch.date !== undefined) set('date', cleanDate(patch.date))
    if (patch.dateProvisional !== undefined) {
      set('date_provisional', patch.dateProvisional === true ? 1 : 0)
    }
    if (patch.typeCode !== undefined) set('type_code', assertType(db, patch.typeCode))
    if (patch.direction !== undefined) set('direction', cleanDirection(patch.direction))
    // A patch may carry either factor alone — the grid edits one cell at a time —
    // so the pair is validated as it will *end up*, against the row's current
    // other half, and both are written together. Checking one in isolation would
    // let a legal count meet an existing denomination and generate a product past
    // `MAX_QUANTITY`, which the generated column cannot refuse for itself.
    if (patch.denomination !== undefined || patch.count !== undefined) {
      const [denomination, count] = cleanDenomination(
        patch.denomination ?? existing.denomination,
        patch.count ?? existing.piece_count
      )
      set('denomination', denomination)
      set('piece_count', count)
    }
    if (patch.unitPrice !== undefined) set('unit_price', cleanPrice(patch.unitPrice))
    if (patch.source !== undefined) set('source', cleanText(patch.source, MAX_SOURCE_LENGTH))
    if (patch.note !== undefined) set('note', cleanText(patch.note, MAX_NOTE_LENGTH))
    if (patch.personId !== undefined) set('person_id', resolvePersonId(db, patch.personId))

    if (sets.length === 0) return

    values.push(patch.seq)
    db.prepare(`UPDATE s3_transactions SET ${sets.join(', ')} WHERE seq = ?`).run(...values)
  })
  run()
}

/**
 * Delete one row.
 *
 * The numbers of the rows around it are left alone. Renumbering would make a
 * row's identity mutable, and a gap in the sequence is honest: it says a row was
 * removed, which is true.
 */
export function deleteTransaction(db: DatabaseType, seq: unknown): void {
  // Every other lookup in this file re-checks its id independently of the IPC
  // layer, if only by way of "no row matched, so this fails the same way a
  // malformed one would." This one used to be the exception: `seq: number` was
  // asserted at the type level and never at runtime, so only SQLite's own
  // parameter-affinity rules stood between a malformed argument and a bind
  // error. Checked here too, so neither layer is the only thing catching it.
  if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq <= 0) {
    fail('NO_SUCH_TRANSACTION')
  }
  const run = db.transaction(() => {
    const result = db.prepare('DELETE FROM s3_transactions WHERE seq = ?').run(seq)
    if (result.changes === 0) fail('NO_SUCH_TRANSACTION')
  })
  run()
}

// --- 3c, the owner's own prices --------------------------------------------

/**
 * Set the current manual price for a type — the authority of §8.5.
 *
 * One row per type, replaced in place with a fresh timestamp. There is no price
 * history table: Altın Eğrisi's series comes from the ledger's own unit prices
 * (§11), which are dated events rather than a running record the owner would have
 * to maintain.
 */
export function setManualPrice(db: DatabaseType, typeCode: unknown, value: unknown): void {
  const run = db.transaction(() => {
    const code = assertType(db, typeCode)
    const price = cleanPrice(value)

    db.prepare(
      `INSERT INTO s3_prices_manual (type_code, value, updated_at)
            VALUES (?, ?, ?)
       ON CONFLICT (type_code) DO UPDATE SET
            value = excluded.value, updated_at = excluded.updated_at`
    ).run(code, price, new Date().toISOString())
  })
  run()
}

/** Clear a manual price, so the type reads as unpriced rather than as free. */
export function clearManualPrice(db: DatabaseType, typeCode: unknown): void {
  const run = db.transaction(() => {
    const code = assertType(db, typeCode)
    db.prepare('DELETE FROM s3_prices_manual WHERE type_code = ?').run(code)
  })
  run()
}
