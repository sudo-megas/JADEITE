/**
 * Backup, restore and machine transfer — the whole of §15's behaviour.
 *
 * Deliberately free of Electron. The file picker belongs to the IPC layer and
 * this module is handed paths, which is what lets the Electron-hosted suite
 * drive a complete backup-and-restore round trip without a window, a dialog or
 * a rendering process — the three things that make an acceptance check
 * expensive to write and easy to skip.
 *
 * **What a backup is.** `VACUUM main INTO` a temporary file, and ship those
 * bytes. Three candidates were measured against Electron 42's build of
 * `better-sqlite3-multiple-ciphers` before this was chosen, because the answer
 * decides whether the owner's entire ledger lands on an archive drive in the
 * clear; the measurement is recorded in `docs/realisation-ix.md`. `db.backup()`
 * refuses outright — *"backup is not supported with incompatible source and
 * target databases"* — which is the library declining to write a plaintext copy
 * of an encrypted database, and the safest of the three failures to have.
 * `VACUUM INTO` inherits the connection's key and produces a file that opens
 * under the same DEK, carries the same `user_version`, and passes
 * `integrity_check`. A raw byte copy of `jadeite.db` works too, and loses: it is
 * only consistent if the WAL has just been checkpointed, so its correctness
 * rests on a pragma call two lines earlier rather than on the statement itself.
 *
 * **The DEK is not used to make a backup.** `VACUUM INTO` runs on the open
 * connection, which already holds the key. The DEK is needed only to *verify* a
 * container on the way back in, and it is borrowed synchronously (`vault.useDek`).
 */

import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'

import { SETTING_KEYS, type Result } from '../../../shared/ipc-contract.js'
import {
  rejectionToError,
  type BackupCandidate,
  type BackupErrorCode,
  type BackupReason,
  type BackupReceipt,
  type BackupStatus
} from '../../../shared/backup/types.js'
import * as vault from '../vault.js'
import { writeFileAtomic } from '../atomic.js'
import { readEnvelope, type KeyEnvelope } from '../envelope.js'
import { closeDatabase, openDatabase } from '../db/connection.js'
import { SCHEMA_VERSION } from '../db/schema.js'
import { getSetting } from '../db/settings.js'
import { backupSummary, isOverdue, recordBackup } from '../db/backup-log.js'
import { sectionStamps, vaultId } from '../db/lineage.js'
import {
  MAX_HEADER_BYTES,
  MAX_PAYLOAD_BYTES,
  PREAMBLE_BYTES,
  payloadChecksum,
  readContainer,
  writeContainer,
  type BackupContainer
} from './container.js'
import {
  commitInstall,
  discardStaged,
  incomingDatabasePath as stagedDatabasePath,
  stageDatabase,
  stageEnvelope
} from './install.js'

type BackupResult<T> = Result<T, BackupErrorCode>

const LOCKED = { ok: false, error: 'LOCKED' } as const

/** The largest file this build will read at all, before looking inside it. */
const MAX_CONTAINER_BYTES = PREAMBLE_BYTES + MAX_HEADER_BYTES + MAX_PAYLOAD_BYTES

/**
 * The container the owner has chosen, waiting for their confirmation.
 *
 * Held here, in the main process, between `select` and `restore`. The renderer
 * never receives the path it came from and never receives its bytes; it
 * receives what `BackupCandidate` describes and confirms against that.
 *
 * Holding the bytes rather than re-reading the path at confirmation time is the
 * point: the file that was verified is the file that gets installed, and no
 * amount of time spent on the confirmation screen can put a different one
 * there.
 */
let staged: { container: BackupContainer; needsCredential: boolean; sameVault: boolean } | null =
  null

function currentSchemaVersion(db: DatabaseType): number {
  const v = db.pragma('user_version', { simple: true })
  return typeof v === 'number' ? v : 0
}

function reminderDays(db: DatabaseType): number | null {
  const raw = getSetting(db, SETTING_KEYS.backupReminderDays)
  if (raw === null) return null
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function status(): BackupResult<BackupStatus> {
  const db = vault.database()
  if (!db) return LOCKED

  const summary = backupSummary(db)
  const days = reminderDays(db)
  const envelope = readEnvelope()

  return {
    ok: true,
    value: {
      lastBackupAt: summary.lastBackupAt,
      count: summary.count,
      reminderDays: days,
      overdue: isOverdue(summary, days, new Date()),
      recoveryGeneration: envelope?.recovery.generation ?? 0
    }
  }
}

/**
 * Seal the live vault into `destination` (§15).
 *
 * Everything between borrowing the connection and writing the file is
 * synchronous, so the idle timer cannot lock the vault halfway through and
 * leave a container built from a database that has since closed. The picker
 * runs before this is called, which is where the owner's thinking time is
 * spent; the IPC layer re-checks the vault after it returns.
 */
export function create(destination: string, reason: BackupReason, appVersion: string): BackupResult<BackupReceipt> {
  const db = vault.database()
  if (!db) return LOCKED

  const id = vaultId(db)
  if (id === null) return { ok: false, error: 'INTERNAL' }

  const workDir = mkdtempSync(join(tmpdir(), 'jadeite-backup-'))
  try {
    const snapshot = join(workDir, 'snapshot.db')

    // Bound as a parameter rather than interpolated. The path is this
    // process's own and carries no user input, which is a reason to be relaxed
    // about it and not a reason to build the habit the other way.
    db.prepare('VACUUM main INTO ?').run(snapshot)

    const payload = readFileSync(snapshot)
    const createdAt = new Date().toISOString()
    const bytes = writeContainer(
      {
        container: 1,
        vaultId: id,
        schemaVersion: currentSchemaVersion(db),
        appVersion,
        createdAt,
        sections: sectionStamps(db),
        envelope: readEnvelopeOrThrow()
      },
      payload
    )

    writeFileAtomic(destination, bytes)

    // Logged outside the try that guards the write, and after it.
    //
    // The backup exists on disk from the line above. If recording it in the
    // vault then failed, the previous arrangement answered `IO` — telling the
    // owner their backup had failed while a perfectly good `.jbk` sat on the
    // drive they had just chosen. The log is this application's memory of the
    // act, not the act; a forgotten backup is a worse count on a page, and a
    // backup believed lost is a person taking another one they did not need or
    // trusting a file they have been told is not there.
    try {
      recordBackup(db, { createdAt, destination, checksum: payloadChecksum(payload), reason })
    } catch {
      console.warn('[backup] the container was written but could not be recorded in the log')
    }

    return { ok: true, value: { createdAt, sizeBytes: bytes.length } }
  } catch {
    return { ok: false, error: 'IO' }
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

function readEnvelopeOrThrow(): KeyEnvelope {
  const envelope = readEnvelope()
  if (!envelope) throw new Error('the vault has no readable envelope')
  return envelope
}

/**
 * Read a candidate container and hold it for confirmation.
 *
 * Nothing is applied here and nothing on disk is touched. The vault may be
 * locked, or absent entirely — that is the case this exists for.
 */
export function select(path: string): BackupResult<BackupCandidate> {
  // Whatever was chosen before is forgotten the moment a new choice is made,
  // and *before* this one can fail. Leaving the old candidate in place through
  // a rejection was a real defect: the renderer would be told a file is
  // damaged, and a confirmation sent anyway would install the container chosen
  // two steps earlier — a restore of the wrong backup, reported as a success.
  // The main process must not depend on the renderer declining to confirm
  // after it has been told no.
  cancel()

  let bytes: Buffer
  try {
    // Sized before it is read, so a file far too large to be a backup is
    // refused rather than loaded to discover that it was.
    if (statSync(path).size > MAX_CONTAINER_BYTES) return { ok: false, error: 'DAMAGED' }
    bytes = readFileSync(path)
  } catch {
    return { ok: false, error: 'IO' }
  }

  const read = readContainer(bytes, SCHEMA_VERSION)
  if (!read.ok) return { ok: false, error: rejectionToError(read.reason) }

  const db = vault.database()
  const localId = db ? vaultId(db) : null
  const sameVault = localId !== null && localId === read.value.header.vaultId

  // Row 1 of §4.4 — "every backup ever made is openable" — holds only for a
  // healthy vault opening *its own* backup. Anything else is a transfer, and a
  // transfer proves a credential.
  const needsCredential = !(db !== null && sameVault)

  staged = { container: read.value, needsCredential, sameVault }

  return {
    ok: true,
    value: {
      createdAt: read.value.header.createdAt,
      appVersion: read.value.header.appVersion,
      schemaVersion: read.value.header.schemaVersion,
      sameVault,
      needsCredential,
      recoveryGeneration: read.value.header.envelope.recovery.generation,
      sections: read.value.header.sections
    }
  }
}

export function cancel(): void {
  staged = null
  discardStaged()
}

/**
 * Prove the staged database opens, is sound, and is not from the future.
 *
 * Runs against the staged file in the vault directory rather than a temporary
 * one, so the rename that installs it is a same-filesystem rename and cannot
 * fail across a device boundary at the one moment nothing may fail.
 *
 * Opening it also migrates it, which is intended: a backup two schema versions
 * old is upgraded here, while it is still a file nobody depends on. A backup
 * from the *future* cannot be upgraded and is refused — `migrate` walks forward
 * only and would silently accept it.
 */
function verifyStaged(key: Buffer): BackupErrorCode | null {
  const path = stagedDatabasePath()
  let db: DatabaseType | null = null
  try {
    db = openDatabase(path, key, { mustExist: true })
  } catch {
    return 'PAYLOAD_UNREADABLE'
  }

  try {
    if (db.pragma('integrity_check', { simple: true }) !== 'ok') return 'DAMAGED'
    if (currentSchemaVersion(db) > SCHEMA_VERSION) return 'FUTURE_SCHEMA'
    return null
  } catch {
    return 'PAYLOAD_UNREADABLE'
  } finally {
    closeDatabase(db)
  }
}

/**
 * Replace this machine's vault with the staged container.
 *
 * The order is the safety, and it is the same order in both of §4.4's rows:
 * stage, verify, and only then lock and swap. A container that fails
 * verification has changed nothing — the acceptance line is *"rejected without
 * a crash and without partial application"*, and everything that could refuse
 * has refused before `commitInstall` is reached.
 */
export async function restore(credential: string | null): Promise<BackupResult<null>> {
  const held = staged
  if (!held) return { ok: false, error: 'NO_CANDIDATE' }

  if (held.needsCredential && (credential === null || credential.length === 0)) {
    return { ok: false, error: 'CREDENTIAL_REQUIRED' }
  }

  try {
    stageDatabase(held.container.payload)
  } catch {
    discardStaged()
    return { ok: false, error: 'IO' }
  }

  // §4.4 row 1: this vault is healthy and this is its own backup, so the key is
  // already in memory and no credential is asked for — that is the promise the
  // truth table makes, and it holds however old the backup is and whatever
  // password was in force when it was taken.
  let failure: BackupErrorCode | null
  if (!held.needsCredential) {
    // Wrapped in an object so that `useDek`'s null means one thing only: the
    // vault locked while the owner was reading the confirmation screen. A bare
    // `BackupErrorCode | null` would collide with it, and the collision would
    // read as success.
    const outcome = vault.useDek((key) => ({ failure: verifyStaged(key) }))
    if (outcome === null) {
      discardStaged()
      return LOCKED
    }
    failure = outcome.failure
  } else {
    // §4.4 row 2: the envelope inside the container is the only one that can
    // speak for it, and the credential is whatever was current when it was
    // written.
    const proved = await vault.useForeignDek(
      held.container.header.envelope,
      credential ?? '',
      (key) => verifyStaged(key)
    )
    if (!proved.ok) {
      discardStaged()
      return { ok: false, error: 'WRONG_CREDENTIAL' }
    }
    failure = proved.value
  }

  if (failure !== null) {
    discardStaged()
    return { ok: false, error: failure }
  }

  // From here nothing may refuse. The session ends before the files move: the
  // open handle points at a database that is about to be replaced underneath
  // it, and the DEK in memory may not be the one that opens what arrives.
  vault.lock('manual')

  if (held.needsCredential) stageEnvelope(held.container.header.envelope)

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  try {
    commitInstall(held.needsCredential, stamp)
  } catch {
    return { ok: false, error: 'IO' }
  }

  staged = null
  return { ok: true, value: null }
}
