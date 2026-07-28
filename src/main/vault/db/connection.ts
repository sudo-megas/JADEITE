/**
 * The encrypted database connection.
 *
 * The DEK is handed to SQLCipher raw, as a 64-character hex literal, so
 * SQLCipher runs no second key derivation over a key Argon2id already
 * stretched. Cipher and format are pinned explicitly rather than left to the
 * library's defaults: a dependency upgrade must never shift the on-disk format
 * out from under a vault that already exists.
 */

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
    // The hex string is an unavoidable copy of the key outside a Buffer.
    // Nothing further can be done about it in JavaScript; it is at least
    // short-lived and never leaves this function.
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
