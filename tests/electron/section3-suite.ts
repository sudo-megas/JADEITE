/**
 * Section 3 storage — persons, the ledger, and the owner's own prices.
 *
 * These run inside Electron because they open a real SQLCipher database. The
 * arithmetic is tested separately under Vitest against the pure engine; what is
 * proved here is that the rows the engine will be handed are the rows the owner
 * actually typed — that a ledger number cannot repeat, that a date the calendar
 * does not have is refused, and that tidying up a name never costs a
 * transaction.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'
import { afterEach, beforeEach, describe, expect, it } from './harness.js'

import { generateDek } from '../../src/main/vault/dek.js'
import { closeDatabase, openDatabase } from '../../src/main/vault/db/connection.js'
import { seedDefaultSettings } from '../../src/main/vault/db/settings.js'
import * as s3 from '../../src/main/vault/db/section3.js'
import { computeHoldings, computeLedger } from '../../src/shared/section3/engine.js'
import type { Direction, TypeCode } from '../../src/shared/section3/types.js'

let dir: string
let db: DatabaseType
/** Kept so a test can close the database and open the same file again. */
let dek: Buffer

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'jadeite-s3-'))
  dek = generateDek()
  db = openDatabase(join(dir, 'jadeite.db'), dek)
  seedDefaultSettings(db)
})

afterEach(() => {
  closeDatabase(db)
  rmSync(dir, { recursive: true, force: true })
})

function person(name: string): number {
  return s3.addPerson(db, { name, colour: null })
}

function add(
  date: string,
  personId: number | null,
  typeCode: TypeCode,
  direction: Direction,
  quantity: number,
  unitPrice: number,
  provisional = false
): number {
  return s3.addTransaction(db, {
    date,
    dateProvisional: provisional,
    typeCode,
    direction,
    // One chunk of the whole quantity, so every figure asserted below is the
    // figure that was asserted before §8.3's amendment split the column.
    denomination: quantity,
    count: 1,
    unitPrice,
    source: null,
    personId,
    note: null
  })
}

/** Ortak, as the vault seeds it (§8.1). */
function ortak(): number {
  const found = s3.readLedger(db).persons.find((p) => p.isBuiltin)
  if (!found) throw new Error('the vault seeded no built-in person')
  return found.id
}

// --- The closed list --------------------------------------------------------

describe('the seeded closed list (§8.2)', () => {
  /**
   * Eleven since §8.2's amendment: Ata is a different coin from Tam, and sits
   * between it and 2.5 because the sizes run Çeyrek < Yarım < Tam < Ata < 2.5 < 5.
   * The order is asserted rather than the membership alone, because schema v2
   * shifts five positions to open the gap and a migration that shifted them
   * wrongly would still hold the right set.
   */
  it('holds exactly the eleven types, in the owner’s order', () => {
    const types = s3.readLedger(db).types
    expect(types.map((t) => t.code)).toEqual([
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
  })

  it('gives every type a distinct position, so the shift opened exactly one gap', () => {
    const positions = s3.readLedger(db).types.map((t) => t.position)
    expect(new Set(positions).size).toBe(positions.length)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  /**
   * The union in shared/section3/types.ts constrains what a code may be; this
   * table decides which exist and with what unit. The two must agree, or the
   * engine scales a quantity by a thousand that should not have been.
   */
  it('gives each type the unit the engine expects', () => {
    const byCode = new Map(s3.readLedger(db).types.map((t) => [t.code, t.unit]))

    expect(byCode.get('gram')).toBe('mg')
    expect(byCode.get('gumus')).toBe('mg')
    expect(byCode.get('ziynet')).toBe('mg')
    expect(byCode.get('ceyrek')).toBe('piece')
    expect(byCode.get('yarim')).toBe('piece')
    expect(byCode.get('tam')).toBe('piece')
    expect(byCode.get('ata')).toBe('piece')
    expect(byCode.get('iki_bucuk')).toBe('piece')
    expect(byCode.get('besli')).toBe('piece')
    expect(byCode.get('usd')).toBe('minor')
    expect(byCode.get('eur')).toBe('minor')
  })

  it('refuses a type outside the list, so there is no user-defined path', () => {
    expect(() => add('2026-01-15', null, 'altin' as TypeCode, 'acquire', 1000, 100)).toThrow()
  })
})

// --- Persons ----------------------------------------------------------------

describe('persons (§8.1)', () => {
  it('seeds Ortak as the built-in, and only Ortak', () => {
    const persons = s3.readLedger(db).persons
    expect(persons).toHaveLength(1)
    expect(persons[0]?.name).toBe('Ortak')
    expect(persons[0]?.isBuiltin).toBe(true)
  })

  it('positions new persons contiguously after it', () => {
    const kisiA = person('Kişi A')
    const kisiB = person('Kişi B')
    const persons = s3.readLedger(db).persons
    expect(persons.map((p) => p.id)).toEqual([ortak(), kisiA, kisiB])
    expect(persons.map((p) => p.position)).toEqual([0, 1, 2])
  })

  it('refuses two people with the same name', () => {
    person('Kişi A')
    expect(() => person('Kişi A')).toThrow()
  })

  it('refuses a blank name, and trims the rest', () => {
    expect(() => person('   ')).toThrow()
    const id = person('  Kişi A   Nur ')
    const found = s3.readLedger(db).persons.find((p) => p.id === id)
    expect(found?.name).toBe('Kişi A Nur')
  })

  it('will not rename Ortak, because its name is a contract', () => {
    expect(() => s3.renamePerson(db, ortak(), 'Herkes')).toThrow()
  })

  it('will not delete Ortak either', () => {
    expect(() => s3.deletePerson(db, ortak())).toThrow()
  })

  it('lets Ortak take a colour, being a real column in the grid', () => {
    s3.setPersonColour(db, ortak(), '3')
    expect(s3.readLedger(db).persons[0]?.colour).toBe('3')
  })

  it('stores a colour as an accent slot and refuses anything else', () => {
    const kisiA = person('Kişi A')
    s3.setPersonColour(db, kisiA, '2')
    expect(s3.readLedger(db).persons.find((p) => p.id === kisiA)?.colour).toBe('2')

    // A literal colour has no home here: a person's dot is a slot in the active
    // palette's accent sequence, so it harmonises with all ten (§12.3).
    expect(() => s3.setPersonColour(db, kisiA, '#ff0000')).toThrow()
    expect(() => s3.setPersonColour(db, kisiA, 'red')).toThrow()
  })

  it('clears a colour back to the default rather than to an empty string', () => {
    const kisiA = person('Kişi A')
    s3.setPersonColour(db, kisiA, '2')
    s3.setPersonColour(db, kisiA, '')
    expect(s3.readLedger(db).persons.find((p) => p.id === kisiA)?.colour).toBeNull()
  })

  it('reorders tolerantly, keeping omitted people in their relative order', () => {
    const kisiA = person('Kişi A')
    const kisiB = person('Kişi B')
    const kisiC = person('Kişi C')

    // Ortak and Kişi C omitted; unknown id ignored.
    s3.reorderPersons(db, [kisiB, kisiA, 9999])

    const persons = s3.readLedger(db).persons
    expect(persons.map((p) => p.id)).toEqual([kisiB, kisiA, ortak(), kisiC])
    expect(persons.map((p) => p.position)).toEqual([0, 1, 2, 3])
  })
})

describe('removing a person moves their rows, and deletes none of them', () => {
  it('says how many rows would move before the offer is made', () => {
    const kisiA = person('Kişi A')
    add('2026-01-15', kisiA, 'gram', 'acquire', 10_000, 500_000)
    add('2026-02-20', kisiA, 'gram', 'acquire', 20_000, 590_000)

    expect(s3.personUsage(db, kisiA)).toEqual({ transactionCount: 2, isBuiltin: false })
  })

  /**
   * `foreign_keys = ON` and no `ON DELETE` on `person_id` means a bare delete is
   * refused by SQLite. A cascade would be far worse — it would delete a lifetime
   * of ledger because a name was tidied up.
   */
  it('reassigns every row to Ortak and keeps the ledger whole', () => {
    const kisiA = person('Kişi A')
    add('2026-01-15', kisiA, 'gram', 'acquire', 10_000, 500_000)
    add('2026-02-20', kisiA, 'gram', 'acquire', 20_000, 590_000)

    s3.deletePerson(db, kisiA)

    const data = s3.readLedger(db)
    expect(data.persons.map((p) => p.name)).toEqual(['Ortak'])
    expect(data.transactions).toHaveLength(2)
    expect(data.transactions.every((t) => t.personId === ortak())).toBe(true)

    // And the holding follows the rows rather than vanishing with the name.
    s3.setManualPrice(db, 'gram', 650_500)
    const view = computeHoldings(s3.readLedger(db))
    expect(view.byPerson[0]?.person.name).toBe('Ortak')
    expect(view.byPerson[0]?.holdings[0]?.quantity).toBe(30_000)
  })

  it('renumbers the survivors contiguously', () => {
    const kisiA = person('Kişi A')
    const kisiB = person('Kişi B')
    s3.deletePerson(db, kisiA)
    const persons = s3.readLedger(db).persons
    expect(persons.map((p) => p.id)).toEqual([ortak(), kisiB])
    expect(persons.map((p) => p.position)).toEqual([0, 1])
  })
})

// --- The ledger -------------------------------------------------------------

describe('ledger numbering cannot duplicate (§8.3)', () => {
  it('numbers rows in insertion order and never repeats one', () => {
    const a = add('2026-03-10', null, 'gram', 'acquire', 1_000, 100)
    const b = add('2026-01-15', null, 'gram', 'acquire', 1_000, 100)
    const c = add('2026-02-20', null, 'gram', 'acquire', 1_000, 100)

    expect(new Set([a, b, c]).size).toBe(3)
    expect(b).toBe(a + 1)
    expect(c).toBe(b + 1)
  })

  /**
   * The source workbook's No column read 14, 14, 17, 17. `AUTOINCREMENT` will
   * not reissue a number even after the row holding it is gone, so a gap appears
   * where a duplicate used to be possible. A gap is honest; a repeat was not.
   */
  it('leaves a gap after a deletion rather than renumbering', () => {
    const a = add('2026-01-15', null, 'gram', 'acquire', 1_000, 100)
    const b = add('2026-02-20', null, 'gram', 'acquire', 1_000, 100)
    s3.deleteTransaction(db, a)
    const c = add('2026-03-10', null, 'gram', 'acquire', 1_000, 100)

    expect(c).toBe(b + 1)
    expect(s3.readLedger(db).transactions.map((t) => t.seq)).toEqual([b, c])
  })

  it('refuses to delete a row that is not there', () => {
    expect(() => s3.deleteTransaction(db, 9999)).toThrow()
  })
})

describe('dates validate (§5.2)', () => {
  it('accepts an ISO-8601 calendar date', () => {
    const seq = add('2026-02-28', null, 'gram', 'acquire', 1_000, 100)
    expect(s3.readLedger(db).transactions.find((t) => t.seq === seq)?.date).toBe('2026-02-28')
  })

  it('refuses a date the calendar does not have', () => {
    // The shape alone would accept this; the parsed date is compared back.
    expect(() => add('2026-02-31', null, 'gram', 'acquire', 1_000, 100)).toThrow()
    expect(() => add('2026-13-01', null, 'gram', 'acquire', 1_000, 100)).toThrow()
    expect(() => add('2026-00-10', null, 'gram', 'acquire', 1_000, 100)).toThrow()
  })

  it('accepts a leap day in a leap year and refuses it otherwise', () => {
    expect(() => add('2024-02-29', null, 'gram', 'acquire', 1_000, 100)).not.toThrow()
    expect(() => add('2026-02-29', null, 'gram', 'acquire', 1_000, 100)).toThrow()
  })

  it('refuses anything that is not a date at all', () => {
    expect(() => add('15/01/2026', null, 'gram', 'acquire', 1_000, 100)).toThrow()
    expect(() => add('2026-1-5', null, 'gram', 'acquire', 1_000, 100)).toThrow()
    expect(() => add('', null, 'gram', 'acquire', 1_000, 100)).toThrow()
  })

  it('refuses a mistyped century, so a date axis cannot span a millennium', () => {
    expect(() => add('1022-01-15', null, 'gram', 'acquire', 1_000, 100)).toThrow()
  })
})

describe('the provisional flag can be set and cleared per row (§18.3 item 6)', () => {
  it('stores it, clears it, and touches no neighbour', () => {
    const flagged = add('2023-10-15', null, 'gram', 'acquire', 300_000, 186_500, true)
    const plain = add('2026-01-15', null, 'gram', 'acquire', 10_000, 500_000)

    const before = s3.readLedger(db).transactions
    expect(before.find((t) => t.seq === flagged)?.dateProvisional).toBe(true)
    expect(before.find((t) => t.seq === plain)?.dateProvisional).toBe(false)

    s3.updateTransaction(db, { seq: flagged, dateProvisional: false })

    const after = s3.readLedger(db).transactions
    expect(after.find((t) => t.seq === flagged)?.dateProvisional).toBe(false)
    expect(after.find((t) => t.seq === plain)?.dateProvisional).toBe(false)
  })

  it('counts the rows still awaiting a check', () => {
    add('2023-10-15', null, 'gram', 'acquire', 300_000, 186_500, true)
    add('2026-01-15', null, 'gram', 'acquire', 10_000, 500_000)
    expect(computeLedger(s3.readLedger(db)).totals.provisionalCount).toBe(1)
  })
})

describe('quantities and prices are refused rather than guessed at', () => {
  it('refuses a quantity of nothing, and a negative one', () => {
    expect(() => add('2026-01-15', null, 'gram', 'acquire', 0, 500_000)).toThrow()
    expect(() => add('2026-01-15', null, 'gram', 'acquire', -1_000, 500_000)).toThrow()
  })

  it('refuses a fractional quantity, milligrams being whole', () => {
    expect(() => add('2026-01-15', null, 'gram', 'acquire', 1_000.5, 500_000)).toThrow()
  })

  it('accepts a price of zero — a gift is a real acquisition', () => {
    expect(() => add('2026-01-15', null, 'gram', 'acquire', 10_000, 0)).not.toThrow()
  })

  it('refuses a negative price', () => {
    expect(() => add('2026-01-15', null, 'gram', 'acquire', 10_000, -1)).toThrow()
  })

  it('refuses a quantity past the bound, so a stray digit cannot be stored', () => {
    expect(() => add('2026-01-15', null, 'gram', 'acquire', 999_999_999, 500_000)).toThrow()
  })
})

describe('editing a row', () => {
  it('changes only the fields named', () => {
    const seq = add('2026-01-15', null, 'gram', 'acquire', 10_000, 500_000)
    s3.updateTransaction(db, { seq, denomination: 20_000 })

    const row = s3.readLedger(db).transactions.find((t) => t.seq === seq)
    expect(row?.quantity).toBe(20_000)
    expect(row?.unitPrice).toBe(500_000)
    expect(row?.date).toBe('2026-01-15')
    expect(row?.direction).toBe('acquire')
  })

  it('clears a nullable field when told to, and leaves it when not told', () => {
    const seq = s3.addTransaction(db, {
      date: '2026-01-15',
      dateProvisional: false,
      typeCode: 'gram',
      direction: 'acquire',
      denomination: 10_000,
      count: 1,
      unitPrice: 500_000,
      source: 'Kuyumcu',
      personId: null,
      note: 'ilk alış'
    })

    s3.updateTransaction(db, { seq, source: null })

    const row = s3.readLedger(db).transactions.find((t) => t.seq === seq)
    expect(row?.source).toBeNull()
    expect(row?.note).toBe('ilk alış')
  })

  it('collapses a blank source to null rather than to an empty string', () => {
    const seq = add('2026-01-15', null, 'gram', 'acquire', 10_000, 500_000)
    s3.updateTransaction(db, { seq, source: '   ' })
    expect(s3.readLedger(db).transactions.find((t) => t.seq === seq)?.source).toBeNull()
  })

  it('refuses an edit to a row that is not there', () => {
    expect(() => s3.updateTransaction(db, { seq: 9999, denomination: 1_000 })).toThrow()
  })

  it('turns an acquisition into a disposal without touching its number', () => {
    const seq = add('2026-01-15', null, 'gram', 'acquire', 10_000, 500_000)
    s3.updateTransaction(db, { seq, direction: 'dispose' })
    const row = s3.readLedger(db).transactions.find((t) => t.seq === seq)
    expect(row?.seq).toBe(seq)
    expect(row?.direction).toBe('dispose')
  })
})

describe('every row names an owner (§8.1)', () => {
  it('writes an unattributed row to Ortak rather than leaving it null', () => {
    const seq = add('2026-01-15', null, 'gram', 'acquire', 10_000, 500_000)
    expect(s3.readLedger(db).transactions.find((t) => t.seq === seq)?.personId).toBe(ortak())
  })

  it('refuses a person who does not exist', () => {
    expect(() => add('2026-01-15', 9999, 'gram', 'acquire', 10_000, 500_000)).toThrow()
  })
})

// --- 3c ---------------------------------------------------------------------

describe('manual prices are the authority (§8.5)', () => {
  it('keeps one price per type and replaces it in place', () => {
    s3.setManualPrice(db, 'gram', 660_000)
    s3.setManualPrice(db, 'gram', 650_500)

    const prices = s3.readLedger(db).manualPrices
    expect(prices).toHaveLength(1)
    expect(prices[0]?.value).toBe(650_500)
  })

  it('timestamps every write, so the owner can see how stale their figure is', () => {
    s3.setManualPrice(db, 'gram', 650_500)
    const price = s3.readLedger(db).manualPrices[0]
    expect(price?.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('clears back to unpriced rather than to free', () => {
    s3.setManualPrice(db, 'gram', 650_500)
    s3.clearManualPrice(db, 'gram')
    expect(s3.readLedger(db).manualPrices).toHaveLength(0)

    add('2026-01-15', null, 'gram', 'acquire', 10_000, 500_000)
    const view = computeHoldings(s3.readLedger(db))
    expect(view.missingPrices).toEqual(['gram'])
    expect(view.byPerson[0]?.holdings[0]?.marketValue).toBeNull()
  })

  it('refuses a price for a type outside the closed list', () => {
    expect(() => s3.setManualPrice(db, 'altin', 650_500)).toThrow()
  })

  /** Nothing writes the live table until Realisation VII; 3c reads it now. */
  it('reads no live price, there being no provider yet', () => {
    expect(s3.readLedger(db).livePrices).toHaveLength(0)
  })
})

// --- The acceptance figures, through real rows -------------------------------

describe('the acceptance arithmetic, through real rows', () => {
  /**
   * Three acquisitions and a disposal, typed into the vault and read back out
   * through the same engine the renderer calls. The figures are the ones
   * REALISATION.md names; the rows are authored from those figures rather than
   * from the owner's retiring documents, which nothing here opens (§18.2).
   */
  it('reaches thirty grams, ₺188.000 of cost, and ₺7.150 of unrealised gain', () => {
    const kisiA = person('Kişi A')
    const kisiB = person('Kişi B')

    add('2026-01-15', kisiA, 'gram', 'acquire', 10_000, 500_000)
    add('2026-02-20', kisiA, 'gram', 'acquire', 20_000, 590_000)
    add('2026-03-10', kisiB, 'gram', 'acquire', 10_000, 700_000)
    add('2026-04-05', kisiA, 'gram', 'dispose', 10_000, 650_000)

    s3.setManualPrice(db, 'gram', 650_500)

    const data = s3.readLedger(db)
    const view = computeHoldings(data)

    expect(computeLedger(data).totals.quantityByType.get('gram')).toBe(30_000)
    expect(view.costBasis).toBe(18_800_000)
    expect(view.marketValue).toBe(19_515_000)
    expect(view.unrealised).toBe(715_000)

    const forKisiA = view.byPerson.find((e) => e.person.id === kisiA)
    const forKisiB = view.byPerson.find((e) => e.person.id === kisiB)
    expect(forKisiA?.marketValue).toBe(13_010_000)
    expect(forKisiB?.marketValue).toBe(6_505_000)

    expect(view.discrepancies).toEqual([])
  })

  it('survives a relaunch, the figures being derived rather than stored', () => {
    const kisiA = person('Kişi A')
    add('2026-01-15', kisiA, 'gram', 'acquire', 30_000, 590_000)
    s3.setManualPrice(db, 'gram', 650_500)

    const before = computeHoldings(s3.readLedger(db))

    closeDatabase(db)
    db = openDatabase(join(dir, 'jadeite.db'), dek)

    const after = computeHoldings(s3.readLedger(db))
    expect(after.costBasis).toBe(before.costBasis)
    expect(after.marketValue).toBe(before.marketValue)
  })
})
