/**
 * The v3 → v4 upgrade — point revision v0.8b, against vaults that already exist.
 *
 * This is the migration that takes the year out of Section 2 and turns Section
 * 4's labelled lines into numbered boxes (§7.1, §7.3 and §9, all as amended).
 * Both halves are one `db.exec` inside one transaction, so neither half can be
 * trusted on the strength of the other: a statement that fails at the end of the
 * Section 4 half rolls the Section 2 half back with it, and the reverse.
 *
 * **Why a whole suite for one migration.** schema.ts spells out the failure
 * mode, in v3's comment and again in v4's: a migration that raises rolls its own
 * transaction back, `openDatabase` rethrows, and — because nothing has changed —
 * it rethrows again on **every subsequent open**. The owner would be locked out
 * of their vault by an upgrade, with no route back in, since the only interface
 * that could repair the offending row is behind the lock. Every case below is a
 * shape a real vault could be in on the morning it is upgraded; the point of
 * having them is that none of those shapes can reach the owner untried.
 *
 * The vaults these are run against are plain databases rather than encrypted
 * ones, as the v1 → v2 cases in storage-suite.ts and the Section 4 cases in
 * section4-suite.ts are: a migration is pure SQL and knows nothing about
 * SQLCipher, so keying the fixture would test the cipher a second time and the
 * migration no better. `foreign_keys` is turned ON in the fixture because that
 * is the one part of `openDatabase`'s pragma regime the migration's safety
 * actually depends on — v4's statement order exists to survive it — and
 * `PRAGMA foreign_keys` is a no-op inside the transaction migrations run in, so
 * it cannot be lifted for the rebuild.
 *
 * The Section 4 cases overlap section4-suite.ts, which covers the same
 * statements from its section's side. They are repeated here deliberately: this
 * file's subject is the transaction, and half a transaction proving out says
 * nothing about the vault that has to open afterwards.
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
import * as s2 from '../../src/main/vault/db/section2.js'
import * as s4 from '../../src/main/vault/db/section4.js'
import { computeGrid } from '../../src/shared/section2/engine.js'

let dir: string

/** The month a migrated grid is read in, since §7.2's cues need one. */
const CURRENT_MONTH = 7

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'jadeite-migrate-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/**
 * Apply the migrations up to and including `version`, and stop.
 *
 * The third copy of this fixture in the test tree, and copied on purpose. Both
 * others record why it cannot simply pin `MIGRATIONS[2]`: a fixture that named
 * an index rather than a version drifted the moment v3 was appended, and
 * silently began asserting against a schema it was not written for. Hoisting it
 * into harness.ts would be the tidier answer and is not this file's to make.
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

/** A vault as Realisation VIII left it: schema v3, with a year on Section 2. */
function v3Vault(name: string): DatabaseType {
  return seededThrough(name, 3)
}

/** Section 2's columns hung off `years` in v3, so the parent rows come first. */
function seedYears(seeded: DatabaseType, ...list: readonly number[]): void {
  const insert = seeded.prepare('INSERT INTO years (year, created_at) VALUES (?, ?)')
  for (const year of list) insert.run(year, '2026-01-01T00:00:00.000Z')
}

interface V3BankOptions {
  creditLimit?: number
  position?: number
  isCounter?: boolean
  party?: string | null
}

/** Insert a v3 bank column by hand — `db/section2.ts` can no longer write one. */
function v3Bank(
  seeded: DatabaseType,
  year: number,
  name: string,
  options: V3BankOptions = {}
): number {
  const result = seeded
    .prepare(
      `INSERT INTO s2_banks (year, name, credit_limit, position, is_counter, counter_party)
            VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      year,
      name,
      options.creditLimit ?? 0,
      options.position ?? 0,
      options.isCounter === true ? 1 : 0,
      options.party ?? null
    )
  return Number(result.lastInsertRowid)
}

function v3Cell(
  seeded: DatabaseType,
  year: number,
  month: number,
  bankId: number,
  amount: number
): void {
  seeded
    .prepare('INSERT INTO s2_cells (year, month, bank_id, amount) VALUES (?, ?, ?, ?)')
    .run(year, month, bankId, amount)
}

describe('a v3 vault reaches v4 with Ödemeler intact (§7.1, amended)', () => {
  /**
   * Three years of columns, the newest of which is the one the owner is living
   * in. Built by a function rather than a hook: the harness keeps one
   * `beforeEach` slot per file, so a nested hook would replace the one that
   * makes the temporary directory rather than run after it.
   *
   * 2025 repeats one of 2026's names, which the old `UNIQUE (year, name)`
   * allowed and a careless backfill would carry forward into the new
   * `UNIQUE (name)` and choke on.
   */
  function seedThreeYears(seeded: DatabaseType): { akbank: number; yapiKredi: number } {
    seedYears(seeded, 2024, 2025, 2026)

    const eski = v3Bank(seeded, 2024, 'Kapanan', { creditLimit: 1_000_000 })
    v3Cell(seeded, 2024, 5, eski, 90_000)

    const oldBankaA = v3Bank(seeded, 2025, 'Banka A', { creditLimit: 18_000_000 })
    const garanti = v3Bank(seeded, 2025, 'Banka B', { creditLimit: 9_000_000, position: 1 })
    v3Cell(seeded, 2025, 1, oldBankaA, 111_000)
    v3Cell(seeded, 2025, 2, garanti, 222_000)

    const akbank = v3Bank(seeded, 2026, 'Banka A', { creditLimit: 20_000_000 })
    const yapiKredi = v3Bank(seeded, 2026, 'Banka C', {
      creditLimit: 15_000_000,
      position: 1
    })
    v3Cell(seeded, 2026, 1, akbank, 300_000)
    v3Cell(seeded, 2026, 12, yapiKredi, 900_000)

    return { akbank, yapiKredi }
  }

  it('keeps the newest year’s columns and cells, and only those', () => {
    const seeded = v3Vault('v3-years.db')
    const { akbank, yapiKredi } = seedThreeYears(seeded)

    expect(migrate(seeded)).toBe(SCHEMA_VERSION)

    const grid = s2.readGrid(seeded)
    // 2026's grid, with its ids unchanged — the migration copies them rather
    // than reinserting, which is what lets the cells come across unremapped.
    expect(grid.banks.map((bank) => bank.name)).toEqual(['Banka A', 'Banka C'])
    expect(grid.banks.map((bank) => bank.id)).toEqual([akbank, yapiKredi])
    expect(grid.banks.map((bank) => bank.creditLimit)).toEqual([20_000_000, 15_000_000])
    expect(grid.banks.map((bank) => bank.position)).toEqual([0, 1])

    // Every cell still on the column it was typed against, and no cell from a
    // year that is gone left pointing at nothing.
    expect(grid.cells).toEqual([
      { bankId: akbank, month: 1, amount: 300_000 },
      { bankId: yapiKredi, month: 12, amount: 900_000 }
    ])

    seeded.close()
  })

  it('takes the year column away with the dimension it stood for', () => {
    const seeded = v3Vault('v3-year-column.db')
    seedThreeYears(seeded)
    migrate(seeded)

    // §7.1 as amended: nothing reads a column that is gone, and a statement that
    // still named it would fail here rather than in front of the owner.
    expect(() => seeded.prepare('SELECT year FROM s2_banks').all()).toThrow()
    expect(() => seeded.prepare('SELECT year FROM s2_cells').all()).toThrow()

    seeded.close()
  })

  /**
   * The rebuilt child still points at the rebuilt parent.
   *
   * v4 renames the parent before the child so SQLite rewrites the child's
   * `REFERENCES` clause for it. If that ordering were wrong, the cells would
   * reference a table called `s2_banks_new` that no longer exists, and the
   * damage would show up not at migration time but the first time the owner
   * deleted a column and its figures stayed in every total.
   */
  it('leaves the cascade from a column to its cells working afterwards', () => {
    const seeded = v3Vault('v3-cascade.db')
    const { akbank, yapiKredi } = seedThreeYears(seeded)
    migrate(seeded)

    s2.deleteBank(seeded, akbank)

    const grid = s2.readGrid(seeded)
    expect(grid.banks.map((bank) => bank.id)).toEqual([yapiKredi])
    expect(grid.cells).toEqual([{ bankId: yapiKredi, month: 12, amount: 900_000 }])
    // And the survivor is renumbered rather than left at position 1.
    expect(grid.banks[0]!.position).toBe(0)

    seeded.close()
  })

  /**
   * A name that repeats across years must not stop the upgrade.
   *
   * The tightened `UNIQUE (name)` is the one constraint in v4 that could refuse
   * its own backfill, and a vault carrying the same bank in three years is the
   * ordinary case rather than an exotic one — that is what the rollover of the
   * old §7.3 did automatically every January. Only one year is copied, so the
   * names in flight are already unique; this proves it rather than trusting it.
   */
  it('migrates a name that repeats across years without refusing the backfill', () => {
    const seeded = v3Vault('v3-repeat.db')
    seedYears(seeded, 2024, 2025, 2026)
    v3Bank(seeded, 2024, 'Banka A', { creditLimit: 5_000_000 })
    v3Bank(seeded, 2025, 'Banka A', { creditLimit: 10_000_000 })
    v3Bank(seeded, 2026, 'Banka A', { creditLimit: 20_000_000 })

    expect(migrate(seeded)).toBe(SCHEMA_VERSION)

    const grid = s2.readGrid(seeded)
    expect(grid.banks).toHaveLength(1)
    expect(grid.banks[0]!.creditLimit).toBe(20_000_000)

    // The constraint did arrive, though: one name, one column, vault-wide.
    expect(() =>
      seeded
        .prepare("INSERT INTO s2_banks (name, credit_limit, position) VALUES ('Banka A', 0, 1)")
        .run()
    ).toThrow()

    seeded.close()
  })

  it('brings a counter column across with the person that makes it one', () => {
    const seeded = v3Vault('v3-counter.db')
    seedYears(seeded, 2026)
    v3Bank(seeded, 2026, 'Banka A', { creditLimit: 20_000_000 })
    const sayacA = v3Bank(seeded, 2026, 'Sayaç A', { isCounter: true, party: 'Sayaç A' })
    v3Cell(seeded, 2026, 3, sayacA, 85_000)

    expect(migrate(seeded)).toBe(SCHEMA_VERSION)

    const grid = s2.readGrid(seeded)
    const card = grid.banks.find((bank) => bank.name === 'Banka A')!
    const counter = grid.banks.find((bank) => bank.name === 'Sayaç A')!

    expect(card.isCounter).toBe(false)
    expect(card.counterParty).toBeNull()
    expect(counter.isCounter).toBe(true)
    expect(counter.counterParty).toBe('Sayaç A')
    // Each side counts its positions from zero, as it did before the upgrade.
    expect(counter.position).toBe(0)

    // The migrated rows are rows the engine can draw: the counter comes off the
    // debt and takes no part in the Remaining Limit row. The month is the
    // caller's to supply, so nothing here races a clock.
    const computed = computeGrid(grid, CURRENT_MONTH)
    expect(computed.totalCreditLimit).toBe(20_000_000)
    expect(computed.grandTotalDebt).toBe(-85_000)
    expect(computed.counters[0]!.remaining).toBeNull()

    seeded.close()
  })

  /**
   * A vault that never had a bank in it.
   *
   * `MAX(year)` over an empty `s2_banks` is NULL, and `year = NULL` is never
   * true, so both backfills simply select nothing. That is the shape every vault
   * created and left alone is in, and an upgrade that raised on it would lock
   * out exactly the owner who had least reason to expect it.
   */
  it('migrates a vault with no Section 2 columns to an empty grid', () => {
    const seeded = v3Vault('v3-empty-s2.db')
    seedYears(seeded, 2026)

    expect(migrate(seeded)).toBe(SCHEMA_VERSION)

    const grid = s2.readGrid(seeded)
    expect(grid.banks).toHaveLength(0)
    expect(grid.cells).toHaveLength(0)

    // And the rebuilt tables are usable, not merely present.
    const id = s2.addBank(seeded, {
      name: 'Banka A',
      creditLimit: 1_000_000,
      isCounter: false,
      counterParty: null
    })
    s2.setCell(seeded, { month: 1, bankId: id, amount: 250_000 })
    expect(s2.readGrid(seeded).cells).toEqual([{ bankId: id, month: 1, amount: 250_000 }])

    seeded.close()
  })
})

describe('the same transaction carries Section 4 across (§9, amended)', () => {
  /**
   * Positions that are neither contiguous nor in id order, with a label-only
   * line among them. A fixture seeded 0, 1, 2 would pass whether the copy closed
   * the gaps or ignored them.
   */
  function seedLines(seeded: DatabaseType): void {
    const insert = seeded.prepare('INSERT INTO s4_lines (label, value, position) VALUES (?, ?, ?)')
    insert.run('Market', 3_200_00, 40)
    insert.run('Kira', 12_000_00, 10)
    insert.run('Giderler', null, 20)
    insert.run('Fatura', 1_450_00, 30)
  }

  it('lands every figure in a box, in position order with the gaps closed', () => {
    const seeded = v3Vault('v3-lines.db')
    seedLines(seeded)

    expect(migrate(seeded)).toBe(SCHEMA_VERSION)

    // Kira, Fatura, Market — the order their positions put them in. The line
    // that carried no figure has no box, and the boxes after it close up.
    expect(s4.readCells(seeded)).toEqual([
      { slot: 0, value: 12_000_00 },
      { slot: 1, value: 1_450_00 },
      { slot: 2, value: 3_200_00 }
    ])

    // §9 as amended: the labels are gone with the table they lived on, and are
    // not recoverable. That is the ruling, not an oversight.
    expect(() => seeded.prepare('SELECT label FROM s4_lines').all()).toThrow()

    seeded.close()
  })

  it('migrates a scratchpad that was never used', () => {
    const seeded = v3Vault('v3-empty-s4.db')

    expect(migrate(seeded)).toBe(SCHEMA_VERSION)
    expect(s4.readCells(seeded)).toHaveLength(0)

    seeded.close()
  })
})

describe('a vault that has already been upgraded opens like any other', () => {
  /**
   * The migration runs once and only once.
   *
   * `migrate` skips anything at or below the recorded version, so a second call
   * must be a no-op rather than a second `CREATE TABLE s2_banks_new` — which
   * would raise, roll back, and produce precisely the vault that never opens
   * again.
   */
  it('is a no-op the second time it is asked, and keeps what the first time made', () => {
    const seeded = v3Vault('v3-twice.db')
    seedYears(seeded, 2026)
    const akbank = v3Bank(seeded, 2026, 'Banka A', { creditLimit: 20_000_000 })
    v3Cell(seeded, 2026, 1, akbank, 300_000)

    expect(migrate(seeded)).toBe(SCHEMA_VERSION)
    expect(migrate(seeded)).toBe(SCHEMA_VERSION)
    expect(seeded.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)

    const grid = s2.readGrid(seeded)
    expect(grid.banks.map((bank) => bank.id)).toEqual([akbank])
    expect(grid.cells).toEqual([{ bankId: akbank, month: 1, amount: 300_000 }])

    seeded.close()
  })

  /**
   * And through the door the owner actually comes in by.
   *
   * The cases above call `migrate` directly on a plain database; this one is an
   * encrypted vault opened, written to, closed and opened again, which is every
   * session after the upgrade. The rows have to still be there — a `user_version`
   * that reached 4 without the tables it promised would be invisible until the
   * next launch.
   */
  it('reopens an encrypted v4 vault with its rows where they were left', () => {
    const dek = generateDek()
    const path = join(dir, 'jadeite.db')

    const first = openDatabase(path, dek)
    expect(first.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
    const id = s2.addBank(first, {
      name: 'Banka A',
      creditLimit: 20_000_000,
      isCounter: false,
      counterParty: null
    })
    s2.setCell(first, { month: 1, bankId: id, amount: 300_000 })
    s4.setCell(first, { slot: 0, value: 12_000_00 })
    closeDatabase(first)

    const again = openDatabase(path, dek, { mustExist: true })
    expect(again.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
    expect(s2.readGrid(again).banks.map((bank) => bank.name)).toEqual(['Banka A'])
    expect(s2.readGrid(again).cells).toEqual([{ bankId: id, month: 1, amount: 300_000 }])
    expect(s4.readCells(again)).toEqual([{ slot: 0, value: 12_000_00 }])
    closeDatabase(again)
  })
})
