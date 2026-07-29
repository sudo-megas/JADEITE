/**
 * Section 4 storage — the scratchpad's lines.
 *
 * Everything here is a write against the encrypted database or a read out of it.
 * The three statistics live in shared/section4/engine.ts and are stored nowhere
 * (§5.3): a scratchpad whose total was a stored column would be the spreadsheet
 * this application replaces, in miniature.
 *
 * There is no year and no person here. §9 is deliberately unfancy, and so is this.
 */

import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'

import type { Line, LineDraft, LinePatch } from '../../../shared/section4/types.js'
import { MAX_LABEL_LENGTH } from '../../../shared/section4/types.js'
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

/**
 * A label, or an empty one.
 *
 * Unlike every other name in the app this may be blank: a line is created before
 * it is described, and refusing an empty label would mean the owner had to name a
 * line before typing the figure that prompted it. Whitespace is collapsed but not
 * required to exist.
 */
function cleanLabel(label: unknown): string {
  if (label === null || label === undefined) return ''
  if (typeof label !== 'string') fail('INVALID_LABEL')
  const trimmed = label.trim().replace(/\s+/g, ' ')
  if (trimmed.length > MAX_LABEL_LENGTH) fail('INVALID_LABEL')
  return trimmed
}

/**
 * Integer hundredths, or nothing at all.
 *
 * Non-negative, because figures reach this section through the same parser as
 * every other figure in the app and that parser refuses a leading minus (§5.2).
 */
function cleanValue(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    fail('INVALID_VALUE')
  }
  return value
}

// --- Rows ------------------------------------------------------------------

interface LineRow {
  id: number
  label: string
  value: number | null
  position: number
}

export function readLines(db: DatabaseType): Line[] {
  return db
    .prepare('SELECT id, label, value, position FROM s4_lines ORDER BY position, id')
    .all() as LineRow[]
}

export function addLine(db: DatabaseType, draft: LineDraft): number {
  const label = cleanLabel(draft.label)
  const value = cleanValue(draft.value)

  const run = db.transaction(() => {
    const next = db.prepare('SELECT COALESCE(MAX(position) + 1, 0) AS next FROM s4_lines').get() as {
      next: number
    }
    const result = db
      .prepare('INSERT INTO s4_lines (label, value, position) VALUES (?, ?, ?)')
      .run(label, value, next.next)
    return Number(result.lastInsertRowid)
  })

  return run()
}

/**
 * Edit one line.
 *
 * Absent fields are left alone; an explicit null on `value` clears the figure and
 * keeps the label, which is how a line becomes a heading again.
 */
export function updateLine(db: DatabaseType, patch: LinePatch): void {
  const run = db.transaction(() => {
    const row = db.prepare('SELECT id FROM s4_lines WHERE id = ?').get(patch.id) as
      | { id: number }
      | undefined
    if (!row) fail('NO_SUCH_LINE')

    const sets: string[] = []
    const values: (string | number | null)[] = []

    if (patch.label !== undefined) {
      sets.push('label = ?')
      values.push(cleanLabel(patch.label))
    }
    if (patch.value !== undefined) {
      sets.push('value = ?')
      values.push(cleanValue(patch.value))
    }
    if (sets.length === 0) return

    values.push(patch.id)
    db.prepare(`UPDATE s4_lines SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  })
  run()
}

/** Remove a line, and close the gap its position leaves. */
export function deleteLine(db: DatabaseType, id: number): void {
  const run = db.transaction(() => {
    const result = db.prepare('DELETE FROM s4_lines WHERE id = ?').run(id)
    if (result.changes === 0) fail('NO_SUCH_LINE')
    renumber(db)
  })
  run()
}

/**
 * Rewrite the order.
 *
 * Tolerant of an incomplete list, as every other reorder in the app is: unknown
 * ids are dropped, duplicates are dropped, and anything omitted keeps its existing
 * relative order at the end.
 */
export function reorderLines(db: DatabaseType, orderedIds: readonly number[]): void {
  const run = db.transaction(() => {
    const existing = db.prepare('SELECT id FROM s4_lines ORDER BY position, id').all() as {
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

    const update = db.prepare('UPDATE s4_lines SET position = ? WHERE id = ?')
    order.forEach((id, index) => update.run(index, id))
  })
  run()
}

/** Positions contiguous from zero, so a later read never has to guess at a gap. */
function renumber(db: DatabaseType): void {
  const survivors = db.prepare('SELECT id FROM s4_lines ORDER BY position, id').all() as {
    id: number
  }[]
  const update = db.prepare('UPDATE s4_lines SET position = ? WHERE id = ?')
  survivors.forEach((row, index) => update.run(index, row.id))
}
