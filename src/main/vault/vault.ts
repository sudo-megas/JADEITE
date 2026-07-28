/**
 * Vault orchestration — the four ceremonies of XJADEITE §4.
 *
 * This module owns the only copy of the DEK that exists in memory. Nothing
 * above it ever sees key material: the renderer receives a recovery key
 * exactly twice in a vault's life (creation and each reset) and never anything
 * else.
 */

import { randomBytes } from 'node:crypto'
import { existsSync, renameSync } from 'node:fs'
import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'

import type { LockReason, RecoveryKeyIssue, Result, VaultStatus } from '../../shared/ipc-contract.js'
import { MIN_PASSWORD_LENGTH, SETTING_KEYS } from '../../shared/ipc-contract.js'
import { BASELINE_KDF, SALT_LENGTH, deriveKek } from './kdf.js'
import { additionalData, generateDek, unwrapDek, wrapDek, zeroise, type WrappedKey } from './dek.js'
import {
  ENVELOPE_FORMAT,
  newEnvelope,
  readEnvelope,
  writeEnvelope,
  type KeyEnvelope
} from './envelope.js'
import { generateRecoveryKey, parseRecoveryKey } from './recovery-key.js'
import { closeDatabase, openDatabase } from './db/connection.js'
import { getSetting, seedDefaultSettings } from './db/settings.js'
import { databasePath, ensureVaultDirectory, vaultExists } from './paths.js'

let dek: Buffer | null = null
let db: DatabaseType | null = null

type LockListener = (reason: LockReason) => void
const lockListeners = new Set<LockListener>()

export function onLock(listener: LockListener): () => void {
  lockListeners.add(listener)
  return () => lockListeners.delete(listener)
}

export function status(): VaultStatus {
  return { exists: vaultExists(), locked: dek === null }
}

export function isUnlocked(): boolean {
  return dek !== null && db !== null
}

/** The live handle, or null when locked. Callers must not retain it. */
export function database(): DatabaseType | null {
  return db
}

export function autoLockMinutes(): number {
  if (!db) return 10
  const raw = getSetting(db, SETTING_KEYS.autoLockMinutes)
  const n = raw === null ? NaN : Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : 10
}

/** Close the database and wipe the key. Idempotent. */
export function lock(reason: LockReason = 'manual'): void {
  const wasUnlocked = dek !== null || db !== null
  closeDatabase(db)
  db = null
  zeroise(dek)
  dek = null
  if (wasUnlocked) {
    for (const listener of lockListeners) listener(reason)
  }
}

/**
 * Move a database that has no envelope out of the way.
 *
 * Its bytes are preserved rather than deleted — they are unrecoverable, but
 * destroying a user's file on their behalf is not this function's decision.
 */
function setOrphanedDatabaseAside(): void {
  const path = databasePath()
  if (!existsSync(path)) return
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  renameSync(path, `${path}.orphaned-${stamp}`)
}

function wrapUnder(
  credential: string,
  key: Buffer,
  slot: 'password' | 'recovery'
): Promise<WrappedKey> {
  const salt = randomBytes(SALT_LENGTH)
  const aad = additionalData(ENVELOPE_FORMAT, BASELINE_KDF, slot)
  return deriveKek(credential, salt, BASELINE_KDF).then((kek) => {
    try {
      return wrapDek(key, kek, salt, aad)
    } finally {
      zeroise(kek)
    }
  })
}

async function unwrapWith(
  credential: string,
  envelope: KeyEnvelope,
  slot: 'password' | 'recovery'
): Promise<Buffer | null> {
  const wrapped = slot === 'password' ? envelope.password : envelope.recovery
  const salt = Buffer.from(wrapped.salt, 'base64')
  if (salt.length < 8) return null
  const aad = additionalData(envelope.format, envelope.kdf, slot)
  const kek = await deriveKek(credential, salt, envelope.kdf)
  try {
    return unwrapDek(wrapped, kek, aad)
  } finally {
    zeroise(kek)
  }
}

/**
 * First run — XJADEITE §4.3 step 1.
 *
 * Generates the DEK that will seal this vault for its entire life, wraps it
 * under the new password and under recovery key #1, and returns that recovery
 * key. This is the only time it is ever available.
 */
export async function create(password: string): Promise<Result<RecoveryKeyIssue>> {
  if (vaultExists()) return { ok: false, error: 'VAULT_EXISTS' }
  if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, error: 'WEAK_PASSWORD' }

  ensureVaultDirectory()
  const fresh = generateDek()
  const recovery = generateRecoveryKey()

  try {
    const [passwordSlot, recoverySlot] = await Promise.all([
      wrapUnder(password, fresh, 'password'),
      wrapUnder(recovery.data, fresh, 'recovery')
    ])

    // A database whose envelope was never written is sealed by a key that no
    // longer exists anywhere — unopenable by anyone, including its owner. It
    // is moved aside rather than deleted, and it must be moved before the new
    // envelope is written, or the next creation would refuse the stale file
    // forever.
    setOrphanedDatabaseAside()

    // Envelope first, database second. The reverse order has a trap: a
    // database created without its envelope would block every later attempt to
    // create a vault, because opening it with a fresh DEK can only fail.
    writeEnvelope(newEnvelope(passwordSlot, recoverySlot))

    const handle = openDatabase(databasePath(), fresh)
    seedDefaultSettings(handle)

    db = handle
    dek = fresh
    return { ok: true, value: { recoveryKey: recovery.formatted, generation: 1 } }
  } catch {
    zeroise(fresh)
    lock('manual')
    return { ok: false, error: 'INTERNAL' }
  }
}

/** Unlock with the master password. */
export async function unlock(password: string): Promise<Result<null>> {
  if (!vaultExists()) return { ok: false, error: 'NO_VAULT' }
  const envelope = readEnvelope()
  if (!envelope) return { ok: false, error: 'ENVELOPE_CORRUPT' }

  const recovered = await unwrapWith(password, envelope, 'password')
  if (!recovered) return { ok: false, error: 'WRONG_CREDENTIAL' }

  try {
    db = openDatabase(databasePath(), recovered, { mustExist: true })
    dek = recovered
    return { ok: true, value: null }
  } catch {
    zeroise(recovered)
    db = null
    dek = null
    return { ok: false, error: 'WRONG_CREDENTIAL' }
  }
}

/**
 * Password reset — XJADEITE §4.3 steps 2 and 3, verbatim.
 *
 * The current recovery key is consumed and permanently dead; a new master
 * password is set; the next recovery key is issued immediately. Exactly one
 * valid recovery key exists at any moment. The DEK is unchanged — this
 * re-wraps, it does not re-encrypt.
 */
export async function reset(
  recoveryKeyInput: string,
  newPassword: string
): Promise<Result<RecoveryKeyIssue>> {
  if (!vaultExists()) return { ok: false, error: 'NO_VAULT' }

  const parsed = parseRecoveryKey(recoveryKeyInput)
  if (!parsed.ok) return { ok: false, error: 'MALFORMED_RECOVERY_KEY' }
  if (newPassword.length < MIN_PASSWORD_LENGTH) return { ok: false, error: 'WEAK_PASSWORD' }

  const envelope = readEnvelope()
  if (!envelope) return { ok: false, error: 'ENVELOPE_CORRUPT' }

  const recovered = await unwrapWith(parsed.data, envelope, 'recovery')
  if (!recovered) return { ok: false, error: 'WRONG_CREDENTIAL' }

  // Any session opened under the old credentials ends here.
  lock('reset')

  const nextRecovery = generateRecoveryKey()
  try {
    const [passwordSlot, recoverySlot] = await Promise.all([
      wrapUnder(newPassword, recovered, 'password'),
      wrapUnder(nextRecovery.data, recovered, 'recovery')
    ])

    const generation = envelope.recovery.generation + 1
    writeEnvelope({
      format: ENVELOPE_FORMAT,
      kdf: envelope.kdf,
      password: passwordSlot,
      recovery: { ...recoverySlot, generation },
      createdAt: envelope.createdAt,
      updatedAt: new Date().toISOString()
    })

    db = openDatabase(databasePath(), recovered, { mustExist: true })
    dek = recovered
    return { ok: true, value: { recoveryKey: nextRecovery.formatted, generation } }
  } catch {
    zeroise(recovered)
    db = null
    dek = null
    return { ok: false, error: 'INTERNAL' }
  }
}

export const VAULT_POLICY = {
  minPasswordLength: MIN_PASSWORD_LENGTH
} as const
