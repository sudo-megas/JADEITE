import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from './harness.js'

import Database from 'better-sqlite3-multiple-ciphers'

import { generateDek } from '../../src/main/vault/dek.js'
import { closeDatabase, migrate, openDatabase } from '../../src/main/vault/db/connection.js'
import { MIGRATIONS, SCHEMA_VERSION } from '../../src/main/vault/db/schema.js'
import { readLedger } from '../../src/main/vault/db/section3.js'
import { computeHoldings, computeLedger } from '../../src/shared/section3/engine.js'

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
          'INSERT INTO s3_transactions (date, type_code, direction, denomination, piece_count, unit_price) ' +
            "VALUES ('2026-05-18', 'gram', 'sideways', 30000, 1, 650500)"
        )
        .run()
    ).toThrow()
    closeDatabase(db)
  })

  it('accepts both directions the ledger actually uses', () => {
    const db = openDatabase(path, generateDek())
    const insert = db.prepare(
      `INSERT INTO s3_transactions (date, type_code, direction, denomination, piece_count, unit_price)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    insert.run('2026-05-18', 'gram', 'acquire', 30_000, 1, 650_500)
    insert.run('2026-06-01', 'gram', 'dispose', 30_000, 1, 650_500)
    expect(
      (db.prepare('SELECT count(*) AS n FROM s3_transactions').get() as { n: number }).n
    ).toBe(2)
    closeDatabase(db)
  })

  /**
   * The generated column is the schema saying what §5.3 only asserted: a derived
   * value has no second home. Schema v2 made `quantity` generated, so the vault
   * itself now refuses a caller that tries to assert one.
   */
  it('refuses to be told a quantity, that being derived from the two factors', () => {
    const db = openDatabase(path, generateDek())
    expect(() =>
      db
        .prepare(
          `INSERT INTO s3_transactions (date, type_code, direction, denomination, piece_count, unit_price, quantity)
           VALUES ('2026-05-18', 'gram', 'acquire', 10000, 2, 650500, 99999)`
        )
        .run()
    ).toThrow()
    closeDatabase(db)
  })

  it('generates the quantity as denomination × count', () => {
    const db = openDatabase(path, generateDek())
    db.prepare(
      `INSERT INTO s3_transactions (date, type_code, direction, denomination, piece_count, unit_price)
       VALUES ('2026-05-18', 'gram', 'acquire', 5000, 2, 650500)`
    ).run()
    const row = db
      .prepare('SELECT denomination, piece_count, quantity FROM s3_transactions')
      .get() as { denomination: number; piece_count: number; quantity: number }
    // Two chunks of five grams — ten grams held, and the fact that it is two
    // pieces survives, which is the whole point of §8.3's amendment.
    expect(row).toEqual({ denomination: 5000, piece_count: 2, quantity: 10_000 })
    closeDatabase(db)
  })

  it('refuses a count or a denomination of nothing', () => {
    const db = openDatabase(path, generateDek())
    for (const [denomination, count] of [
      [0, 1],
      [1, 0]
    ]) {
      expect(() =>
        db
          .prepare(
            `INSERT INTO s3_transactions (date, type_code, direction, denomination, piece_count, unit_price)
             VALUES ('2026-05-18', 'gram', 'acquire', ?, ?, 650500)`
          )
          .run(denomination, count)
      ).toThrow()
    }
    closeDatabase(db)
  })

  it('numbers ledger rows automatically, so 14,14,17,17 cannot recur', () => {
    const db = openDatabase(path, generateDek())
    const insert = db.prepare(
      `INSERT INTO s3_transactions (date, type_code, direction, denomination, piece_count, unit_price)
       VALUES ('2026-01-01', 'gram', 'acquire', 1000, 1, 1)`
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

/**
 * The v1 → v2 migration — §8.3's amendment, and the first upgrade this vault has
 * ever performed.
 *
 * `migrate` has existed since Realisation I with exactly one migration to apply,
 * so until now the loop has never taken its second turn. What has to be true is
 * not that the SQL parses but that **every figure survives it**: a v1 vault holds
 * one quantity per row, v2 holds two factors and generates the product, and the
 * owner's numbers must be identical either side.
 *
 * These run on a plain database rather than an encrypted one. The migration is
 * pure SQL and knows nothing about SQLCipher; opening a keyed vault here would
 * test the cipher a second time and the migration no better.
 */
describe('migrating a v1 vault to v2 (§8.3, amended)', () => {
  /** A vault as Realisation I left it: schema v1, and rows with one quantity. */
  function v1Database(): ReturnType<typeof Database> {
    const db = new Database(join(dir, 'v1.db'))
    db.pragma('foreign_keys = ON')
    db.exec(MIGRATIONS[0]!.sql)
    db.pragma('user_version = 1')
    return db
  }

  /**
   * `withCoin` adds a çeyrek row, which exercises the unit-aware half of the
   * backfill but must be left out of the §18.4 figure check: cost basis counts an
   * unpriced holding while market value does not, so a coin with no manual price
   * lifts `costBasis` by its own cost and nothing else. That is correct behaviour
   * and not what this fixture is for.
   */
  function seedAcceptanceLedger(
    db: ReturnType<typeof Database>,
    { withCoin = false }: { withCoin?: boolean } = {}
  ): void {
    db.prepare("INSERT INTO persons (name, position) VALUES ('Kişi A', 1)").run()
    db.prepare("INSERT INTO persons (name, position) VALUES ('Kişi B', 2)").run()
    const kisiA = 2
    const kisiB = 3

    const insert = db.prepare(
      `INSERT INTO s3_transactions
         (date, type_code, direction, quantity, unit_price, person_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    insert.run('2026-01-15', 'gram', 'acquire', 10_000, 500_000, kisiA)
    insert.run('2026-02-20', 'gram', 'acquire', 20_000, 590_000, kisiA)
    insert.run('2026-03-10', 'gram', 'acquire', 10_000, 700_000, kisiB)
    insert.run('2026-04-05', 'gram', 'dispose', 10_000, 650_000, kisiA)
    if (withCoin) insert.run('2026-01-20', 'ceyrek', 'acquire', 30, 257_000, kisiA)

    db.prepare(
      "INSERT INTO s3_prices_manual (type_code, value, updated_at) VALUES ('gram', 650500, '2026-07-30T00:00:00.000Z')"
    ).run()
  }

  it('reaches schema v2, and only once however often it is opened', () => {
    const db = v1Database()
    expect(db.pragma('user_version', { simple: true })).toBe(1)

    expect(migrate(db)).toBe(SCHEMA_VERSION)
    expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)

    // Idempotent: a second call must be a no-op, not a second ALTER that throws.
    expect(migrate(db)).toBe(SCHEMA_VERSION)
    db.close()
  })

  it('keeps every Realisation V figure across the migration', () => {
    const db = v1Database()
    seedAcceptanceLedger(db)

    // Read straight out of the v1 table, because `readLedger` selects the v2
    // columns and cannot be pointed at a vault that has not been migrated yet.
    const before = (
      db
        .prepare(
          `SELECT SUM(CASE direction WHEN 'dispose' THEN -quantity ELSE quantity END) AS n
             FROM s3_transactions WHERE type_code = 'gram'`
        )
        .get() as { n: number }
    ).n

    migrate(db)
    const data = readLedger(db)
    const view = computeHoldings(data)

    // The six figures REALISATION.md §18.4 names, asserted after the upgrade.
    expect(computeLedger(data).totals.quantityByType.get('gram')).toBe(30_000)
    expect(computeLedger(data).totals.quantityByType.get('gram')).toBe(before)
    expect(view.costBasis).toBe(18_800_000)
    expect(view.marketValue).toBe(19_515_000)
    expect(view.unrealised).toBe(715_000)

    const forKisiA = view.byPerson.find((e) => e.person.name === 'Kişi A')
    const forKisiB = view.byPerson.find((e) => e.person.name === 'Kişi B')
    expect(forKisiA?.marketValue).toBe(13_010_000)
    expect(forKisiB?.marketValue).toBe(6_505_000)

    expect(view.discrepancies).toEqual([])
    db.close()
  })

  it('splits a weighable into one chunk and a coin into pieces of one', () => {
    const db = v1Database()
    seedAcceptanceLedger(db, { withCoin: true })
    migrate(db)

    const rows = db
      .prepare(
        `SELECT type_code, denomination, piece_count, quantity
           FROM s3_transactions ORDER BY seq`
      )
      .all() as {
      type_code: string
      denomination: number
      piece_count: number
      quantity: number
    }[]

    // A weighable: 10 g was stored as one number and becomes one chunk of it,
    // because nothing in a v1 vault recorded how it was split.
    const gram = rows.find((r) => r.type_code === 'gram')!
    expect(gram).toEqual({
      type_code: 'gram',
      denomination: 10_000,
      piece_count: 1,
      quantity: 10_000
    })

    // A coin: thirty çeyrek are thirty pieces of one, never one piece of thirty.
    const ceyrek = rows.find((r) => r.type_code === 'ceyrek')!
    expect(ceyrek).toEqual({
      type_code: 'ceyrek',
      denomination: 1,
      piece_count: 30,
      quantity: 30
    })

    // Whatever the split, the product is what it always was.
    for (const row of rows) expect(row.denomination * row.piece_count).toBe(row.quantity)
    db.close()
  })

  it('opens Ata a place without disturbing the order of the rest', () => {
    const db = v1Database()
    const before = (
      db.prepare('SELECT code FROM valuable_types ORDER BY position').all() as { code: string }[]
    ).map((r) => r.code)
    // `toContain` in this harness reads strings, not arrays, so membership is
    // asserted through `includes` rather than silently passing.
    expect(before.includes('ata')).toBe(false)

    migrate(db)

    const after = (
      db.prepare('SELECT code FROM valuable_types ORDER BY position').all() as { code: string }[]
    ).map((r) => r.code)
    expect(after).toEqual([
      'gram',
      'ceyrek',
      'yarim',
      'tam',
      'ata',
      'iki_bucuk',
      'besli',
      'usd',
      'eur',
      'gumus',
      'ziynet'
    ])
    // Removing Ata again must give back exactly the v1 order — proof the shift
    // moved positions rather than reshuffling them.
    expect(after.filter((code) => code !== 'ata')).toEqual(before)
    db.close()
  })

  it('leaves a v1 vault untouched when the migration fails part-way', () => {
    const db = v1Database()
    seedAcceptanceLedger(db, { withCoin: true })

    // A migration whose last statement cannot run. The runner wraps each one in a
    // transaction with its own version bump, so this must roll back whole.
    const broken = [{ version: 2, name: 'broken', sql: 'ALTER TABLE s3_transactions ADD COLUMN x INTEGER;\nTHIS IS NOT SQL;' }]
    expect(() => {
      const run = db.transaction(() => {
        db.exec(broken[0]!.sql)
        db.pragma('user_version = 2')
      })
      run()
    }).toThrow()

    expect(db.pragma('user_version', { simple: true })).toBe(1)
    const columns = (db.prepare('PRAGMA table_info(s3_transactions)').all() as { name: string }[])
      .map((c) => c.name)
    // The v1 shape, entire: the stored quantity still there, and neither the
    // half-applied column nor v2's own anywhere to be seen.
    expect(columns.includes('quantity')).toBe(true)
    expect(columns.includes('x')).toBe(false)
    expect(columns.includes('denomination')).toBe(false)

    // And the rows are still readable and still say what they said.
    expect(
      (
        db
          .prepare("SELECT quantity FROM s3_transactions WHERE type_code = 'ceyrek'")
          .get() as { quantity: number }
      ).quantity
    ).toBe(30)
    db.close()
  })
})
