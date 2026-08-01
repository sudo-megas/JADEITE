/**
 * Realisation IX's acceptance list — the `.jbk` container, restore, and machine
 * transfer, against real vaults.
 *
 * **Why this is in the Electron harness and not under Vitest.** The SQLCipher
 * binding is built for Electron's ABI, so anything that opens an encrypted
 * database cannot run under plain Node. Every check below opens one: a backup is
 * `VACUUM main INTO` on a keyed connection, verification opens the staged file
 * to prove the key works, and the whole of §4.4 is a statement about which key
 * is in memory at which moment. None of that has a meaning without a real vault,
 * a real Argon2id ceremony and real files on a real filesystem.
 *
 * **What is deliberately not here.** The container's byte-level parsing — a
 * mangled magic, a truncated body, a declared length that lies, a bad digest —
 * is proved in `tests/unit/jbk-container.test.ts`, where it is the subject and
 * where it costs nothing to run a hundred malformed inputs through it. This file
 * flips exactly one byte, and it flips it in a container a real vault produced,
 * because what it is proving is not that the parser refuses damage but that a
 * refusal leaves the live vault standing.
 *
 * **Private names this file reproduces rather than imports.** The restore
 * journal is `restore.journal` in the vault directory, holding
 * `{format, envelope, stamp}`, and a staged envelope is `jadeite.keys.incoming`.
 * `install.ts` keeps all three to itself, and the crash-safety check has to write
 * exactly what `commitInstall` would have written before its first rename. They
 * are restated here on purpose: a test that read them back out of the module
 * could not notice the module changing them, whereas this one fails loudly.
 */

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'
import Database from 'better-sqlite3-multiple-ciphers'
import { afterEach, beforeEach, describe, expect, it } from './harness.js'

import * as vault from '../../src/main/vault/vault.js'
import * as backup from '../../src/main/vault/backup/service.js'
import {
  PREAMBLE_BYTES,
  payloadChecksum,
  readContainer,
  writeContainer
} from '../../src/main/vault/backup/container.js'
import {
  completeInterruptedInstall,
  incomingDatabasePath,
  stageDatabase,
  stageEnvelope
} from '../../src/main/vault/backup/install.js'
import { generateDek } from '../../src/main/vault/dek.js'
import { readEnvelope } from '../../src/main/vault/envelope.js'
import { databasePath, envelopePath, vaultDirectory } from '../../src/main/vault/paths.js'
import { closeDatabase, migrate, openDatabase } from '../../src/main/vault/db/connection.js'
import { MIGRATIONS, SCHEMA_VERSION, TOUCH_SOURCES } from '../../src/main/vault/db/schema.js'
import { getSetting, seedDefaultSettings, setSetting } from '../../src/main/vault/db/settings.js'
import { isOverdue } from '../../src/main/vault/db/backup-log.js'
import { sectionStamps, vaultId } from '../../src/main/vault/db/lineage.js'
import * as s1 from '../../src/main/vault/db/section1.js'
import * as s2 from '../../src/main/vault/db/section2.js'
import * as s3 from '../../src/main/vault/db/section3.js'
import * as s4 from '../../src/main/vault/db/section4.js'
import { SETTING_KEYS } from '../../src/shared/ipc-contract.js'
import type { BackupReason, SectionKey } from '../../src/shared/backup/types.js'

const APP_VERSION = '0.9.0-acceptance'
const PASSWORD = 'yedek-ve-geri-yukleme-2026'
const NEW_PASSWORD = 'reset-sonrasi-parola-7742'
const OTHER_MACHINE_PASSWORD = 'dizustu-makine-parolasi-31'

/** The year Section 1's fixture rows live in. Fixed, so a snapshot is stable. */
const LEDGER_YEAR = 2026

/** `restore.journal`'s three fields, exactly as `commitInstall` writes them. */
const JOURNAL_NAME = 'restore.journal'
const JOURNAL_FORMAT = 1

/** Every temporary directory this test made, torn down together. */
let temporaries: string[] = []
/** The vault directory `paths.ts` is pointed at when a test begins. */
let dataHome: string
/** Where `.jbk` files are written — the archive HDD of §15, in miniature. */
let archive: string
/** Loose databases for the checks whose subject is SQL rather than a ceremony. */
let workshop: string

function newTemporary(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  temporaries.push(dir)
  return dir
}

/**
 * Point `paths.ts` at another machine's vault directory.
 *
 * `vaultDirectory()` reads the environment on every call, so this is the whole
 * of what a second machine costs. The vault module must be locked across the
 * switch — its database handle survives a path change, and an open vault plus
 * paths pointing elsewhere is a session writing into a file no test can see.
 */
function useHome(dir: string): void {
  process.env['XDG_DATA_HOME'] = dir
  process.env['JADEITE_DATA_HOME'] = dir
}

beforeEach(() => {
  temporaries = []
  dataHome = newTemporary('jadeite-backup-')
  archive = newTemporary('jadeite-archive-')
  workshop = newTemporary('jadeite-workshop-')
  useHome(dataHome)
  vault.lock()
  // The chosen container is module state in `service.ts`, held between `select`
  // and `restore`. Cleared here so no test can be handed the previous test's.
  backup.cancel()
})

afterEach(() => {
  vault.lock()
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true })
  temporaries = []
})

// --- Fixtures --------------------------------------------------------------

async function createVault(password = PASSWORD): Promise<string> {
  const created = await vault.create(password)
  expect(created.ok, 'vault creation').toBe(true)
  if (!created.ok) throw new Error('unreachable: the vault was not created')
  return created.value.recoveryKey
}

function takeBackup(name: string, reason: BackupReason = 'manual'): string {
  const destination = join(archive, name)
  const receipt = backup.create(destination, reason, APP_VERSION)
  expect(receipt.ok, `taking a backup to ${name}`).toBe(true)
  return destination
}

/** The disk dies: both of §4.1's files go, and the sidecars with them. */
function destroyVault(): void {
  vault.lock()
  for (const path of [
    databasePath(),
    `${databasePath()}-wal`,
    `${databasePath()}-shm`,
    envelopePath()
  ]) {
    if (existsSync(path)) unlinkSync(path)
  }
}

/** Where a staged envelope waits. `install.ts` keeps the name to itself. */
function incomingEnvelopePath(): string {
  return `${envelopePath()}.incoming`
}

function journalPath(): string {
  return join(vaultDirectory(), JOURNAL_NAME)
}

function litter(suffix: string): string[] {
  return readdirSync(vaultDirectory()).filter((name) => name.endsWith(suffix))
}

/** A vault opened without the ceremony — the subject is SQL, not Argon2id. */
function plainVault(name: string): DatabaseType {
  const db = openDatabase(join(workshop, name), generateDek())
  seedDefaultSettings(db)
  return db
}

/**
 * Apply the migrations up to and including `version`, and stop.
 *
 * The fourth copy of this fixture in the test tree, and copied for the reason
 * the other three record: a fixture that named an index rather than a version
 * drifted the moment a migration was appended, and silently began asserting
 * against a schema it was not written for. The database is unencrypted, as
 * `migration-suite.ts`'s is — a migration is pure SQL and knows nothing about
 * SQLCipher, so keying the fixture would test the cipher a second time and the
 * migration no better.
 */
function seededThrough(name: string, version: number): DatabaseType {
  const seeded = new Database(join(workshop, name))
  seeded.pragma('foreign_keys = ON')
  for (const migration of MIGRATIONS) {
    if (migration.version > version) break
    seeded.exec(migration.sql)
  }
  seeded.pragma(`user_version = ${version}`)
  return seeded
}

/** Real rows in all four sections, written through the modules that own them. */
function writeEverySection(db: DatabaseType): void {
  // Section 1 — a year, two columns, three cells.
  s1.createYear(db, LEDGER_YEAR)
  const salary = s1.addCategory(db, LEDGER_YEAR, {
    name: 'MAAŞ',
    kind: 'income',
    valueType: 'TRY'
  })
  const rent = s1.addCategory(db, LEDGER_YEAR, { name: 'KİRA', kind: 'expense', valueType: 'TRY' })
  s1.setEntry(db, {
    year: LEDGER_YEAR,
    month: 3,
    categoryId: salary,
    amount: 128_500_00,
    isRefund: false,
    note: 'mart'
  })
  s1.setEntry(db, {
    year: LEDGER_YEAR,
    month: 4,
    categoryId: salary,
    amount: 131_000_00,
    isRefund: false,
    note: null
  })
  s1.setEntry(db, {
    year: LEDGER_YEAR,
    month: 3,
    categoryId: rent,
    amount: 43_000_00,
    isRefund: true,
    note: null
  })

  // Section 2 — a bank column, a counter column, and cells in both.
  const akbank = s2.addBank(db, {
    name: 'Banka A',
    creditLimit: 150_000_00,
    isCounter: false,
    counterParty: null
  })
  const sayacA = s2.addBank(db, {
    name: 'Sayaç A',
    creditLimit: 0,
    isCounter: true,
    counterParty: 'Sayaç A'
  })
  s2.setCell(db, { month: 5, bankId: akbank, amount: 12_345_67 })
  s2.setCell(db, { month: 6, bankId: akbank, amount: 9_876_54 })
  s2.setCell(db, { month: 5, bankId: sayacA, amount: 2_500_00 })

  // Section 3 — a person, two ledger rows, one of each unit kind, and a price.
  // A person's colour is an accent index, not a hex string (`cleanColour`).
  const kisiA = s3.addPerson(db, { name: 'Kişi A', colour: '3' })
  s3.addTransaction(db, {
    date: '2026-02-14',
    dateProvisional: false,
    typeCode: 'ceyrek',
    direction: 'acquire',
    denomination: 1,
    count: 6,
    unitPrice: 8_450_00,
    source: 'Kapalıçarşı',
    personId: kisiA,
    note: null
  })
  s3.addTransaction(db, {
    date: '2026-03-02',
    dateProvisional: true,
    typeCode: 'gram',
    direction: 'acquire',
    denomination: 5000,
    count: 2,
    unitPrice: 4_120_00,
    source: null,
    personId: null,
    note: 'iki adet 5 g'
  })
  s3.setManualPrice(db, 'gram', 4_300_00)

  // Section 4 — boxes, including a zero, which is a figure and not an absence.
  s4.setCell(db, { slot: 0, value: 1_234_56 })
  s4.setCell(db, { slot: 1, value: 0 })
  s4.setCell(db, { slot: 11, value: 99_999_99 })
}

interface VaultSnapshot {
  workspace: unknown
  grid: unknown
  ledger: unknown
  cells: unknown
  id: string | null
  stamps: unknown
}

/** Everything the owner typed, read back through the modules that own it. */
function snapshot(db: DatabaseType): VaultSnapshot {
  return {
    workspace: s1.readWorkspace(db, LEDGER_YEAR),
    grid: s2.readGrid(db),
    ledger: s3.readLedger(db),
    cells: s4.readCells(db),
    id: vaultId(db),
    stamps: sectionStamps(db)
  }
}

// --- 1. Backup, wipe, restore ----------------------------------------------

describe('a backup restored into the space a vault left (§15)', () => {
  it('brings every row of every section back through a wipe', async () => {
    await createVault()
    writeEverySection(vault.database()!)
    const written = snapshot(vault.database()!)
    expect(written.cells, 'the fixture wrote something to lose').toHaveLength(3)

    const container = takeBackup('everything.jbk')
    destroyVault()
    expect(vault.status(), 'the disk is dead').toEqual({ exists: false, locked: true })

    const candidate = backup.select(container)
    expect(candidate.ok, 'the container reads back').toBe(true)
    if (!candidate.ok) return
    expect(candidate.value.appVersion, 'the JADEITE that wrote it').toBe(APP_VERSION)
    expect(candidate.value.schemaVersion, 'the schema it carries').toBe(SCHEMA_VERSION)
    expect(candidate.value.needsCredential, '§4.4 row 2 — no vault to lend a key').toBe(true)

    expect(await backup.restore(PASSWORD), 'the restore').toEqual({ ok: true, value: null })
    expect(await vault.unlock(PASSWORD), 'reopening what was installed').toEqual({
      ok: true,
      value: null
    })

    const after = snapshot(vault.database()!)
    expect(after.workspace, 'Section 1 — the year, its columns and its cells').toEqual(
      written.workspace
    )
    expect(after.grid, 'Section 2 — the bank columns and their amounts').toEqual(written.grid)
    expect(after.ledger, 'Section 3 — persons, ledger rows and the manual price').toEqual(
      written.ledger
    )
    expect(after.cells, 'Section 4 — every box, the zero included').toEqual(written.cells)
    expect(after.id, 'the lineage travels with the data, so this is the same vault').toEqual(
      written.id
    )
    expect(after.stamps, 'the section stamps travel with it too').toEqual(written.stamps)

    expect(
      vault.database()!.pragma('integrity_check', { simple: true }),
      'and the pages are sound'
    ).toBe('ok')
  })
})

// --- 2 and 3. §4.4 row 1 ---------------------------------------------------

/**
 * A vault whose password has been reset since its backup was taken.
 *
 * The container therefore carries recovery generation 1 and a password slot for
 * a credential that is now dead, while the vault stands at generation 2. That
 * gap is the whole subject of row 1.
 */
async function vaultResetAfterBackup(): Promise<string> {
  const firstKey = await createVault()
  s4.setCell(vault.database()!, { slot: 0, value: 111 })
  const container = takeBackup('before-the-reset.jbk')

  vault.lock()
  const reset = await vault.reset(firstKey, NEW_PASSWORD)
  expect(reset.ok, 'the reset ceremony').toBe(true)
  if (!reset.ok) throw new Error('unreachable: the reset failed')
  expect(reset.value.generation, '§4.3 issues the next key').toBe(2)
  return container
}

describe('§4.4 row 1 — a healthy vault opens every backup it ever made', () => {
  it('opens one taken under a password that has since been killed', async () => {
    const container = await vaultResetAfterBackup()

    // The old password really is dead — otherwise this check proves nothing.
    vault.lock()
    expect(await vault.unlock(PASSWORD), 'the backup-time password').toEqual({
      ok: false,
      error: 'WRONG_CREDENTIAL'
    })
    expect(await vault.unlock(NEW_PASSWORD), 'the password in force now').toEqual({
      ok: true,
      value: null
    })

    // Written after the backup, so a restore that did nothing would be visible.
    s4.setCell(vault.database()!, { slot: 1, value: 222 })

    const candidate = backup.select(container)
    expect(candidate.ok).toBe(true)
    if (!candidate.ok) return
    expect(candidate.value.sameVault, 'the container is this vault’s own').toBe(true)
    expect(
      candidate.value.needsCredential,
      'the app holds the DEK, so old passwords are irrelevant'
    ).toBe(false)
    expect(
      candidate.value.recoveryGeneration,
      'the container carries the envelope of its own moment'
    ).toBe(1)

    const status = backup.status()
    expect(status.ok && status.value.recoveryGeneration, 'while the vault has moved on').toBe(2)

    expect(await backup.restore(null), 'no credential asked for, and none given').toEqual({
      ok: true,
      value: null
    })

    expect(await vault.unlock(NEW_PASSWORD)).toEqual({ ok: true, value: null })
    expect(
      s4.readCells(vault.database()!),
      'the backup’s state, not the state that replaced it'
    ).toEqual([{ slot: 0, value: 111 }])
  })

  it('keeps the credentials in force now, not the ones the container carried', async () => {
    const container = await vaultResetAfterBackup()

    const candidate = backup.select(container)
    expect(candidate.ok && candidate.value.needsCredential).toBe(false)
    expect(await backup.restore(null)).toEqual({ ok: true, value: null })

    // The database was installed; the envelope beside it was not. Restoring last
    // month's data must not silently reinstate last month's password.
    expect(readEnvelope()?.recovery.generation, 'the envelope was left alone').toBe(2)
    expect(await vault.unlock(PASSWORD), 'the backup-time password stays dead').toEqual({
      ok: false,
      error: 'WRONG_CREDENTIAL'
    })
    expect(await vault.unlock(NEW_PASSWORD), 'the current password still opens it').toEqual({
      ok: true,
      value: null
    })
    expect(s4.readCells(vault.database()!)).toEqual([{ slot: 0, value: 111 }])
  })
})

// --- 4. §4.4 row 2 ---------------------------------------------------------

describe('§4.4 row 2 — the disk-death path', () => {
  it('needs the credential that was current when the backup was taken', async () => {
    const firstKey = await createVault()
    s4.setCell(vault.database()!, { slot: 3, value: 999 })
    const container = takeBackup('older-credentials.jbk')

    // The vault moves on to a second generation, and then dies. What opens the
    // container is what was current when it was written, not what came after.
    vault.lock()
    const reset = await vault.reset(firstKey, NEW_PASSWORD)
    expect(reset.ok).toBe(true)
    destroyVault()

    const candidate = backup.select(container)
    expect(candidate.ok).toBe(true)
    if (!candidate.ok) return
    expect(candidate.value.needsCredential).toBe(true)
    expect(candidate.value.sameVault, 'there is no vault here to be the same as').toBe(false)

    expect(await backup.restore(null), 'a credential is not optional here').toEqual({
      ok: false,
      error: 'CREDENTIAL_REQUIRED'
    })
    expect(await backup.restore(''), 'nor is an empty one a credential').toEqual({
      ok: false,
      error: 'CREDENTIAL_REQUIRED'
    })
    expect(await backup.restore(NEW_PASSWORD), 'the password that came after it').toEqual({
      ok: false,
      error: 'WRONG_CREDENTIAL'
    })
    expect(await backup.restore(PASSWORD), 'the password of the moment it was taken').toEqual({
      ok: true,
      value: null
    })

    expect(await vault.unlock(PASSWORD), 'and that is what opens the vault afterwards').toEqual({
      ok: true,
      value: null
    })
    expect(readEnvelope()?.recovery.generation, 'the container’s envelope was installed').toBe(1)
    expect(s4.readCells(vault.database()!)).toEqual([{ slot: 3, value: 999 }])
  })

  it('accepts the recovery key as that credential, and does not consume it', async () => {
    const recoveryKey = await createVault()
    s4.setCell(vault.database()!, { slot: 7, value: 4242 })
    const container = takeBackup('recovery-key.jbk')
    destroyVault()

    const candidate = backup.select(container)
    expect(candidate.ok && candidate.value.needsCredential).toBe(true)
    expect(await backup.restore(recoveryKey), '§4.4 says "password or recovery key"').toEqual({
      ok: true,
      value: null
    })

    expect(await vault.unlock(PASSWORD), 'the restored vault is the one that was sealed').toEqual({
      ok: true,
      value: null
    })
    expect(s4.readCells(vault.database()!)).toEqual([{ slot: 7, value: 4242 }])
    vault.lock()

    // §4.3 consumes a recovery key on *reset*, and this was not one: nothing was
    // re-wrapped and no new key was issued. The owner who restores with the card
    // off their desk still holds it, and still has to run the reset ceremony to
    // set a password they know.
    const reset = await vault.reset(recoveryKey, NEW_PASSWORD)
    expect(reset.ok, 'the same key still runs the reset ceremony').toBe(true)
    if (!reset.ok) return
    expect(reset.value.generation, 'and only now is it spent').toBe(2)
  })
})

// --- 5. A wrong credential -------------------------------------------------

describe('a wrong credential fails cleanly and changes nothing', () => {
  it('refuses, stages nothing that outlives it, and leaves the vault standing', async () => {
    await createVault()
    s4.setCell(vault.database()!, { slot: 2, value: 5150 })
    const container = takeBackup('own.jbk')

    // Locked, so `select` finds no database to read a lineage out of. A vault
    // cannot recognise even its own container while it is shut — which is worth
    // stating, because it is the reason `sameVault` is false below.
    vault.lock()

    const candidate = backup.select(container)
    expect(candidate.ok).toBe(true)
    if (!candidate.ok) return
    expect(candidate.value.sameVault, 'a locked vault has no id to compare with').toBe(false)
    expect(candidate.value.needsCredential).toBe(true)

    expect(await backup.restore('not the password at all')).toEqual({
      ok: false,
      error: 'WRONG_CREDENTIAL'
    })

    expect(litter('.incoming'), 'a refused restore leaves nothing staged').toHaveLength(0)
    expect(litter('.tmp'), 'nor a half-written temporary').toHaveLength(0)
    expect(
      readdirSync(vaultDirectory()).sort(),
      'the data directory still holds exactly §4.1’s two files'
    ).toEqual(['jadeite.db', 'jadeite.keys'])

    expect(await vault.unlock(PASSWORD), 'the vault on disk is untouched').toEqual({
      ok: true,
      value: null
    })
    expect(s4.readCells(vault.database()!)).toEqual([{ slot: 2, value: 5150 }])
    expect(readEnvelope()?.recovery.generation, 'and so is its envelope').toBe(1)
  })
})

// --- 6. A corrupted container ----------------------------------------------

describe('a corrupted container is refused without partial application', () => {
  it('flips one byte of a real backup and loses nothing', async () => {
    await createVault()
    writeEverySection(vault.database()!)
    const before = snapshot(vault.database()!)
    const container = takeBackup('sound.jbk')

    const bytes = readFileSync(container)
    const sound = readContainer(bytes, SCHEMA_VERSION)
    expect(sound.ok, 'the backup this vault wrote is readable to begin with').toBe(true)
    if (!sound.ok) return

    // The middle of the database, not of the file: the header sits in front of
    // it and a flip there would be a different rejection.
    const payloadStart = bytes.length - sound.value.payload.length
    expect(
      payloadStart > PREAMBLE_BYTES,
      'the payload begins after the preamble and a header of some length'
    ).toBe(true)
    const middle = payloadStart + Math.floor(sound.value.payload.length / 2)
    bytes[middle] = (bytes[middle] ?? 0) ^ 0xff

    const damaged = join(archive, 'damaged.jbk')
    writeFileSync(damaged, bytes)

    expect(backup.select(damaged), 'the digest over the payload disagrees').toEqual({
      ok: false,
      error: 'DAMAGED'
    })

    expect(vault.isUnlocked(), 'a refused candidate does not touch the session').toBe(true)
    expect(litter('.incoming'), 'nor stage anything').toHaveLength(0)

    vault.lock()
    expect(await vault.unlock(PASSWORD), 'the live vault still opens').toEqual({
      ok: true,
      value: null
    })
    const after = snapshot(vault.database()!)
    expect(after.workspace, 'Section 1 intact').toEqual(before.workspace)
    expect(after.grid, 'Section 2 intact').toEqual(before.grid)
    expect(after.ledger, 'Section 3 intact').toEqual(before.ledger)
    expect(after.cells, 'Section 4 intact').toEqual(before.cells)
  })
})

// --- 7. A foreign vault ----------------------------------------------------

describe('a foreign vault’s backup is a machine transfer (§15)', () => {
  it('names it as another lineage and demands that lineage’s credential', async () => {
    // The laptop.
    const laptop = newTemporary('jadeite-laptop-')
    useHome(laptop)
    await createVault(OTHER_MACHINE_PASSWORD)
    s4.setCell(vault.database()!, { slot: 0, value: 6161 })
    const laptopId = vaultId(vault.database()!)
    const foreign = takeBackup('from-the-laptop.jbk')
    vault.lock()

    // The rig, open, with a vault of its own.
    useHome(dataHome)
    await createVault(PASSWORD)
    s4.setCell(vault.database()!, { slot: 0, value: 1212 })
    const rigId = vaultId(vault.database()!)
    const own = takeBackup('from-the-rig.jbk')

    expect(String(rigId), 'two vaults, two lineages').not.toBe(String(laptopId))

    const mine = backup.select(own)
    expect(mine.ok && mine.value.sameVault, 'its own container, for contrast').toBe(true)
    expect(mine.ok && mine.value.needsCredential).toBe(false)

    const theirs = backup.select(foreign)
    expect(theirs.ok).toBe(true)
    if (!theirs.ok) return
    expect(theirs.value.sameVault, 'a different vault_id').toBe(false)
    expect(theirs.value.needsCredential, 'so a transfer proves a credential').toBe(true)

    // And the credential it proves is the other machine's, not this one's — the
    // DEK in memory here cannot speak for a vault it never sealed.
    expect(await backup.restore(PASSWORD), 'this machine’s own password').toEqual({
      ok: false,
      error: 'WRONG_CREDENTIAL'
    })
    expect(await backup.restore(OTHER_MACHINE_PASSWORD)).toEqual({ ok: true, value: null })

    expect(await vault.unlock(OTHER_MACHINE_PASSWORD)).toEqual({ ok: true, value: null })
    expect(s4.readCells(vault.database()!), 'the laptop’s figures are here now').toEqual([
      { slot: 0, value: 6161 }
    ])
    expect(vaultId(vault.database()!), 'and so is the laptop’s lineage').toBe(laptopId)
  })
})

// --- 8. A container from a newer JADEITE -----------------------------------

describe('a container from the future is refused', () => {
  /**
   * Why this matters more than it looks.
   *
   * `migrate()` walks forward only: it applies every migration *newer* than the
   * database's `user_version` and silently ignores a version it has never heard
   * of. So a container written by a JADEITE two schema versions ahead would open
   * here, run no migrations at all, and present a database this build reads with
   * the wrong idea of what its tables mean — with no error anywhere. That is
   * precisely the rig-to-laptop case backups exist for, and the laptop is the
   * machine most likely to be a release behind.
   */
  it('refuses a schemaVersion this build has never heard of', async () => {
    await createVault()
    s4.setCell(vault.database()!, { slot: 0, value: 1 })
    const container = takeBackup('current.jbk')

    const bytes = readFileSync(container)
    const sound = readContainer(bytes, SCHEMA_VERSION)
    expect(sound.ok).toBe(true)
    if (!sound.ok) return

    // Re-sealed unchanged first, so the refusal below cannot be blamed on the
    // act of re-sealing.
    const resealed = join(archive, 'resealed.jbk')
    writeFileSync(resealed, writeContainer(sound.value.header, sound.value.payload))
    const control = backup.select(resealed)
    expect(control.ok, 'a container re-sealed at this version still opens').toBe(true)
    expect(control.ok && control.value.schemaVersion).toBe(SCHEMA_VERSION)

    const future = join(archive, 'from-the-future.jbk')
    writeFileSync(
      future,
      writeContainer(
        { ...sound.value.header, schemaVersion: SCHEMA_VERSION + 1 },
        sound.value.payload
      )
    )

    expect(backup.select(future), 'update JADEITE, do not open this').toEqual({
      ok: false,
      error: 'FUTURE_SCHEMA'
    })
  })
})

// --- 9. Crash-safety of the two-file swap ----------------------------------

describe('the two-file swap survives being interrupted', () => {
  /**
   * A vault is two files and no filesystem renames two files as one act, so the
   * renames are made replayable rather than atomic. The interruption is
   * simulated by hand rather than by killing a process: the point is the state
   * on disk, and a hand-built state is the one that can be built exactly.
   *
   * What is *not* simulated is `commitInstall`'s `.replaced-<stamp>` copies,
   * which it makes after the journal and before the first rename. Recovery never
   * looks at them, so their absence changes nothing here — said so it is not
   * mistaken for an oversight.
   */
  it('finishes an install caught between the envelope and the database', async () => {
    const laptop = newTemporary('jadeite-laptop-')
    useHome(laptop)
    await createVault(OTHER_MACHINE_PASSWORD)
    s4.setCell(vault.database()!, { slot: 9, value: 3131 })
    const foreign = takeBackup('transfer.jbk')
    vault.lock()

    useHome(dataHome)
    await createVault(PASSWORD)
    s4.setCell(vault.database()!, { slot: 1, value: 1 })
    vault.lock()

    const sound = readContainer(readFileSync(foreign), SCHEMA_VERSION)
    expect(sound.ok).toBe(true)
    if (!sound.ok) return

    // What `restore` does before it commits anything.
    stageDatabase(sound.value.payload)
    stageEnvelope(sound.value.header.envelope)

    // What `commitInstall` flushes before its first rename. Its presence is what
    // licenses the replay below.
    const stamp = '2026-07-31T09-15-00-000Z'
    writeFileSync(
      journalPath(),
      `${JSON.stringify({ format: JOURNAL_FORMAT, envelope: true, stamp })}\n`
    )

    // The power goes here — after one rename and before the other.
    renameSync(incomingEnvelopePath(), envelopePath())

    // This is the "useless pair" install.ts exists to prevent: the new envelope
    // over the old database. It yields a key, and the key opens nothing.
    expect(await vault.unlock(OTHER_MACHINE_PASSWORD), 'a half-installed vault opens for nobody')
      .toEqual({ ok: false, error: 'WRONG_CREDENTIAL' })

    expect(completeInterruptedInstall(), 'the journal licenses the replay').toBe('completed')
    expect(existsSync(incomingDatabasePath()), 'the staged database was applied').toBe(false)
    expect(existsSync(journalPath()), 'and the journal cleared').toBe(false)

    expect(await vault.unlock(OTHER_MACHINE_PASSWORD), 'the transfer completed').toEqual({
      ok: true,
      value: null
    })
    expect(s4.readCells(vault.database()!)).toEqual([{ slot: 9, value: 3131 }])
    expect(
      vault.database()!.pragma('integrity_check', { simple: true }),
      'on a sound database'
    ).toBe('ok')
    vault.lock()

    expect(completeInterruptedInstall(), 'and running it again undoes nothing').toBe('none')
    expect(await vault.unlock(OTHER_MACHINE_PASSWORD)).toEqual({ ok: true, value: null })
  })

  it('sweeps staged files that no journal ever licensed', async () => {
    await createVault()
    s4.setCell(vault.database()!, { slot: 0, value: 77 })
    const envelope = readEnvelope()
    expect(envelope === null, 'the vault has an envelope to stage').toBe(false)
    vault.lock()

    // A crash during verification: staged, never journalled, so no rename was
    // ever begun and the data directory is meant to hold two files (§4.1).
    stageDatabase(Buffer.from('never got as far as a journal'))
    if (envelope) stageEnvelope(envelope)
    expect(litter('.incoming'), 'both halves are staged').toHaveLength(2)

    expect(completeInterruptedInstall(), 'no journal, so nothing to replay').toBe('swept')
    expect(litter('.incoming'), 'and the litter is gone').toHaveLength(0)
    expect(readdirSync(vaultDirectory()).sort()).toEqual(['jadeite.db', 'jadeite.keys'])

    expect(await vault.unlock(PASSWORD), 'the vault it never replaced still opens').toEqual({
      ok: true,
      value: null
    })
    expect(s4.readCells(vault.database()!)).toEqual([{ slot: 0, value: 77 }])
  })

  it('has nothing to do on a machine that has never restored anything', async () => {
    await createVault()
    vault.lock()

    expect(completeInterruptedInstall(), 'no journal and nothing staged').toBe('none')
    expect(completeInterruptedInstall(), 'idempotent').toBe('none')
    expect(readdirSync(vaultDirectory()).sort()).toEqual(['jadeite.db', 'jadeite.keys'])

    // And on a machine with no vault directory at all — first run, before the
    // ceremony, which is where `main/index.ts` calls this.
    useHome(newTemporary('jadeite-first-run-'))
    expect(existsSync(vaultDirectory())).toBe(false)
    expect(completeInterruptedInstall(), 'a first run is not an interrupted install').toBe('none')
  })
})

// --- 10. The backup log and the reminder -----------------------------------

describe('the vault records what it has backed up (§15)', () => {
  it('counts them, names the newest, and keeps the destination to itself', async () => {
    await createVault()
    const fresh = backup.status()
    expect(fresh.ok).toBe(true)
    if (!fresh.ok) return
    expect(fresh.value, 'a vault that has never been backed up').toEqual({
      lastBackupAt: null,
      count: 0,
      reminderDays: null,
      overdue: false,
      recoveryGeneration: 1
    })

    const first = backup.create(join(archive, 'one.jbk'), 'manual', APP_VERSION)
    const second = backup.create(join(archive, 'two.jbk'), 'credential-change', APP_VERSION)
    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return

    const after = backup.status()
    expect(after.ok).toBe(true)
    if (!after.ok) return
    expect(after.value.count, 'two backups recorded').toBe(2)
    expect(after.value.lastBackupAt, 'the newest of them').toBe(second.value.createdAt)

    const rows = vault
      .database()!
      .prepare('SELECT created_at, destination, checksum, reason FROM backup_log ORDER BY id')
      .all() as { created_at: string; destination: string; checksum: string; reason: string }[]
    expect(rows).toHaveLength(2)
    expect(rows[0]?.destination, 'where it went, kept in the main process').toBe(
      join(archive, 'one.jbk')
    )
    expect(rows[0]?.reason).toBe('manual')
    expect(rows[1]?.reason, '§4.4’s mandated post-credential-change backup').toBe(
      'credential-change'
    )
    expect(rows[0]?.created_at).toBe(first.value.createdAt)

    // The recorded checksum is the digest of the database inside the file, which
    // is what lets the owner compare a container against the log by hand.
    const sound = readContainer(readFileSync(join(archive, 'one.jbk')), SCHEMA_VERSION)
    expect(sound.ok).toBe(true)
    if (sound.ok) expect(rows[0]?.checksum).toBe(payloadChecksum(sound.value.payload))

    expect(first.value.sizeBytes, 'the receipt describes the file on disk').toBe(
      statSync(join(archive, 'one.jbk')).size
    )
  })

  it('answers LOCKED rather than an empty status', async () => {
    await createVault()
    vault.lock()
    expect(backup.status()).toEqual({ ok: false, error: 'LOCKED' })
    expect(backup.create(join(archive, 'nope.jbk'), 'manual', APP_VERSION)).toEqual({
      ok: false,
      error: 'LOCKED'
    })
    expect(existsSync(join(archive, 'nope.jbk')), 'and writes nothing').toBe(false)
  })

  it('turns the cadence into a reminder, and a backup into silence', async () => {
    await createVault()
    setSetting(vault.database()!, SETTING_KEYS.backupReminderDays, '7')

    const chosen = backup.status()
    expect(chosen.ok).toBe(true)
    if (!chosen.ok) return
    expect(chosen.value.reminderDays).toBe(7)
    expect(chosen.value.overdue, 'never backed up, and a cadence chosen').toBe(true)

    takeBackup('now.jbk', 'reminder')
    const settled = backup.status()
    expect(settled.ok && settled.value.overdue, 'and now it has been').toBe(false)
  })

  it('reads the cadence as off when it is absent or nonsense', async () => {
    await createVault()
    const db = vault.database()!
    setSetting(db, SETTING_KEYS.backupReminderDays, 'sometimes')
    const nonsense = backup.status()
    expect(nonsense.ok && nonsense.value.reminderDays).toBeNull()
    expect(nonsense.ok && nonsense.value.overdue, 'nonsense must not become a nag').toBe(false)

    setSetting(db, SETTING_KEYS.backupReminderDays, '0')
    const zero = backup.status()
    expect(zero.ok && zero.value.reminderDays).toBeNull()
  })

  /**
   * The reminder rule itself, stated as a table.
   *
   * `isOverdue` is pure and would ordinarily live under Vitest; it is here
   * because "periodic reminder setting" is a line on Realisation IX's acceptance
   * list and the two halves of it — the setting and the rule — are worth reading
   * in one place.
   */
  it('is overdue the moment a cadence is chosen, and never when there is none', () => {
    const now = new Date('2026-07-31T12:00:00.000Z')

    expect(
      isOverdue({ lastBackupAt: null, count: 0 }, 7, now),
      'a vault that has never been backed up is the state the reminder is for'
    ).toBe(true)
    expect(
      isOverdue({ lastBackupAt: null, count: 0 }, null, now),
      'a null cadence is the owner turning reminders off'
    ).toBe(false)
    expect(
      isOverdue({ lastBackupAt: '2026-07-30T12:00:00.000Z', count: 1 }, 7, now),
      'one day into a week'
    ).toBe(false)
    expect(
      isOverdue({ lastBackupAt: '2026-07-24T12:00:00.000Z', count: 1 }, 7, now),
      'exactly the cadence, to the millisecond'
    ).toBe(true)
    expect(
      isOverdue({ lastBackupAt: 'the day before yesterday', count: 1 }, 7, now),
      'an unreadable stamp is overdue rather than quietly never'
    ).toBe(true)
  })
})

// --- 11. Schema v5 ---------------------------------------------------------

describe('schema v5 — the vault’s identity', () => {
  it('mints sixteen random bytes once and never changes them', async () => {
    await createVault()
    const id = vaultId(vault.database()!)
    expect(String(id), 'thirty-two lower-case hex characters').toMatch(/^[0-9a-f]{32}$/)

    vault.lock()
    expect(await vault.unlock(PASSWORD)).toEqual({ ok: true, value: null })
    expect(vaultId(vault.database()!), 'stable across a lock and an unlock').toBe(id)
  })

  it('gives two vaults two different ids', () => {
    const a = plainVault('lineage-a.db')
    const b = plainVault('lineage-b.db')
    try {
      const first = vaultId(a)
      const second = vaultId(b)
      expect(String(first)).toMatch(/^[0-9a-f]{32}$/)
      expect(String(second)).toMatch(/^[0-9a-f]{32}$/)
      expect(first, 'randomblob(16), per vault').not.toBe(second)
    } finally {
      closeDatabase(a)
      closeDatabase(b)
    }
  })
})

describe('schema v5 — the section stamps', () => {
  it('installs a stamping trigger on every owner-edited table and on no other', () => {
    const db = plainVault('triggers.db')
    try {
      const triggers = db
        .prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'trigger' ORDER BY name")
        .all() as { name: string; sql: string }[]
      expect(triggers, 'nine owner-edited tables, three events apiece').toHaveLength(27)

      for (const [table, section] of TOUCH_SOURCES) {
        for (const suffix of ['ai', 'au', 'ad']) {
          const name = `touch_${table}_${suffix}`
          const trigger = triggers.find((t) => t.name === name)
          expect(trigger === undefined, `${name} should exist`).toBe(false)
          // SQL cannot import, so the migration repeats the key literally. This
          // is the assertion that the two homes of that string agree — a typo in
          // either one would otherwise stamp a setting nothing ever reads.
          expect(
            trigger?.sql ?? '',
            `${name} should write ${SETTING_KEYS.sectionTouchedAt[section as SectionKey]}`
          ).toContain(`'${SETTING_KEYS.sectionTouchedAt[section as SectionKey]}'`)
        }
      }

      // The tables deliberately absent from TOUCHED_BY. §14's writer runs on a
      // timer and the stamp answers "which machine has the newer work", a
      // question a background fetch has no opinion about.
      for (const table of [
        's3_prices_live',
        's3_price_fetch',
        'valuable_types',
        'settings',
        'backup_log'
      ]) {
        expect(
          triggers.some((t) => t.name.startsWith(`touch_${table}_`)),
          `${table} must not stamp a section`
        ).toBe(false)
      }
    } finally {
      closeDatabase(db)
    }
  })

  it('stamps the section that was edited, and only that one', () => {
    // A fixture of its own: anything that writes a year or a category stamps s1,
    // and this check is that s1 stays untouched.
    const db = plainVault('stamps.db')
    try {
      expect(sectionStamps(db), 'a fresh vault has recorded no edit').toEqual({
        s1: null,
        s2: null,
        s3: null,
        s4: null
      })

      s4.setCell(db, { slot: 0, value: 500 })
      const inserted = sectionStamps(db)
      expect(
        String(inserted.s4),
        'an ISO-8601 instant, so a merge chooser can compare two of them'
      ).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      expect(Number.isFinite(Date.parse(String(inserted.s4))), 'and parse it').toBe(true)
      expect(inserted.s1, 'Section 1 was not edited').toBeNull()
      expect(inserted.s2, 'nor Section 2').toBeNull()
      expect(inserted.s3, 'nor Section 3').toBeNull()

      // The delete trigger, which an insert-only check would never reach.
      setSetting(db, SETTING_KEYS.sectionTouchedAt.s4, 'not a real stamp')
      s4.setCell(db, { slot: 0, value: null })
      expect(getSetting(db, SETTING_KEYS.sectionTouchedAt.s4), 'emptying a box is an edit').not.toBe(
        'not a real stamp'
      )
      expect(sectionStamps(db).s1, 'and still not Section 1').toBeNull()
    } finally {
      closeDatabase(db)
    }
  })

  it('does not stamp Section 3 for a live price, and does for a manual one', () => {
    const db = plainVault('prices.db')
    try {
      // Inserted directly rather than through `appendSnapshot`, whose dedup can
      // legitimately write nothing — and a stamp that stayed null because no row
      // was written would pass this for the wrong reason.
      db.prepare(
        `INSERT INTO s3_prices_live (type_code, value, fetched_at, provider)
              VALUES ('gram', 430000, '2026-07-31T10:00:00.000Z', 'haremaltin')`
      ).run()
      db.prepare(
        `INSERT INTO s3_price_fetch (id, provider, attempted_at, outcome, succeeded_at)
              VALUES (1, 'haremaltin', '2026-07-31T10:00:00.000Z', 'ok', '2026-07-31T10:00:00.000Z')`
      ).run()
      expect(
        db.prepare('SELECT count(*) AS n FROM s3_prices_live').get(),
        'the row really landed, so the stamp below has something to have ignored'
      ).toEqual({ n: 1 })

      expect(
        sectionStamps(db).s3,
        '§14 writes on a timer; a background fetch is not the owner editing Varlıklar'
      ).toBeNull()

      // And the exclusion is targeted rather than Section 3's triggers being
      // broken: the owner's own price stamps it at once.
      s3.setManualPrice(db, 'gram', 4_300_00)
      expect(sectionStamps(db).s3, 'a manual price is an edit').not.toBeNull()
      expect(sectionStamps(db).s1, 'and it stamps nothing else').toBeNull()
    } finally {
      closeDatabase(db)
    }
  })
})

// --- 12. A v4 vault reaching v5 --------------------------------------------

describe('a vault migrated from v4 to v5', () => {
  it('mints an id and backfills no timestamps', () => {
    const db = seededThrough('v4.db', 4)
    try {
      // Rows typed before the triggers existed. Their edit times are unknowable,
      // and inventing one would be a fabrication carried in every container the
      // vault ever writes.
      db.prepare('INSERT INTO years (year, created_at) VALUES (2026, ?)').run(
        '2026-01-01T00:00:00.000Z'
      )
      db.prepare('INSERT INTO s4_cells (slot, value) VALUES (0, 4242)').run()
      expect(db.pragma('user_version', { simple: true })).toBe(4)
      expect(getSetting(db, SETTING_KEYS.vaultId), 'a v4 vault has no lineage').toBeNull()

      expect(migrate(db), 'the upgrade runs').toBe(SCHEMA_VERSION)

      expect(String(vaultId(db)), 'and mints one').toMatch(/^[0-9a-f]{32}$/)
      expect(sectionStamps(db), 'nothing recorded an edit time before the triggers existed').toEqual(
        { s1: null, s2: null, s3: null, s4: null }
      )
      expect(db.prepare('SELECT slot, value FROM s4_cells').all(), 'the rows are untouched').toEqual(
        [{ slot: 0, value: 4242 }]
      )

      // The first edit after the upgrade is the first thing there is to record.
      s4.setCell(db, { slot: 1, value: 7 })
      expect(sectionStamps(db).s4).not.toBeNull()
      expect(sectionStamps(db).s1, 'and it still stamps only its own section').toBeNull()
    } finally {
      closeDatabase(db)
    }
  })

  it('keeps the id a restored vault already carries', () => {
    const db = seededThrough('v4-restored.db', 4)
    try {
      // A vault restored from a backup arrives with its lineage already in the
      // settings table, and `INSERT OR IGNORE` is what lets it keep it: the id
      // names the lineage, not the file.
      const carried = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
      db.prepare("INSERT INTO settings (key, value) VALUES ('vault_id', ?)").run(carried)

      expect(migrate(db)).toBe(SCHEMA_VERSION)
      expect(vaultId(db), 'the migration did not mint a second one over it').toBe(carried)
    } finally {
      closeDatabase(db)
    }
  })
})

// --- 13. Two defects found by this suite -----------------------------------

/**
 * Both of these shipped in the first cut of Realisation IX and were found by
 * writing the acceptance list rather than by reading the code. They are kept
 * as their own block because neither belongs to a §-numbered acceptance line —
 * they are the line *behind* several of them, which is that a refusal must
 * leave nothing behind and a replay must be as safe as the path it replays.
 */
describe('a rejection leaves nothing armed behind it', () => {
  it('forgets the candidate that was chosen before a refused one', async () => {
    await createVault()
    s4.setCell(vault.database()!, { slot: 0, value: 1234 })
    const sound = takeBackup('first-choice.jbk')

    // A second figure, written after that backup was sealed. If the stale
    // candidate survives the refusal below, this is what disappears.
    s4.setCell(vault.database()!, { slot: 1, value: 5678 })

    expect(backup.select(sound).ok, 'the good container is chosen first').toBe(true)

    const damaged = join(archive, 'second-choice.jbk')
    const bytes = readFileSync(sound)
    const tail = bytes.length - 1
    bytes[tail] = (bytes[tail] ?? 0) ^ 0xff
    writeFileSync(damaged, bytes)

    expect(backup.select(damaged), 'and the second choice is refused').toEqual({
      ok: false,
      error: 'DAMAGED'
    })

    // The renderer has been told the file is damaged. A confirmation sent
    // anyway must not install the container chosen two steps ago — that would
    // be a restore of the wrong backup, reported as a success.
    expect(await backup.restore(null), 'there is nothing left to confirm').toEqual({
      ok: false,
      error: 'NO_CANDIDATE'
    })

    expect(s4.readCells(vault.database()!), 'and both figures are still here').toEqual([
      { slot: 0, value: 1234 },
      { slot: 1, value: 5678 }
    ])
  })
})

describe('the replay is as careful with sidecars as the install it finishes', () => {
  it('drops a -wal belonging to the database it is about to replace', async () => {
    await createVault()
    s4.setCell(vault.database()!, { slot: 0, value: 4321 })
    const container = takeBackup('for-replay.jbk')

    const read = readContainer(readFileSync(container), SCHEMA_VERSION)
    expect(read.ok, 'the container is sound').toBe(true)
    if (!read.ok) return

    vault.lock()

    // A crash left the outgoing database's write-ahead log beside it. Its
    // pages describe a file that is about to be replaced; replayed into the
    // arriving one they would produce a database that passes integrity_check
    // and holds rows the backup never contained.
    writeFileSync(`${databasePath()}-wal`, Buffer.alloc(64, 0x5a))
    writeFileSync(`${databasePath()}-shm`, Buffer.alloc(32, 0x5a))

    stageDatabase(read.value.payload)
    writeFileSync(
      journalPath(),
      `${JSON.stringify({ format: JOURNAL_FORMAT, envelope: false, stamp: 'replay-case' })}\n`
    )

    expect(completeInterruptedInstall()).toBe('completed')

    expect(
      existsSync(`${databasePath()}-wal`),
      'the outgoing log went with the database it belonged to'
    ).toBe(false)
    expect(existsSync(`${databasePath()}-shm`)).toBe(false)
    expect(litter('.incoming'), 'and nothing is left staged').toHaveLength(0)

    expect(await vault.unlock(PASSWORD), 'the finished vault opens').toEqual({
      ok: true,
      value: null
    })
    expect(
      vault.database()!.pragma('integrity_check', { simple: true }),
      'and is sound'
    ).toBe('ok')
    expect(s4.readCells(vault.database()!), 'and holds exactly what the container held').toEqual([
      { slot: 0, value: 4321 }
    ])
  })

  it('leaves a -wal alone once the rename it was owed has happened', async () => {
    await createVault()
    s4.setCell(vault.database()!, { slot: 0, value: 99 })
    vault.lock()

    // The journal survived but both renames completed — the database on disk is
    // the one that was just installed, and a log beside it now holds committed
    // work of its own. Tidying it away would discard the owner's rows to fix a
    // problem that is no longer there.
    const wal = Buffer.alloc(48, 0x11)
    writeFileSync(`${databasePath()}-wal`, wal)
    writeFileSync(
      journalPath(),
      `${JSON.stringify({ format: JOURNAL_FORMAT, envelope: false, stamp: 'already-done' })}\n`
    )

    expect(completeInterruptedInstall()).toBe('completed')

    expect(existsSync(`${databasePath()}-wal`), 'the log stayed').toBe(true)
    expect(readFileSync(`${databasePath()}-wal`), 'untouched').toEqual(wal)
    expect(existsSync(journalPath()), 'and the journal is cleared either way').toBe(false)
  })
})
