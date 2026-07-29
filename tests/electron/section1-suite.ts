/**
 * Section 1 storage — year workspaces, column sets and cells.
 *
 * These run inside Electron because they open a real SQLCipher database. The
 * arithmetic is tested separately under Vitest against the pure engine; what is
 * proved here is that the rows the engine will be handed are the rows the owner
 * actually typed.
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
import { computeWorkspace, bucketOf } from '../../src/shared/section1/engine.js'

let dir: string
let db: DatabaseType

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'jadeite-s1-'))
  db = openDatabase(join(dir, 'jadeite.db'), generateDek())
  seedDefaultSettings(db)
})

afterEach(() => {
  closeDatabase(db)
  rmSync(dir, { recursive: true, force: true })
})

function add(year: number, name: string, kind: 'income' | 'expense', valueType = 'TRY'): number {
  return s1.addCategory(db, year, { name, kind, valueType: valueType as never })
}

function put(year: number, month: number, categoryId: number, amount: number | null, isRefund = false, note: string | null = null): void {
  s1.setEntry(db, { year, month, categoryId, amount, isRefund, note })
}

describe('year workspaces', () => {
  it('opens a fresh vault on the current year, with no columns invented for it', () => {
    const year = s1.ensureAnyYear(db)
    expect(year).toBe(new Date().getFullYear())
    expect(s1.listYears(db)).toEqual([year])

    // §6.2 grants inheritance from "the previous year"; there is none, and
    // authoring category names on the owner's behalf is not the app's business.
    expect(s1.readWorkspace(db, year).categories).toHaveLength(0)
  })

  it('inherits the previous year’s columns, and none of its amounts', () => {
    s1.createYear(db, 2025)
    const salary = add(2025, 'MAAŞ', 'income')
    const rent = add(2025, 'KİRA', 'expense')
    put(2025, 3, salary, 100_000)
    put(2025, 3, rent, 43_000)

    s1.createYear(db, 2026)
    const next = s1.readWorkspace(db, 2026)

    expect(next.categories.map((c) => c.name)).toEqual(['MAAŞ', 'KİRA'])
    expect(next.entries).toHaveLength(0)

    // New rows, not shared ones: that is what keeps year N safe from year N+1.
    expect(next.categories.every((c) => c.id !== salary && c.id !== rent)).toBe(true)
  })

  it('inherits strictly backwards, so an earlier year borrows nothing', () => {
    s1.createYear(db, 2026)
    add(2026, 'MAAŞ', 'income')

    s1.createYear(db, 2020)
    // Borrowing forwards would furnish 2020 with categories that did not exist
    // until 2026.
    expect(s1.readWorkspace(db, 2020).categories).toHaveLength(0)
  })

  it('refuses to create a year twice', () => {
    s1.createYear(db, 2026)
    expect(() => s1.createYear(db, 2026)).toThrow()
    expect(s1.listYears(db)).toEqual([2026])
  })

  it('fills no gaps: a workspace exists only if it was asked for', () => {
    s1.createYear(db, 2020)
    s1.createYear(db, 2024)
    expect(s1.listYears(db)).toEqual([2020, 2024])
  })
})

describe('deleting a year', () => {
  it('reports what it would destroy before it is offered', () => {
    s1.createYear(db, 2026)
    const salary = add(2026, 'MAAŞ', 'income')
    add(2026, 'KİRA', 'expense')
    put(2026, 1, salary, 100_000)
    put(2026, 2, salary, 120_000)

    const usage = s1.yearUsage(db, 2026)
    expect(usage.categoryCount).toBe(2)
    expect(usage.entryCount).toBe(2)
  })

  it('takes the year and everything in it, and leaves the others alone', () => {
    s1.createYear(db, 2025)
    const rent = add(2025, 'KİRA', 'expense')
    put(2025, 1, rent, 430_000)

    s1.createYear(db, 2026)
    const rent26 = s1.readWorkspace(db, 2026).categories[0]
    put(2026, 1, rent26!.id, 500_000)

    s1.deleteYear(db, 2026)

    expect(s1.listYears(db)).toEqual([2025])
    // The cascade took 2026's columns and cells with it.
    expect(db.prepare('SELECT COUNT(*) AS n FROM s1_categories WHERE year = 2026').get()).toEqual({
      n: 0
    })
    expect(db.prepare('SELECT COUNT(*) AS n FROM s1_entries WHERE year = 2026').get()).toEqual({
      n: 0
    })

    // And 2025 is exactly as it was.
    const survivor = s1.readWorkspace(db, 2025)
    expect(survivor.categories).toHaveLength(1)
    expect(survivor.entries[0]?.amount).toBe(430_000)
  })

  it('refuses the last remaining year', () => {
    s1.createYear(db, 2026)
    expect(() => s1.deleteYear(db, 2026)).toThrow()
    expect(s1.listYears(db)).toEqual([2026])
  })

  it('refuses a year that is not there', () => {
    s1.createYear(db, 2026)
    s1.createYear(db, 2027)
    expect(() => s1.deleteYear(db, 2030)).toThrow()
  })

  it('leaves the accent anchor where it is, even when the anchor year goes', () => {
    s1.createYear(db, 2024)
    s1.createYear(db, 2025)
    expect(s1.accentAnchorYear(db)).toBe(2024)

    s1.deleteYear(db, 2024)

    // A deleted-and-recreated year gets the colour it had; the anchor is not a
    // property of which years happen to exist.
    expect(s1.accentAnchorYear(db)).toBe(2024)
    s1.createYear(db, 2024)
    expect(s1.accentAnchorYear(db)).toBe(2024)
  })
})

describe('the accent anchor never moves (§12.3)', () => {
  it('is fixed by the first year the vault ever had', () => {
    s1.createYear(db, 2024)
    expect(s1.accentAnchorYear(db)).toBe(2024)

    s1.createYear(db, 2025)
    s1.createYear(db, 2020)
    // Adding an older year must not repaint every workspace the owner already
    // recognises.
    expect(s1.accentAnchorYear(db)).toBe(2024)
  })

  it('is repaired once for a vault that predates Realisation III, then frozen', () => {
    db.prepare('INSERT INTO years (year, created_at) VALUES (?, ?)').run(2023, 'x')
    db.prepare('INSERT INTO years (year, created_at) VALUES (?, ?)').run(2024, 'x')

    expect(s1.accentAnchorYear(db)).toBe(2023)
    s1.createYear(db, 2019)
    expect(s1.accentAnchorYear(db)).toBe(2023)
  })
})

describe('column management', () => {
  it('positions columns contiguously within their own group', () => {
    s1.createYear(db, 2026)
    const a = add(2026, 'MAAŞ', 'income')
    const b = add(2026, 'EK DERS', 'income')
    const c = add(2026, 'KİRA', 'expense')

    const ws = s1.readWorkspace(db, 2026)
    const byId = new Map(ws.categories.map((x) => [x.id, x]))
    expect(byId.get(a)?.position).toBe(0)
    expect(byId.get(b)?.position).toBe(1)
    expect(byId.get(c)?.position).toBe(0)
  })

  it('refuses a duplicate name inside one year, and allows it in another', () => {
    s1.createYear(db, 2026)
    add(2026, 'KİRA', 'expense')
    expect(() => add(2026, 'KİRA', 'expense')).toThrow()

    s1.createYear(db, 2027)
    // 2027 inherited KİRA already; a second one there is still a duplicate.
    expect(() => add(2027, 'KİRA', 'expense')).toThrow()
  })

  it('refuses a blank or oversized name', () => {
    s1.createYear(db, 2026)
    expect(() => add(2026, '   ', 'expense')).toThrow()
    expect(() => add(2026, 'x'.repeat(49), 'expense')).toThrow()
  })

  it('renames, and still refuses to collide', () => {
    s1.createYear(db, 2026)
    const a = add(2026, 'MAAŞ', 'income')
    add(2026, 'EK DERS', 'income')

    s1.renameCategory(db, a, '  İKİNCİ   MAAŞ  ')
    expect(s1.readWorkspace(db, 2026).categories.find((c) => c.id === a)?.name).toBe('İKİNCİ MAAŞ')

    expect(() => s1.renameCategory(db, a, 'EK DERS')).toThrow()
  })

  it('reorders one group and renumbers it contiguously', () => {
    s1.createYear(db, 2026)
    const a = add(2026, 'A', 'income')
    const b = add(2026, 'B', 'income')
    const c = add(2026, 'C', 'income')

    s1.reorderCategories(db, 2026, 'income', [c, a, b])
    const ws = s1.readWorkspace(db, 2026)
    expect(ws.categories.map((x) => x.name)).toEqual(['C', 'A', 'B'])
    expect(ws.categories.map((x) => x.position)).toEqual([0, 1, 2])
  })

  it('retypes a column without converting a single stored amount', () => {
    s1.createYear(db, 2026)
    const savings = add(2026, 'BİRİKİM', 'income')
    put(2026, 1, savings, 20_000)

    s1.setCategoryValueType(db, savings, 'USD')
    const ws = s1.readWorkspace(db, 2026)
    expect(ws.categories[0]?.valueType).toBe('USD')
    // No exchange rate exists anywhere in JADEITE, and none was applied.
    expect(ws.entries[0]?.amount).toBe(20_000)
  })
})

describe('deleting a column', () => {
  it('reports what would be destroyed before it is offered', () => {
    s1.createYear(db, 2026)
    const power = add(2026, 'ELEKTRİK', 'expense')
    put(2026, 1, power, 30_000)
    put(2026, 2, power, 40_000)
    put(2026, 3, power, 10_000, true)

    const usage = s1.categoryUsage(db, power)
    expect(usage.entryCount).toBe(3)
    // Signed, exactly as the grid shows it: the refund counts against.
    expect(usage.total).toBe(60_000)
    expect(usage.valueType).toBe('TRY')
  })

  it('takes only this year’s cells with it, and renumbers the survivors', () => {
    s1.createYear(db, 2026)
    const a = add(2026, 'A', 'expense')
    const b = add(2026, 'B', 'expense')
    const c = add(2026, 'C', 'expense')
    put(2026, 1, b, 5_000)

    s1.deleteCategory(db, b)
    const ws = s1.readWorkspace(db, 2026)
    expect(ws.categories.map((x) => x.id)).toEqual([a, c])
    expect(ws.categories.map((x) => x.position)).toEqual([0, 1])
    expect(ws.entries).toHaveLength(0)
  })

  it('leaves year N untouched when year N+1 retires a column — the acceptance check', () => {
    s1.createYear(db, 2025)
    const rent25 = add(2025, 'KİRA', 'expense')
    const service25 = add(2025, 'SERVİS', 'expense')
    put(2025, 1, rent25, 430_000)
    put(2025, 1, service25, 90_000)

    s1.createYear(db, 2026)
    const service26 = s1.readWorkspace(db, 2026).categories.find((c) => c.name === 'SERVİS')
    expect(service26 === undefined).toBe(false)

    s1.deleteCategory(db, service26!.id)

    const y2025 = s1.readWorkspace(db, 2025)
    expect(y2025.categories.map((c) => c.name)).toEqual(['KİRA', 'SERVİS'])
    expect(y2025.entries).toHaveLength(2)

    const computed = computeWorkspace(y2025)
    expect(bucketOf(computed.months[0]!.buckets, 'TRY').expense).toBe(520_000)

    // And 2026 lost only its own column.
    expect(s1.readWorkspace(db, 2026).categories.map((c) => c.name)).toEqual(['KİRA'])
  })
})

describe('cells', () => {
  const year = 2026

  /**
   * Set up inside each test rather than in a hook: the harness keeps one
   * beforeEach slot for the whole run, so a nested hook would replace the one
   * that opens the database rather than run after it.
   */
  function powerColumn(): number {
    s1.createYear(db, year)
    return add(year, 'ELEKTRİK', 'expense')
  }

  it('stores a typed zero, and clears to absence rather than to zero', () => {
    const power = powerColumn()
    put(year, 1, power, 0)
    expect(s1.readWorkspace(db, year).entries).toHaveLength(1)
    expect(s1.readWorkspace(db, year).entries[0]?.amount).toBe(0)

    put(year, 1, power, null)
    // Empty is empty (§6.3): the row is gone, not zeroed.
    expect(s1.readWorkspace(db, year).entries).toHaveLength(0)
  })

  it('keeps one entry per cell, overwriting rather than accumulating', () => {
    const power = powerColumn()
    put(year, 4, power, 30_000)
    put(year, 4, power, 45_000, true, 'iade')

    const entries = s1.readWorkspace(db, year).entries
    expect(entries).toHaveLength(1)
    expect(entries[0]?.amount).toBe(45_000)
    expect(entries[0]?.isRefund).toBe(true)
    expect(entries[0]?.note).toBe('iade')
  })

  it('takes the note and the refund flag with the amount when cleared', () => {
    const power = powerColumn()
    put(year, 5, power, 1_000, true, 'a note')
    put(year, 5, power, null)
    put(year, 5, power, 2_000)

    const entry = s1.readWorkspace(db, year).entries[0]
    expect(entry?.isRefund).toBe(false)
    expect(entry?.note).toBeNull()
  })

  it('refuses a negative amount', () => {
    const power = powerColumn()
    expect(() => put(year, 6, power, -1)).toThrow()
  })

  it('refuses a month outside the twelve', () => {
    const power = powerColumn()
    expect(() => put(year, 0, power, 100)).toThrow()
    expect(() => put(year, 13, power, 100)).toThrow()
  })

  it('refuses a cell whose column belongs to another year', () => {
    const power = powerColumn()
    s1.createYear(db, 2027)
    expect(() => put(2027, 1, power, 100)).toThrow()
  })

  it('normalises an empty note to nothing at all', () => {
    const power = powerColumn()
    put(year, 7, power, 500, false, '   ')
    expect(s1.readWorkspace(db, year).entries[0]?.note).toBeNull()
  })
})

describe('the accent override (§12.3)', () => {
  it('accepts a palette-shaped value and clears back to the sequence', () => {
    s1.createYear(db, 2026)
    s1.setAccentOverride(db, 2026, '#8caaee')
    expect(s1.readWorkspace(db, 2026).accentOverride).toBe('#8caaee')

    s1.setAccentOverride(db, 2026, null)
    expect(s1.readWorkspace(db, 2026).accentOverride).toBeNull()
  })

  it('refuses anything that is not a colour, so nothing is injected into a custom property', () => {
    s1.createYear(db, 2026)
    expect(() => s1.setAccentOverride(db, 2026, 'red; background: url(x)')).toThrow()
    expect(() => s1.setAccentOverride(db, 2026, 'var(--accent)')).toThrow()
  })
})
