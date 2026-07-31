/**
 * The `.jbk` backup container — XJADEITE §15.
 *
 * Shared rather than main-only because the e2e project needs these types to
 * read what crosses the bridge, and because the container's shape is a fact
 * about the application rather than about one process in it.
 *
 * Two things are deliberately absent from every type here: file paths and key
 * material. A backup lives at a path the owner chose and is sealed by a key the
 * vault module owns, and neither ever crosses to the renderer — `hardening.spec`
 * asserts the first, and §4.2 is the second.
 */

/** The four sections that carry owner edits, for the merge stamps below. */
export type SectionKey = 's1' | 's2' | 's3' | 's4'

export const SECTION_KEYS: readonly SectionKey[] = Object.freeze(['s1', 's2', 's3', 's4'])

/**
 * When each section was last edited, ISO-8601, or null for "never, or not
 * known".
 *
 * Null is the honest answer for a vault that predates schema v5: nothing
 * recorded an edit time before the triggers existed, and a backfilled
 * timestamp would be a fabrication carried in a container that outlives the
 * conversation about it.
 *
 * These exist for **merge**, which XJADEITE §20 Q2 settled as *per-section
 * choice* on 31 July 2026 and which is not built in Realisation IX. The stamps
 * ship now because a container format cannot grow a field retroactively:
 * backups taken this year must still be answerable when the chooser arrives.
 */
export type SectionStamps = Readonly<Record<SectionKey, string | null>>

/**
 * The container's own version, distinct from the key envelope's `format` and
 * from the database's `user_version`. Three things version independently here
 * and conflating any two of them would break a vault that only one of them
 * changed.
 */
export const CONTAINER_FORMAT = 1

/**
 * Why a candidate file is not a backup this build will open.
 *
 * Discriminated rather than boolean for the same reason `parseRecoveryKey`
 * separates 'length' from 'charset' from 'checksum': "this is not a JADEITE
 * backup" and "this is a JADEITE backup that has been damaged" are different
 * sentences to say to someone whose disk has just died.
 */
export type ContainerRejection =
  /** No JADEITE magic — some other file entirely. */
  | 'magic'
  /** Ends before its own declared lengths do. */
  | 'truncated'
  /** A container version this build does not know how to read. */
  | 'format'
  /** A declared length beyond what this build will allocate. */
  | 'oversize'
  /** The header is not JSON, or is JSON that is not a header. */
  | 'header'
  /** The header's bytes do not match the digest recorded over them. */
  | 'header-checksum'
  /** The database's bytes do not match the digest recorded over them. */
  | 'payload-checksum'
  /** Written by a JADEITE whose schema this build has never seen. */
  | 'schema'

/** What the renderer is told about a container the owner has just chosen. */
export interface BackupCandidate {
  /** When the backup was taken. */
  createdAt: string
  /** The JADEITE that wrote it. */
  appVersion: string
  /** The database schema it carries. */
  schemaVersion: number
  /** True when this is a backup of the vault on this machine. */
  sameVault: boolean
  /**
   * True when restoring it needs a credential typed by the owner — either
   * because no vault is open to lend its key, or because the container belongs
   * to a different vault (§4.4, rows 1 and 2).
   */
  needsCredential: boolean
  /** The recovery-key generation in force when the backup was taken (§4.3). */
  recoveryGeneration: number
  /** Per-section edit times, for the merge chooser that Q2 deferred. */
  sections: SectionStamps
}

/** Why a backup was taken. Recorded in `backup_log`, never shown as jargon. */
export type BackupReason = 'manual' | 'credential-change' | 'reminder'

export const BACKUP_REASONS: readonly BackupReason[] = Object.freeze([
  'manual',
  'credential-change',
  'reminder'
])

/** What the renderer learns after a backup is written. No path, by design. */
export interface BackupReceipt {
  createdAt: string
  /** Bytes on disk, so the owner can recognise a plausible file. */
  sizeBytes: number
}

/** The backup page's whole state, in one crossing. */
export interface BackupStatus {
  /** When the newest backup was taken, or null if none ever was. */
  lastBackupAt: string | null
  /** How many backups this vault has recorded. */
  count: number
  /** Days between reminders; null is off (§15). */
  reminderDays: number | null
  /** True when `reminderDays` has elapsed since `lastBackupAt`. */
  overdue: boolean
  /** The recovery-key generation the next backup would carry (§4.3, §4.4). */
  recoveryGeneration: number
}

/**
 * Reminder cadences offered in Settings. Off is first because a reminder the
 * owner did not ask for is a nag, and §15 says the app *offers* reminders.
 */
export const BACKUP_REMINDER_CHOICES: readonly (number | null)[] = Object.freeze([
  null,
  7,
  30,
  90
])

/** Failures the backup surface may report. Kept out of `VaultErrorCode` (§ipc-contract). */
export type BackupErrorCode =
  | 'LOCKED'
  /** The owner closed the file picker. Not an error, but not a success either. */
  | 'CANCELLED'
  /** No container has been chosen, or the chosen one was already consumed. */
  | 'NO_CANDIDATE'
  /** The file could not be read or written at all. */
  | 'IO'
  /** The file is not a JADEITE backup. */
  | 'NOT_A_BACKUP'
  /** It is one, and it has been damaged since it was written. */
  | 'DAMAGED'
  /** It was written by a JADEITE newer than this one — the container itself. */
  | 'FUTURE_FORMAT'
  /** It was written by a JADEITE newer than this one — the database inside it. */
  | 'FUTURE_SCHEMA'
  /** The credential does not open this container (§4.4). */
  | 'WRONG_CREDENTIAL'
  /** A credential was required and none was given. */
  | 'CREDENTIAL_REQUIRED'
  /** The envelope yielded a key, and the database inside refused it. */
  | 'PAYLOAD_UNREADABLE'
  | 'INTERNAL'

/**
 * Collapse a parser rejection into what the owner is told.
 *
 * The parser discriminates eight reasons and the bridge carries four, which is
 * a deliberate narrowing rather than a lost detail. The eight are engineering
 * facts — *which* digest disagreed — and the four are the only distinctions
 * that change what the owner should do next: find a different file, find an
 * undamaged copy, or update JADEITE. The full eight are asserted in
 * `tests/unit/jbk-container.test.ts`, where they are the subject.
 */
export function rejectionToError(reason: ContainerRejection): BackupErrorCode {
  switch (reason) {
    case 'magic':
    case 'header':
      return 'NOT_A_BACKUP'
    case 'format':
      return 'FUTURE_FORMAT'
    case 'schema':
      return 'FUTURE_SCHEMA'
    case 'truncated':
    case 'oversize':
    case 'header-checksum':
    case 'payload-checksum':
      return 'DAMAGED'
  }
}
