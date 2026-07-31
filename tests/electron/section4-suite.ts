/**
 * Section 4 storage — the scratchpad's boxes.
 *
 * The three statistics are tested against the pure engine under Vitest. What is
 * proved here is that a figure survives being stored: that a box overwritten
 * holds the second figure and not two rows, that an emptied box leaves no row
 * behind rather than a zero, and that a typed zero leaves a row that counts.
 *
 * And that the vaults already on disk arrive intact. The v3 → v4 migration turns
 * a list of labelled lines into a grid of numbered boxes, which is the one thing
 * in this reconfiguration that touches figures the owner has already typed.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'
import { afterEach, beforeEach, describe, expect, it } from './harness.js'

import Database from 'better-sqlite3-multiple-ciphers'

import { generateDek } from '../../src/main/vault/dek.js'
import { closeDatabase, migrate, openDatabase } from '../../src/main/vault/db/connection.js'
import { MIGRATIONS, SCHEMA_VERSION } from '../../src/main/vault/db/schema.js'
import { seedDefaultSettings } from '../../src/main/vault/db/settings.js'
import * as s4 from '../../src/main/vault/db/section4.js'
import { computeStatistics } from '../../src/shared/section4/engine.js'
import { COLUMNS, MAX_ROWS } from '../../src/shared/section4/types.js'

let dir: string
let db: DatabaseType

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'jadeite-s4-'))
  db = openDatabase(join(dir, 'jadeite.db'), generateDek())
  seedDefaultSettings(db)
})

afterEach(() => {
  closeDatabase(db)
  rmSync(dir, { recursive: true, force: true })
})

function put(slot: number, value: number | null): void {
  s4.setCell(db, { slot, value })
}

describe('boxes', () => {
  it('starts with none, and the statistics say so rather than showing zero', () => {
    expect(s4.readCells(db)).toHaveLength(0)
    expect(computeStatistics(s4.readCells(db))).toEqual({
      count: 0,
      total: 0,
      average: null,
      median: null
    })
  })

  /** The table is sparse: only the boxes typed in have rows, in slot order. */
  it('stores only the boxes that were filled, whichever order they were filled in', () => {
    put(4, 3_200_00)
    put(0, 12_000_00)
    put(1, 1_450_00)

    expect(s4.readCells(db)).toEqual([
      { slot: 0, value: 12_000_00 },
      { slot: 1, value: 1_450_00 },
      { slot: 4, value: 3_200_00 }
    ])
  })

  it('overwrites a box rather than accumulating rows in it', () => {
    put(7, 100_00)
    put(7, 250_00)

    const cells = s4.readCells(db)
    expect(cells).toHaveLength(1)
    expect(cells[0]!.value).toBe(250_00)
  })

  it('accepts a figure of zero, which is a real answer and a real row', () => {
    put(3, 0)
    expect(s4.readCells(db)).toEqual([{ slot: 3, value: 0 }])
    expect(computeStatistics(s4.readCells(db)).count).toBe(1)
  })

  /** Emptying a box removes its row; it does not store a zero in it. */
  it('clears a box to nothing rather than to zero', () => {
    put(3, 500_00)
    put(4, 900_00)
    put(3, null)

    expect(s4.readCells(db)).toEqual([{ slot: 4, value: 900_00 }])
    expect(computeStatistics(s4.readCells(db)).count).toBe(1)
  })

  /**
   * There is no box that "is not there" — every slot the grid can draw is a slot
   * that can be emptied, whether or not anything was ever typed in it.
   */
  it('is untroubled by clearing a box that was never filled', () => {
    expect(() => put(11, null)).not.toThrow()
    expect(s4.readCells(db)).toHaveLength(0)
  })

  it('empties every box at once, and leaves the table rather than the rows', () => {
    put(0, 100_00)
    put(1, 200_00)
    put(99, 300_00)

    s4.clearCells(db)

    expect(s4.readCells(db)).toHaveLength(0)
    // Clearing an already-empty grid is the same act performed on nothing.
    expect(() => s4.clearCells(db)).not.toThrow()
  })

  it('refuses a negative figure, as every figure in the app is refused', () => {
    expect(() => put(0, -100)).toThrow()
  })

  it('refuses a fractional figure — hundredths are whole', () => {
    expect(() => put(0, 100.5)).toThrow()
  })

  it('refuses a slot that is not a whole number of boxes from the first one', () => {
    expect(() => put(-1, 100)).toThrow()
    expect(() => put(2.5, 100)).toThrow()
  })

  /** The grid stops at MAX_ROWS, so a row nothing can draw cannot be written. */
  it('refuses a slot past the last box the grid can ever show', () => {
    const last = COLUMNS * MAX_ROWS - 1
    expect(() => put(last, 100)).not.toThrow()
    expect(() => put(last + 1, 100)).toThrow()
    expect(s4.readCells(db)).toHaveLength(1)
  })
})

describe('the statistics, through real rows', () => {
  it('totals, averages and medians what was actually stored', () => {
    put(0, 12_000_00)
    put(1, 1_450_00)
    put(2, 3_200_00)

    const stats = computeStatistics(s4.readCells(db))
    expect(stats.count).toBe(3)
    expect(stats.total).toBe(16_650_00)
    // 16.650,00 ÷ 3 = 5.550,00 exactly.
    expect(stats.average).toBe(5_550_00)
    expect(stats.median).toBe(3_200_00)
  })
})

/**
 * The v3 → v4 migration — §9's amendment, on a vault that already has figures in
 * it.
 *
 * The labels are gone and cannot come back; that is the owner's ruling and the
 * schema's comment says so. What must not be true is that a *figure* is gone, or
 * that one lands in the wrong box: `ROW_NUMBER() OVER (ORDER BY position, id)`
 * closes the gaps as it copies, so the boxes read left to right in the order the
 * lines were arranged in, with the label-only lines simply absent.
 *
 * These run on a plain database rather than an encrypted one, as the v1 → v2
 * cases in storage-suite.ts do: the migration is pure SQL and knows nothing about
 * SQLCipher, so opening a keyed vault here would test the cipher a second time
 * and the migration no better.
 */
describe('migrating a v3 vault forward (§9, amended)', () => {
  /**
   * Apply the migrations up to and including `version`, and stop.
   *
   * Written out here rather than shared with storage-suite.ts, whose copy is
   * local to its own describe block. Pinning `MIGRATIONS[2]` instead would drift
   * the moment a fifth migration was appended, which is the drift that copy's
   * comment records having already happened once.
   */
  function seededThrough(name: string, version: number): DatabaseType {
    const seeded = new Database(join(dir, name))
    seeded.pragma('foreign_keys = ON')
    for (const migration of MIGRATIONS) {
      if (migration.version > version) break
      seeded.exec(migration.sql)
    }
    seeded.pragma(`user_version = ${version}`)
    return seeded
  }

  /** A vault as Realisation VII left it: schema v3, and a list of lines. */
  function v3Database(name = 'v3.db'): DatabaseType {
    return seededThrough(name, 3)
  }

  /**
   * Positions that are neither contiguous nor in id order, and a heading in the
   * middle of them. A fixture that seeded 0, 1, 2 would pass whether the copy
   * closed the gaps or ignored them.
   */
  function seedLines(seeded: DatabaseType): void {
    const insert = seeded.prepare('INSERT INTO s4_lines (label, value, position) VALUES (?, ?, ?)')
    insert.run('Market', 3_200_00, 40)
    insert.run('Kira', 12_000_00, 10)
    insert.run('Giderler', null, 20)
    insert.run('Fatura', 1_450_00, 30)
  }

  it('brings every figure across in slot order, with the gaps closed', () => {
    const seeded = v3Database()
    seedLines(seeded)

    expect(migrate(seeded)).toBe(SCHEMA_VERSION)

    const cells = seeded.prepare('SELECT slot, value FROM s4_cells ORDER BY slot').all()
    // Kira, Fatura, Market — the order their positions put them in. The heading
    // carried no figure and so has no box, and the boxes after it close up.
    expect(cells).toEqual([
      { slot: 0, value: 12_000_00 },
      { slot: 1, value: 1_450_00 },
      { slot: 2, value: 3_200_00 }
    ])
    seeded.close()
  })

  it('leaves the statistics saying exactly what they said before the upgrade', () => {
    const seeded = v3Database('v3-stats.db')
    seedLines(seeded)

    const before = (
      seeded.prepare('SELECT SUM(value) AS total FROM s4_lines WHERE value IS NOT NULL').get() as {
        total: number
      }
    ).total

    migrate(seeded)

    const stats = computeStatistics(s4.readCells(seeded))
    expect(stats.total).toBe(before)
    expect(stats.count).toBe(3)
    expect(stats.median).toBe(3_200_00)
    seeded.close()
  })

  it('takes the labelled lines away with the table they lived on', () => {
    const seeded = v3Database('v3-dropped.db')
    seedLines(seeded)
    migrate(seeded)

    // §9 as amended: no label survives, and nothing reads a column that is gone.
    expect(() => seeded.prepare('SELECT label FROM s4_lines').all()).toThrow()
    seeded.close()
  })

  it('upgrades a vault whose scratchpad was never used, and is idempotent about it', () => {
    const seeded = v3Database('v3-empty.db')

    expect(migrate(seeded)).toBe(SCHEMA_VERSION)
    expect(migrate(seeded)).toBe(SCHEMA_VERSION)
    expect(s4.readCells(seeded)).toHaveLength(0)
    seeded.close()
  })
})
