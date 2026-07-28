import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from './harness.js'

import { generateDek } from '../../src/main/vault/dek.js'
import { closeDatabase, migrate, openDatabase } from '../../src/main/vault/db/connection.js'
import { SCHEMA_VERSION } from '../../src/main/vault/db/schema.js'

let dir: string
let path: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'jadeite-db-'))
  path = join(dir, 'jadeite.db')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('opening an encrypted database', () => {
  it('creates, migrates and reopens', () => {
    const dek = generateDek()

    const db = openDatabase(path, dek)
    expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
    db.prepare("INSERT INTO settings (key, value) VALUES ('k', 'v')").run()
    closeDatabase(db)

    const again = openDatabase(path, dek, { mustExist: true })
    expect(again.prepare("SELECT value FROM settings WHERE key = 'k'").get()).toEqual({
      value: 'v'
    })
    closeDatabase(again)
  })

  it('refuses the wrong key', () => {
    closeDatabase(openDatabase(path, generateDek()))
    expect(() => openDatabase(path, generateDek(), { mustExist: true })).toThrow()
  })

  it('runs in WAL mode and checkpoints away its sidecars on close', () => {
    const db = openDatabase(path, generateDek())
    expect(String(db.pragma('journal_mode', { simple: true })).toLowerCase()).toBe('wal')
    db.prepare("INSERT INTO settings (key, value) VALUES ('k', 'v')").run()
    closeDatabase(db)
    expect(readdirSync(dir)).toEqual(['jadeite.db'])
  })

  it('enforces foreign keys', () => {
    const db = openDatabase(path, generateDek())
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    closeDatabase(db)
  })

  it('is idempotent about migrations', () => {
    const dek = generateDek()
    const db = openDatabase(path, dek)
    expect(migrate(db)).toBe(SCHEMA_VERSION)
    expect(migrate(db)).toBe(SCHEMA_VERSION)
    closeDatabase(db)
  })

  it('passes an integrity check after a normal session', () => {
    const db = openDatabase(path, generateDek())
    db.prepare("INSERT INTO settings (key, value) VALUES ('k', 'v')").run()
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok')
    closeDatabase(db)
  })
})

describe('the value conventions of §5.2 are enforced by the schema', () => {
  it('refuses a negative amount, because direction carries the sign', () => {
    const db = openDatabase(path, generateDek())
    db.prepare("INSERT INTO years (year, created_at) VALUES (2026, '2026-01-01')").run()
    db.prepare(
      "INSERT INTO s1_categories (year, name, kind, position) VALUES (2026, 'ELEKTRIK', 'expense', 1)"
    ).run()
    const categoryId = db.prepare("SELECT id FROM s1_categories WHERE name = 'ELEKTRIK'").get() as {
      id: number
    }

    expect(() =>
      db
        .prepare(
          'INSERT INTO s1_entries (year, month, category_id, amount) VALUES (2026, 6, ?, -60050)'
        )
        .run(categoryId.id)
    ).toThrow()

    // The June-2025 elektrik incident, entered correctly: a positive amount in
    // an expense category.
    db.prepare(
      'INSERT INTO s1_entries (year, month, category_id, amount) VALUES (2026, 6, ?, 60050)'
    ).run(categoryId.id)
    closeDatabase(db)
  })

  it('refuses an unknown transaction direction', () => {
    const db = openDatabase(path, generateDek())
    expect(() =>
      db
        .prepare(
          "INSERT INTO s3_transactions (date, type_code, direction, quantity, unit_price) " +
            "VALUES ('2026-05-18', 'gram', 'sideways', 30000, 650500)"
        )
        .run()
    ).toThrow()
    closeDatabase(db)
  })

  it('accepts both directions the ledger actually uses', () => {
    const db = openDatabase(path, generateDek())
    const insert = db.prepare(
      'INSERT INTO s3_transactions (date, type_code, direction, quantity, unit_price) VALUES (?, ?, ?, ?, ?)'
    )
    insert.run('2026-05-18', 'gram', 'acquire', 30_000, 650_500)
    insert.run('2026-06-01', 'gram', 'dispose', 30_000, 650_500)
    expect(
      (db.prepare('SELECT count(*) AS n FROM s3_transactions').get() as { n: number }).n
    ).toBe(2)
    closeDatabase(db)
  })

  it('numbers ledger rows automatically, so 14,14,17,17 cannot recur', () => {
    const db = openDatabase(path, generateDek())
    const insert = db.prepare(
      "INSERT INTO s3_transactions (date, type_code, direction, quantity, unit_price) VALUES ('2026-01-01', 'gram', 'acquire', 1000, 1)"
    )
    insert.run()
    insert.run()
    insert.run()
    const seqs = (db.prepare('SELECT seq FROM s3_transactions ORDER BY seq').all() as {
      seq: number
    }[]).map((r) => r.seq)
    expect(new Set(seqs).size).toBe(seqs.length)
    closeDatabase(db)
  })
})
