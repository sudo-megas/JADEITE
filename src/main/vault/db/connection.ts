/**
 * The encrypted database connection.
 *
 * The DEK is handed to SQLCipher raw, as a 64-character hex literal, so
 * SQLCipher runs no second key derivation over a key Argon2id already
 * stretched. Cipher and format are pinned explicitly rather than left to the
 * library's defaults: a dependency upgrade must never shift the on-disk format
 * out from under a vault that already exists.
 */

import { chmodSync } from 'node:fs'
import Database from 'better-sqlite3-multiple-ciphers'
import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'
import { MIGRATIONS } from './schema.js'

/** Pinned for the life of the format. Verified against Electron 42 at v0.1. */
const CIPHER = 'sqlcipher'
const CIPHER_LEGACY = 4

export class WrongKeyError extends Error {
  constructor() {
    super('vault key rejected')
    this.name = 'WrongKeyError'
  }
}

function applyKey(db: DatabaseType, dek: Buffer): void {
  const hex = dek.toString('hex')
  try {
    db.pragma(`cipher='${CIPHER}'`)
    db.pragma(`legacy=${CIPHER_LEGACY}`)
    db.pragma(`key="x'${hex}'"`)
  } finally {
    // The hex string is an unavoidable copy of the key outside a Buffer, and
    // JavaScript strings cannot be wiped — "short-lived" describes the local
    // variable's scope, not the memory it occupies. Once this function
    // returns, `hex` (and the `key="x'...'"` pragma string built from it) are
    // unreferenced but not necessarily reclaimed: they persist in the V8 heap
    // until garbage collection happens to run, which may be long after
    // `vault.lock()` has zeroised the Buffer this was copied from and the
    // vault is believed shut. A process inspector or a heap/core dump taken
    // in that window can still recover the key from this string even though
    // the Buffer it came from is already wiped. There is no fix available in
    // JavaScript for this specific copy; the control that actually closes the
    // exposure is disabling the Electron fuse that lets a debugger attach to
    // this process at all (see `electron-builder.yml`'s `electronFuses`).
  }
}

/**
 * Narrow the database file to owner-only, the way every other file this
 * application writes already is.
 *
 * SQLite creates the database itself, at its compiled-in
 * `SQLITE_DEFAULT_FILE_PERMISSIONS` of 0644 masked by the umask, and no code
 * downstream ever narrowed it — so a freshly created vault's database was
 * world-readable while its envelope, `config.json`, the restore journal and an
 * exported `.jbk` were all 0600. The restore path made the inconsistency plain:
 * it stages the database through `writeFileAtomic` at 0600 and renames it into
 * place, so the same file had two different modes depending on whether it was
 * created or restored.
 *
 * Called on every open rather than only at creation, because a vault made by an
 * earlier version is already 0644 on disk and would otherwise stay that way for
 * its whole life. It runs *before* `journal_mode = WAL`: SQLite gives the -wal
 * and -shm sidecars whatever the database file's permissions are at the moment
 * it creates them, so tightening afterwards would leave those two behind.
 *
 * A failure here is deliberately not fatal. The bytes are SQLCipher ciphertext
 * inside a 0700 directory either way, and refusing to open a vault because a
 * permission could not be narrowed would be the worse outcome by some distance.
 */
function tightenPermissions(path: string): void {
  if (process.platform === 'win32') return
  try {
    chmodSync(path, 0o600)
  } catch {
    /* read-only mount, exotic filesystem, foreign owner — see above */
  }
}

function applyPragmas(db: DatabaseType): void {
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = FULL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
}

/**
 * Prove the key before returning the handle.
 *
 * SQLCipher does not reject a bad key at open time — it fails on the first
 * page read. Touching the schema here turns that into one predictable error at
 * one predictable place.
 */
function assertKeyWorks(db: DatabaseType): void {
  try {
    db.prepare('SELECT count(*) AS n FROM sqlite_schema').get()
  } catch {
    throw new WrongKeyError()
  }
}

function currentVersion(db: DatabaseType): number {
  const v = db.pragma('user_version', { simple: true })
  return typeof v === 'number' ? v : 0
}

/**
 * Apply any migration newer than the database's recorded version.
 *
 * Each migration runs inside its own transaction together with the version
 * bump, so an interrupted upgrade leaves the vault at the last complete
 * version rather than half-migrated.
 */
export function migrate(db: DatabaseType): number {
  let version = currentVersion(db)
  for (const migration of MIGRATIONS) {
    if (migration.version <= version) continue
    const run = db.transaction(() => {
      db.exec(migration.sql)
      db.pragma(`user_version = ${migration.version}`)
    })
    run()
    version = migration.version
  }
  return version
}

export interface OpenOptions {
  /** Fail instead of creating a vault that does not exist yet. */
  mustExist?: boolean
}

export function openDatabase(path: string, dek: Buffer, options: OpenOptions = {}): DatabaseType {
  const db = new Database(path, options.mustExist === true ? { fileMustExist: true } : {})
  tightenPermissions(path)
  try {
    applyKey(db, dek)
    assertKeyWorks(db)
    applyPragmas(db)
    migrate(db)
    return db
  } catch (e) {
    try {
      db.close()
    } catch {
      /* already closed or never opened cleanly */
    }
    throw e
  }
}

/**
 * Close cleanly so the WAL is checkpointed back into the database file.
 *
 * This is what leaves exactly two files at rest, per §4.1 — the -wal and -shm
 * sidecars exist only while a session is open.
 */
export function closeDatabase(db: DatabaseType | null): void {
  if (!db) return
  try {
    db.pragma('wal_checkpoint(TRUNCATE)')
  } catch {
    /* nothing to checkpoint */
  }
  try {
    db.close()
  } catch {
    /* already closed */
  }
}
