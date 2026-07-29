/**
 * Section 2 storage — bank columns, cells, and the rollover freeze.
 *
 * These run inside Electron because they open a real SQLCipher database. The
 * arithmetic is tested separately under Vitest against the pure engine; what is
 * proved here is that the rows the engine will be handed are the rows the owner
 * actually typed, and that a frozen year refuses every one of them.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'
import { afterEach, beforeEach, describe, expect, it } from './harness.js'

import { generateDek } from '../../src/main/vault/dek.js'
import { closeDatabase, openDatabase } from '../../src/main/vault/db/connection.js'
import { seedDefaultSettings } from '../../src/main/vault/db/settings.js'
import * as s1 from '../../src/main/vault/db/section1.js'
import * as s2 from '../../src/main/vault/db/section2.js'
import * as years from '../../src/main/vault/db/years.js'
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

const TODAY = { year: 2026, month: 7 }

function addBank(year: number, name: string, creditLimit: number): number {
  return s2.addBank(db, year, { name, creditLimit, isCounter: false, counterParty: null })
}

function addCounter(year: number, name: string, party: string): number {
  return s2.addBank(db, year, { name, creditLimit: 0, isCounter: true, counterParty: party })
}

function put(year: number, month: number, bankId: number, amount: number | null): void {
  s2.setCell(db, { year, month, bankId, amount })
}

describe('bank columns', () => {
  it('positions banks and counter columns contiguously within their own side', () => {
    years.createYear(db, 2026)
    const a = addBank(2026, 'A', 10_000_000)
    const b = addBank(2026, 'B', 20_000_000)
    const sayacA = addCounter(2026, 'Sayaç A', 'Sayaç A')
    const sayacB = addCounter(2026, 'Sayaç B', 'Sayaç B')

    const grid = s2.readGrid(db, 2026)
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
    years.createYear(db, 2026)
    addBank(2026, 'Kart', 5_000_000)
    addCounter(2026, 'Sayaç A', 'Sayaç A')

    const grid = s2.readGrid(db, 2026)
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
    years.createYear(db, 2026)
    // A stray limit here would silently join the total credit limit.
    const id = s2.addBank(db, 2026, {
      name: 'Sayaç A',
      creditLimit: 999_000_000,
      isCounter: true,
      counterParty: 'Sayaç A'
    })

    const grid = s2.readGrid(db, 2026)
    expect(grid.banks.find((bank) => bank.id === id)!.creditLimit).toBe(0)
    expect(computeGrid(grid, TODAY).totalCreditLimit).toBe(0)
  })

  it('refuses a duplicate name inside one year, and allows it in another', () => {
    years.createYear(db, 2025)
    addBank(2025, 'Kart', 1_000_000)
    expect(() => addBank(2025, 'Kart', 2_000_000)).toThrow()

    // A different year is a different set of columns, so the name is free
    // there. 2020 is older than 2025 and therefore inherits nothing.
    years.createYear(db, 2020)
    addBank(2020, 'Kart', 1_000_000)
    expect(s2.readGrid(db, 2020).banks).toHaveLength(1)

    // And a year that *did* inherit it already has it taken.
    years.createYear(db, 2026)
    expect(s2.readGrid(db, 2026).banks.map((bank) => bank.name)).toEqual(['Kart'])
    expect(() => addBank(2026, 'Kart', 1_000_000)).toThrow()
  })

  it('refuses a blank or oversized name', () => {
    years.createYear(db, 2026)
    expect(() => addBank(2026, '   ', 0)).toThrow()
    expect(() => addBank(2026, 'x'.repeat(49), 0)).toThrow()
  })

  it('renames, retypes the limit, and still refuses to collide', () => {
    years.createYear(db, 2026)
    const a = addBank(2026, 'A', 1_000_000)
    addBank(2026, 'B', 2_000_000)

    s2.renameBank(db, a, '  Yeni   Kart ')
    expect(s2.readGrid(db, 2026).banks[0]!.name).toBe('Yeni Kart')

    expect(() => s2.renameBank(db, a, 'B')).toThrow()

    s2.setCreditLimit(db, a, 7_500_000)
    expect(s2.readGrid(db, 2026).banks[0]!.creditLimit).toBe(7_500_000)
  })

  it('refuses a limit on a counter column and a person on a card', () => {
    years.createYear(db, 2026)
    const card = addBank(2026, 'Kart', 1_000_000)
    const counter = addCounter(2026, 'Sayaç A', 'Sayaç A')

    expect(() => s2.setCreditLimit(db, counter, 500)).toThrow()
    expect(() => s2.setCounterParty(db, card, 'biri')).toThrow()

    s2.setCounterParty(db, counter, 'Sayaç B')
    expect(s2.readGrid(db, 2026).banks.find((b) => b.id === counter)!.counterParty).toBe('Sayaç B')
  })

  it('reorders one side and renumbers it contiguously, leaving the other alone', () => {
    years.createYear(db, 2026)
    const a = addBank(2026, 'A', 0)
    const b = addBank(2026, 'B', 0)
    const c = addBank(2026, 'C', 0)
    const sayacA = addCounter(2026, 'Sayaç A', 'Sayaç A')

    s2.reorderBanks(db, 2026, false, [c, a, b])

    const grid = s2.readGrid(db, 2026)
    expect(grid.banks.filter((bank) => !bank.isCounter).map((bank) => bank.name)).toEqual([
      'C',
      'A',
      'B'
    ])
    expect(grid.banks.find((bank) => bank.id === sayacA)!.position).toBe(0)
  })

  it('tolerates a partial order rather than leaving a gap', () => {
    years.createYear(db, 2026)
    const a = addBank(2026, 'A', 0)
    addBank(2026, 'B', 0)
    const c = addBank(2026, 'C', 0)

    // Unknown ids dropped, duplicates dropped, the omitted one appended.
    s2.reorderBanks(db, 2026, false, [c, c, 9_999, a])

    const positions = s2.readGrid(db, 2026).banks.map((bank) => bank.position)
    expect(positions).toEqual([0, 1, 2])
    expect(s2.readGrid(db, 2026).banks.map((bank) => bank.name)).toEqual(['C', 'A', 'B'])
  })
})

describe('deleting a column', () => {
  it('reports what would be destroyed before it is offered', () => {
    years.createYear(db, 2026)
    const a = addBank(2026, 'A', 1_000_000)
    put(2026, 1, a, 150_000)
    put(2026, 2, a, 250_000)

    expect(s2.bankUsage(db, a)).toEqual({ cellCount: 2, total: 400_000, isCounter: false })
  })

  it('takes only this year’s cells with it, and renumbers the survivors', () => {
    years.createYear(db, 2026)
    const a = addBank(2026, 'A', 0)
    const b = addBank(2026, 'B', 0)
    const c = addBank(2026, 'C', 0)
    put(2026, 1, b, 500)

    s2.deleteBank(db, b)

    const grid = s2.readGrid(db, 2026)
    expect(grid.banks.map((bank) => bank.name)).toEqual(['A', 'C'])
    expect(grid.banks.map((bank) => bank.position)).toEqual([0, 1])
    expect(grid.cells).toHaveLength(0)
    expect(grid.banks.map((bank) => bank.id)).toEqual([a, c])
  })

  it('leaves year N untouched when year N+1 retires a column', () => {
    years.createYear(db, 2025)
    const old = addBank(2025, 'Kapanan', 1_000_000)
    put(2025, 5, old, 90_000)

    years.createYear(db, 2026)
    const carried = s2.readGrid(db, 2026).banks.find((bank) => bank.name === 'Kapanan')!
    s2.deleteBank(db, carried.id)

    const previous = s2.readGrid(db, 2025)
    expect(previous.banks.map((bank) => bank.name)).toEqual(['Kapanan'])
    expect(previous.cells).toHaveLength(1)
    expect(previous.cells[0]!.amount).toBe(90_000)
  })
})

describe('cells', () => {
  it('stores a typed zero, and clears to absence rather than to zero', () => {
    years.createYear(db, 2026)
    const a = addBank(2026, 'A', 0)

    put(2026, 3, a, 0)
    expect(s2.readGrid(db, 2026).cells).toHaveLength(1)
    expect(s2.readGrid(db, 2026).cells[0]!.amount).toBe(0)

    put(2026, 3, a, null)
    expect(s2.readGrid(db, 2026).cells).toHaveLength(0)
  })

  it('keeps one cell per column and month, overwriting rather than accumulating', () => {
    years.createYear(db, 2026)
    const a = addBank(2026, 'A', 0)

    put(2026, 4, a, 100)
    put(2026, 4, a, 250)

    const cells = s2.readGrid(db, 2026).cells
    expect(cells).toHaveLength(1)
    expect(cells[0]!.amount).toBe(250)
  })

  it('refuses a negative amount, and a month outside the twelve', () => {
    years.createYear(db, 2026)
    const a = addBank(2026, 'A', 0)

    expect(() => put(2026, 1, a, -1)).toThrow()
    expect(() => put(2026, 0, a, 100)).toThrow()
    expect(() => put(2026, 13, a, 100)).toThrow()
  })

  it('refuses a cell whose column belongs to another year', () => {
    years.createYear(db, 2025)
    years.createYear(db, 2026)
    const older = s2.readGrid(db, 2025)
    const stranger = addBank(2025, 'Yalnız', 0)

    expect(older.banks).toHaveLength(0)
    expect(() => put(2026, 1, stranger, 100)).toThrow()
  })

  it('refuses a negative limit', () => {
    years.createYear(db, 2026)
    expect(() => addBank(2026, 'A', -1)).toThrow()
  })
})

describe('the rollover carries the banks and clears the amounts (§7.3)', () => {
  it('gives the new year the same columns with nothing drawn on them', () => {
    years.createYear(db, 2026)
    const a = addBank(2026, 'A', 12_000_000)
    const sayacA = addCounter(2026, 'Sayaç A', 'Sayaç A')
    put(2026, 1, a, 500_000)
    put(2026, 2, sayacA, 100_000)

    years.createYear(db, 2027)
    const next = s2.readGrid(db, 2027)

    expect(next.banks.map((bank) => bank.name)).toEqual(['A', 'Sayaç A'])
    expect(next.banks[0]!.creditLimit).toBe(12_000_000)
    expect(next.banks[1]!.isCounter).toBe(true)
    expect(next.banks[1]!.counterParty).toBe('Sayaç A')

    // Definitions carried; amounts never.
    expect(next.cells).toHaveLength(0)

    // Fresh rows, so editing next year cannot reach back into this one.
    expect(next.banks[0]!.id === a).toBe(false)
    expect(s2.readGrid(db, 2026).cells).toHaveLength(2)
  })

  it('does not freeze the year it inherited from', () => {
    years.createYear(db, 2026)
    addBank(2026, 'A', 0)
    years.createYear(db, 2027)

    // Adding next year's workspace in October must not take away the ability
    // to correct November. Freezing is a decision, not a side effect.
    expect(s2.isArchived(db, 2026)).toBe(false)
    expect(s2.isArchived(db, 2027)).toBe(false)
  })

  it('inherits only backwards, never from a later year', () => {
    years.createYear(db, 2026)
    addBank(2026, 'A', 0)

    years.createYear(db, 2020)
    expect(s2.readGrid(db, 2020).banks).toHaveLength(0)
  })
})

describe('a frozen year is read-only and lossless (§7.3)', () => {
  /**
   * Set up inside each test rather than in a hook: the harness keeps one
   * beforeEach slot for the whole run, so a nested hook would replace the one
   * that opens the database rather than run after it.
   */
  function frozenYear(): { bank: number; counter: number } {
    years.createYear(db, 2026)
    const bank = addBank(2026, 'A', 10_000_000)
    const counter = addCounter(2026, 'Sayaç A', 'Sayaç A')
    put(2026, 1, bank, 300_000)
    put(2026, 2, counter, 50_000)
    s2.setArchived(db, 2026, true)
    return { bank, counter }
  }

  it('refuses every mutation while it is frozen', () => {
    const { bank, counter } = frozenYear()

    expect(() => addBank(2026, 'Yeni', 0)).toThrow()
    expect(() => s2.renameBank(db, bank, 'Başka')).toThrow()
    expect(() => s2.setCreditLimit(db, bank, 1)).toThrow()
    expect(() => s2.setCounterParty(db, counter, 'Sayaç B')).toThrow()
    expect(() => s2.reorderBanks(db, 2026, false, [bank])).toThrow()
    expect(() => s2.deleteBank(db, bank)).toThrow()
    expect(() => put(2026, 3, bank, 1_000)).toThrow()
  })

  it('names the reason, so the interface can say which one it is', () => {
    const { bank } = frozenYear()
    let code = ''
    try {
      put(2026, 3, bank, 1_000)
    } catch (error) {
      code = (error as { code: string }).code
    }
    expect(code).toBe('ARCHIVED')
  })

  it('loses nothing across a freeze and a reopen', () => {
    frozenYear()
    const frozen = s2.readGrid(db, 2026)

    expect(frozen.archived).toBe(true)
    expect(frozen.banks).toHaveLength(2)
    expect(frozen.cells).toHaveLength(2)

    s2.setArchived(db, 2026, false)
    const reopened = s2.readGrid(db, 2026)

    expect(reopened.archived).toBe(false)
    expect(reopened.banks).toEqual(frozen.banks)
    expect(reopened.cells).toEqual(frozen.cells)
  })

  it('accepts the same edit once it is reopened', () => {
    const { bank } = frozenYear()
    s2.setArchived(db, 2026, false)

    put(2026, 3, bank, 1_000)
    expect(s2.readGrid(db, 2026).cells).toHaveLength(3)
  })

  it('freezes one year without freezing its neighbours', () => {
    frozenYear()
    years.createYear(db, 2027)

    expect(s2.isArchived(db, 2027)).toBe(false)
    const carried = s2.readGrid(db, 2027).banks[0]!
    s2.setCreditLimit(db, carried.id, 1_000)
    expect(s2.readGrid(db, 2027).banks[0]!.creditLimit).toBe(1_000)
  })
})

describe('the acceptance arithmetic, through real rows', () => {
  it('reaches the grand total and the remaining limit from what was typed', () => {
    years.createYear(db, 2026)
    const a = addBank(2026, 'A', 20_000_000)
    const b = addBank(2026, 'B', 15_000_000)
    const sayacA = addCounter(2026, 'Sayaç A', 'Sayaç A')

    put(2026, 1, a, 300_000)
    put(2026, 12, b, 900_000)
    put(2026, 12, sayacA, 85_000)

    const computed = computeGrid(s2.readGrid(db, 2026), TODAY)

    expect(computed.grandTotalDebt).toBe(300_000 + 900_000 - 85_000)
    // The Remaining Limit row, and nothing else: the counter is not in it.
    expect(computed.totalRemainingLimit).toBe(35_000_000 - 1_200_000)
    expect(computed.counters[0]!.remaining).toBeNull()
  })

  it('moves every dependent total when December moves in the last column', () => {
    years.createYear(db, 2026)
    addBank(2026, 'A', 10_000_000)
    const last = addBank(2026, 'F', 25_000_000)

    const before = computeGrid(s2.readGrid(db, 2026), TODAY)
    put(2026, 12, last, 750_000)
    const after = computeGrid(s2.readGrid(db, 2026), TODAY)

    expect(after.months[11]!.totalDebt).toBe(before.months[11]!.totalDebt + 750_000)
    expect(after.grandTotalDebt).toBe(before.grandTotalDebt + 750_000)
    expect(after.totalRemainingLimit).toBe(before.totalRemainingLimit - 750_000)
    expect(after.banks[1]!.debt).toBe(750_000)
    expect(after.banks[1]!.remaining).toBe(25_000_000 - 750_000)
  })
})

describe('deleting a year takes the Payments grid with it', () => {
  it('counts all four tables before offering the deletion', () => {
    years.createYear(db, 2026)
    s1.addCategory(db, 2026, { name: 'MAAŞ', kind: 'income', valueType: 'TRY' })
    const a = addBank(2026, 'A', 1_000_000)
    put(2026, 1, a, 100)

    expect(years.yearUsage(db, 2026)).toEqual({
      categoryCount: 1,
      entryCount: 0,
      bankCount: 1,
      cellCount: 1
    })
  })

  it('cascades to the banks and their cells', () => {
    years.createYear(db, 2025)
    years.createYear(db, 2026)
    const a = addBank(2026, 'A', 1_000_000)
    put(2026, 1, a, 100)

    years.deleteYear(db, 2026)

    const banks = db.prepare('SELECT COUNT(*) AS n FROM s2_banks').get() as { n: number }
    const cells = db.prepare('SELECT COUNT(*) AS n FROM s2_cells').get() as { n: number }
    expect(banks.n).toBe(0)
    expect(cells.n).toBe(0)
  })
})
