/**
 * Section 4 storage — the scratchpad's lines.
 *
 * The three statistics are tested against the pure engine under Vitest. What is
 * proved here is that a line survives being stored: that an empty figure comes
 * back empty rather than as a zero, that an unlabelled line is allowed, and that
 * the order the owner arranged stays the order they get back.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'
import { afterEach, beforeEach, describe, expect, it } from './harness.js'

import { generateDek } from '../../src/main/vault/dek.js'
import { closeDatabase, openDatabase } from '../../src/main/vault/db/connection.js'
import { seedDefaultSettings } from '../../src/main/vault/db/settings.js'
import * as s4 from '../../src/main/vault/db/section4.js'
import { computeStatistics } from '../../src/shared/section4/engine.js'

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

function add(label: string, value: number | null): number {
  return s4.addLine(db, { label, value })
}

describe('lines', () => {
  it('starts with none, and the statistics say so rather than showing zero', () => {
    expect(s4.readLines(db)).toHaveLength(0)
    expect(computeStatistics(s4.readLines(db))).toEqual({
      count: 0,
      total: 0,
      average: null,
      median: null
    })
  })

  it('positions lines contiguously in the order they were added', () => {
    add('Kira', 12_000_00)
    add('Fatura', 1_450_00)
    add('Market', 3_200_00)

    const lines = s4.readLines(db)
    expect(lines.map((l) => l.label)).toEqual(['Kira', 'Fatura', 'Market'])
    expect(lines.map((l) => l.position)).toEqual([0, 1, 2])
  })

  /**
   * Unlike every other name in the app, a label may be blank: a line is created
   * before it is described, and demanding a name first would mean naming a line
   * before typing the figure that prompted it.
   */
  it('allows a line with no label at all', () => {
    const id = add('', 500_00)
    expect(s4.readLines(db).find((l) => l.id === id)?.label).toBe('')
  })

  it('allows a line with a label and no figure, and keeps it empty', () => {
    const id = add('Toplamlar', null)
    const line = s4.readLines(db).find((l) => l.id === id)
    expect(line?.label).toBe('Toplamlar')
    expect(line?.value).toBeNull()
  })

  it('collapses whitespace in a label rather than storing it', () => {
    const id = add('  Elektrik   faturası ', 600_50)
    expect(s4.readLines(db).find((l) => l.id === id)?.label).toBe('Elektrik faturası')
  })

  it('refuses a negative figure, as every figure in the app is refused', () => {
    expect(() => add('Eksi', -100)).toThrow()
  })

  it('refuses a fractional figure — hundredths are whole', () => {
    expect(() => add('Buçuk', 100.5)).toThrow()
  })

  it('accepts a figure of zero, which is a real answer', () => {
    const id = add('Sıfır', 0)
    expect(s4.readLines(db).find((l) => l.id === id)?.value).toBe(0)
  })
})

describe('editing a line', () => {
  it('changes only the field named', () => {
    const id = add('Kira', 12_000_00)
    s4.updateLine(db, { id, value: 13_000_00 })

    const line = s4.readLines(db).find((l) => l.id === id)
    expect(line?.label).toBe('Kira')
    expect(line?.value).toBe(13_000_00)
  })

  /** Clearing the figure turns a line back into a heading. */
  it('clears a figure to null rather than to zero', () => {
    const id = add('Kira', 12_000_00)
    s4.updateLine(db, { id, value: null })

    expect(s4.readLines(db).find((l) => l.id === id)?.value).toBeNull()
    expect(computeStatistics(s4.readLines(db)).count).toBe(0)
  })

  it('refuses an edit to a line that is not there', () => {
    expect(() => s4.updateLine(db, { id: 9999, value: 1 })).toThrow()
  })
})

describe('order and removal', () => {
  it('reorders tolerantly, keeping omitted lines in their relative order', () => {
    const a = add('A', 100)
    const b = add('B', 200)
    const c = add('C', 300)

    // C first, unknown id ignored, A and B left to follow in their own order.
    s4.reorderLines(db, [c, 9999])

    const lines = s4.readLines(db)
    expect(lines.map((l) => l.id)).toEqual([c, a, b])
    expect(lines.map((l) => l.position)).toEqual([0, 1, 2])
  })

  it('closes the gap after a removal', () => {
    const a = add('A', 100)
    const b = add('B', 200)
    const c = add('C', 300)

    s4.deleteLine(db, b)

    const lines = s4.readLines(db)
    expect(lines.map((l) => l.id)).toEqual([a, c])
    expect(lines.map((l) => l.position)).toEqual([0, 1])
  })

  it('refuses to remove a line that is not there', () => {
    expect(() => s4.deleteLine(db, 9999)).toThrow()
  })
})

describe('the statistics, through real rows', () => {
  it('totals, averages and medians what was actually stored', () => {
    add('Kira', 12_000_00)
    add('Bir başlık', null)
    add('Fatura', 1_450_00)
    add('Market', 3_200_00)

    const stats = computeStatistics(s4.readLines(db))
    expect(stats.count).toBe(3)
    expect(stats.total).toBe(16_650_00)
    // 16.650,00 ÷ 3 = 5.550,00 exactly.
    expect(stats.average).toBe(5_550_00)
    expect(stats.median).toBe(3_200_00)
  })
})
