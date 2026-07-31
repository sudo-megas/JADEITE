/**
 * Section 2 storage — bank columns and their cells, in one standing grid.
 *
 * These run inside Electron because they open a real SQLCipher database. The
 * arithmetic is tested separately under Vitest against the pure engine; what is
 * proved here is that the rows the engine will be handed are the rows the owner
 * actually typed.
 *
 * **There is no year in any of this** (§7.1, §7.3 as amended by point revision
 * v0.8b). Every helper below used to take one as its first argument and every
 * fixture began by creating a year to hang the columns from. Ödemeler is now
 * twelve month lines and one set of columns, so the year is gone from the
 * fixtures as completely as it is gone from the schema.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'
import { afterEach, beforeEach, describe, expect, it } from './harness.js'

import { generateDek } from '../../src/main/vault/dek.js'
import { closeDatabase, openDatabase } from '../../src/main/vault/db/connection.js'
import { seedDefaultSettings } from '../../src/main/vault/db/settings.js'
import * as s2 from '../../src/main/vault/db/section2.js'
import { computeGrid } from '../../src/shared/section2/engine.js'

let dir: string
let db: DatabaseType

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'jadeite-s2-'))
  db = openDatabase(join(dir, 'jadeite.db'), generateDek())
  seedDefaultSettings(db)
})

afterEach(() => {
  closeDatabase(db)
  rmSync(dir, { recursive: true, force: true })
})

/**
 * The month the grid is being read in. A number rather than a date: the engine
 * takes the current month from its caller so nothing here races a clock, and it
 * no longer takes a year to compare against because the twelve lines always
 * straddle the present.
 */
const CURRENT_MONTH = 7

function addBank(name: string, creditLimit: number): number {
  return s2.addBank(db, { name, creditLimit, isCounter: false, counterParty: null })
}

function addCounter(name: string, party: string): number {
  return s2.addBank(db, { name, creditLimit: 0, isCounter: true, counterParty: party })
}

function put(month: number, bankId: number, amount: number | null): void {
  s2.setCell(db, { month, bankId, amount })
}

/**
 * The code a refusal names, not merely that it refused.
 *
 * The harness has no `toThrow(code)` and does not need one, but "it threw" is
 * the weaker assertion: a `setCell` that rejected a thirteenth month by
 * complaining about the amount would pass it, and the owner would be told to
 * correct a figure that is perfectly good. The code is what the IPC layer turns
 * into the sentence on screen, so the code is what is asserted.
 */
function codeOf(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    return (error as { code?: string }).code ?? String(error)
  }
  return ''
}

/**
 * What is no longer tested here, and why — point revision v0.8b (§7.1, §7.3).
 *
 * Five things left this file with the dimension they were about. They are named
 * rather than quietly dropped, because a test that vanishes between two commits
 * is indistinguishable from coverage that was lost by accident:
 *
 * - **The rollover** (`'the rollover carries the banks and clears the amounts'`).
 *   `createYear` no longer copies bank columns into the new year; there is one
 *   set of columns and creating a Section 1 year does not touch them.
 * - **The frozen year** (`'a frozen year is read-only and lossless'`, and with
 *   it `'freezes one year without freezing its neighbours'`). `isArchived` and
 *   `setArchived` are gone, the `ARCHIVED` code is gone from the error union,
 *   and `years.s2_archived` survives only as a dead column schema.ts explains.
 * - **Year-scoped names** (`'refuses a duplicate name inside one year, and
 *   allows it in another'`). One name, one column, vault-wide — which is what
 *   the v4 migration's `UNIQUE (name)` now enforces, and what the surviving
 *   duplicate-name test below asserts in both directions.
 * - **Cross-year isolation** (`'refuses a cell whose column belongs to another
 *   year'`, `'leaves year N untouched when year N+1 retires a column'`). There
 *   is no other year to be isolated from. The half of the first that still has a
 *   subject — a cell naming a column that does not exist — is kept below.
 * - **`yearUsage`'s Section 2 counts** (`describe('deleting a year takes the
 *   Payments grid with it')`). Deleting a year cannot reach Ödemeler any more,
 *   so `yearUsage` returns `{categoryCount, entryCount}` and the cascade it
 *   asserted does not exist. Section 1's suite owns what is left of it.
 *
 * The capability those blocks described is genuinely gone: no previous year's
 * debts are kept, and there is no read-only archive of one. That is the owner's
 * ruling, recorded here so a later rung disagrees with it deliberately rather
 * than discovering the gap.
 */

describe('bank columns', () => {
  it('positions banks and counter columns contiguously within their own side', () => {
    const a = addBank('A', 10_000_000)
    const b = addBank('B', 20_000_000)
    const sayacA = addCounter('Sayaç A', 'Sayaç A')
    const sayacB = addCounter('Sayaç B', 'Sayaç B')

    const grid = s2.readGrid(db)
    const byId = new Map(grid.banks.map((bank) => [bank.id, bank]))

    expect(byId.get(a)!.position).toBe(0)
    expect(byId.get(b)!.position).toBe(1)
    // A counter column counts from zero on its own side, not after the banks.
    expect(byId.get(sayacA)!.position).toBe(0)
    expect(byId.get(sayacB)!.position).toBe(1)

    // Read order is banks first, then counters — what §7.1 draws.
    expect(grid.banks.map((bank) => bank.name)).toEqual(['A', 'B', 'Sayaç A', 'Sayaç B'])
  })

  it('stores a counter column with a person and no limit, and a bank the other way round', () => {
    addBank('Kart', 5_000_000)
    addCounter('Sayaç A', 'Sayaç A')

    const grid = s2.readGrid(db)
    const card = grid.banks.find((bank) => bank.name === 'Kart')!
    const counter = grid.banks.find((bank) => bank.name === 'Sayaç A')!

    expect(card.creditLimit).toBe(5_000_000)
    expect(card.counterParty).toBeNull()
    expect(card.isCounter).toBe(false)

    expect(counter.creditLimit).toBe(0)
    expect(counter.counterParty).toBe('Sayaç A')
    expect(counter.isCounter).toBe(true)
  })

  it('forces a limit off a counter column even when one is offered', () => {
    // A stray limit here would silently join the total credit limit.
    const id = s2.addBank(db, {
      name: 'Sayaç A',
      creditLimit: 999_000_000,
      isCounter: true,
      counterParty: 'Sayaç A'
    })

    const grid = s2.readGrid(db)
    expect(grid.banks.find((bank) => bank.id === id)!.creditLimit).toBe(0)
    expect(computeGrid(grid, CURRENT_MONTH).totalCreditLimit).toBe(0)
  })

  /**
   * One name, one column — across both kinds of column, not merely within one.
   *
   * `assertNameFree` has never carried an `is_counter` predicate: a counter
   * column called "Banka A" beside a card called "Banka A" would put one name in
   * two header rows meaning two things. That used to be true inside a year and
   * is now true vault-wide, which is precisely what the v4 migration relied on
   * when it tightened `UNIQUE (year, name)` to `UNIQUE (name)`. Asserted in both
   * directions, because a check written on only one of the two tables' worth of
   * rows would pass one of them.
   */
  it('refuses a duplicate name, whichever kind of column already holds it', () => {
    addBank('Kart', 1_000_000)
    expect(codeOf(() => addBank('Kart', 2_000_000))).toBe('DUPLICATE_NAME')
    expect(codeOf(() => addCounter('Kart', 'Sayaç A'))).toBe('DUPLICATE_NAME')

    addCounter('Sayaç A', 'Sayaç A')
    expect(codeOf(() => addBank('Sayaç A', 500_000))).toBe('DUPLICATE_NAME')

    // Refused before the row was written, not after: two columns, still.
    expect(s2.readGrid(db).banks).toHaveLength(2)
  })

  it('refuses a blank or oversized name', () => {
    expect(() => addBank('   ', 0)).toThrow()
    expect(() => addBank('x'.repeat(49), 0)).toThrow()
  })

  it('renames, retypes the limit, and still refuses to collide', () => {
    const a = addBank('A', 1_000_000)
    addBank('B', 2_000_000)

    s2.renameBank(db, a, '  Yeni   Kart ')
    expect(s2.readGrid(db).banks[0]!.name).toBe('Yeni Kart')

    expect(() => s2.renameBank(db, a, 'B')).toThrow()

    s2.setCreditLimit(db, a, 7_500_000)
    expect(s2.readGrid(db).banks[0]!.creditLimit).toBe(7_500_000)
  })

  it('refuses a limit on a counter column and a person on a card', () => {
    const card = addBank('Kart', 1_000_000)
    const counter = addCounter('Sayaç A', 'Sayaç A')

    expect(() => s2.setCreditLimit(db, counter, 500)).toThrow()
    expect(() => s2.setCounterParty(db, card, 'biri')).toThrow()

    s2.setCounterParty(db, counter, 'Sayaç B')
    expect(s2.readGrid(db).banks.find((bank) => bank.id === counter)!.counterParty).toBe('Sayaç B')
  })

  it('reorders one side and renumbers it contiguously, leaving the other alone', () => {
    const a = addBank('A', 0)
    const b = addBank('B', 0)
    const c = addBank('C', 0)
    const sayacA = addCounter('Sayaç A', 'Sayaç A')

    s2.reorderBanks(db, false, [c, a, b])

    const grid = s2.readGrid(db)
    expect(grid.banks.filter((bank) => !bank.isCounter).map((bank) => bank.name)).toEqual([
      'C',
      'A',
      'B'
    ])
    expect(grid.banks.find((bank) => bank.id === sayacA)!.position).toBe(0)
  })

  it('tolerates a partial order rather than leaving a gap', () => {
    const a = addBank('A', 0)
    addBank('B', 0)
    addBank('C', 0)
    const d = addBank('D', 0)

    // Unknown ids dropped, duplicates dropped, the two omitted ones appended.
    s2.reorderBanks(db, false, [d, d, 9_999, a])

    const positions = s2.readGrid(db).banks.map((bank) => bank.position)
    expect(positions).toEqual([0, 1, 2, 3])
    // Two are omitted rather than one, so "B before C" is an assertion about
    // the order they were left in and not an accident of there being one.
    expect(s2.readGrid(db).banks.map((bank) => bank.name)).toEqual(['D', 'A', 'B', 'C'])
  })
})

describe('deleting a column', () => {
  it('reports what would be destroyed before it is offered', () => {
    const a = addBank('A', 1_000_000)
    put(1, a, 150_000)
    put(2, a, 250_000)

    expect(s2.bankUsage(db, a)).toEqual({ cellCount: 2, total: 400_000, isCounter: false })

    // A counter's total is its own unsigned figures; the confirmation names what
    // is about to be destroyed, not what it contributes to a total.
    const sayacA = addCounter('Sayaç A', 'Sayaç A')
    put(3, sayacA, 85_000)
    expect(s2.bankUsage(db, sayacA)).toEqual({ cellCount: 1, total: 85_000, isCounter: true })
  })

  it('takes its own cells with it, and renumbers the survivors', () => {
    const a = addBank('A', 0)
    const b = addBank('B', 0)
    const c = addBank('C', 0)
    put(1, a, 300)
    put(1, b, 500)

    s2.deleteBank(db, b)

    const grid = s2.readGrid(db)
    expect(grid.banks.map((bank) => bank.name)).toEqual(['A', 'C'])
    // Re-compacted: C moves up rather than the grid keeping a hole at 1.
    expect(grid.banks.map((bank) => bank.position)).toEqual([0, 1])
    expect(grid.banks.map((bank) => bank.id)).toEqual([a, c])

    // The cascade took B's cell and nothing else's.
    expect(grid.cells).toEqual([{ bankId: a, month: 1, amount: 300 }])
  })
})

describe('cells', () => {
  it('stores a typed zero, and clears to absence rather than to zero', () => {
    const a = addBank('A', 0)

    put(3, a, 0)
    expect(s2.readGrid(db).cells).toHaveLength(1)
    expect(s2.readGrid(db).cells[0]!.amount).toBe(0)

    put(3, a, null)
    expect(s2.readGrid(db).cells).toHaveLength(0)
  })

  it('keeps one cell per column and month, overwriting rather than accumulating', () => {
    const a = addBank('A', 0)

    put(4, a, 100)
    put(4, a, 250)

    const cells = s2.readGrid(db).cells
    expect(cells).toHaveLength(1)
    expect(cells[0]!.amount).toBe(250)
  })

  it('refuses a negative amount and a fractional one, kuruş being whole', () => {
    const a = addBank('A', 0)

    expect(codeOf(() => put(1, a, -1))).toBe('INVALID_AMOUNT')
    expect(codeOf(() => put(1, a, 100.5))).toBe('INVALID_AMOUNT')
    expect(s2.readGrid(db).cells).toHaveLength(0)
  })

  /**
   * A month outside the twelve, refused by name.
   *
   * Written against a column that exists, so the refusal cannot come from the
   * column lookup by accident: §7.1's grid is twelve lines and a thirteenth is
   * a defect in whatever asked for it, which the code has to be able to say.
   */
  it('refuses a month outside the twelve, and names that as the reason', () => {
    const a = addBank('A', 0)

    expect(codeOf(() => put(0, a, 100))).toBe('INVALID_MONTH')
    expect(codeOf(() => put(13, a, 100))).toBe('INVALID_MONTH')
    expect(codeOf(() => put(6.5, a, 100))).toBe('INVALID_MONTH')
  })

  it('refuses a cell whose column is not there', () => {
    const a = addBank('A', 0)
    s2.deleteBank(db, a)

    // The column is named on the row, so it is checked rather than trusted —
    // otherwise a cell would outlive the column it belongs to.
    expect(codeOf(() => put(1, a, 100))).toBe('NO_SUCH_BANK')
  })

  it('refuses a negative limit', () => {
    expect(codeOf(() => addBank('A', -1))).toBe('INVALID_LIMIT')
  })
})

describe('the acceptance arithmetic, through real rows', () => {
  it('reaches the grand total and the remaining limit from what was typed', () => {
    const a = addBank('A', 20_000_000)
    const b = addBank('B', 15_000_000)
    const sayacA = addCounter('Sayaç A', 'Sayaç A')

    put(1, a, 300_000)
    put(12, b, 900_000)
    put(12, sayacA, 85_000)

    const computed = computeGrid(s2.readGrid(db), CURRENT_MONTH)

    expect(computed.grandTotalDebt).toBe(300_000 + 900_000 - 85_000)
    // The Remaining Limit row, and nothing else: the counter is not in it.
    expect(computed.totalRemainingLimit).toBe(35_000_000 - 1_200_000)
    expect(computed.counters[0]!.remaining).toBeNull()
  })

  it('moves every dependent total when December moves in the last column', () => {
    addBank('A', 10_000_000)
    const last = addBank('F', 25_000_000)

    const before = computeGrid(s2.readGrid(db), CURRENT_MONTH)
    put(12, last, 750_000)
    const after = computeGrid(s2.readGrid(db), CURRENT_MONTH)

    expect(after.months[11]!.totalDebt).toBe(before.months[11]!.totalDebt + 750_000)
    expect(after.grandTotalDebt).toBe(before.grandTotalDebt + 750_000)
    expect(after.totalRemainingLimit).toBe(before.totalRemainingLimit - 750_000)
    expect(after.banks[1]!.debt).toBe(750_000)
    expect(after.banks[1]!.remaining).toBe(25_000_000 - 750_000)
  })
})
