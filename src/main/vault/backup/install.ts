/**
 * Replacing a vault with the contents of a backup — the part that must not be
 * interruptible.
 *
 * A vault is two files, and no filesystem can rename two files as one act. That
 * is the whole difficulty here, and it is not theoretical: a machine transfer
 * installs a database *and* the envelope whose credentials open it (§4.4, row
 * 2), and either one alone is useless. New envelope over old database, or old
 * envelope over new database — both are a vault that opens with no credential
 * anyone has. A power cut between two renames would produce exactly that.
 *
 * So the renames are made replayable rather than atomic. Both replacements are
 * written to `.incoming` siblings and flushed *before* anything is touched, and
 * a journal recording the intent is written and flushed before the first
 * rename. If the process dies at any point, the next start finds the journal,
 * renames whichever `.incoming` files are still there, and the install
 * completes. If it dies before the journal exists, no rename has happened, and
 * the stale `.incoming` files are swept.
 *
 * `REALISATION.md`'s acceptance line for this is *"rejected without a crash and
 * without partial application"*. Verification is what prevents a bad container
 * from ever reaching this module; this module is what prevents a good one from
 * arriving halfway.
 *
 * **The replaced vault is kept.** A restore destroys the data that was here,
 * and the precedent set by `setOrphanedDatabaseAside` is that destroying a
 * user's file on their behalf is not the code's decision. The outgoing pair is
 * copied to `.replaced-<stamp>` siblings first. §4.1's "exactly two files" is
 * about what the application *manages*; these are the owner's to delete, like
 * the orphans, and both are named so it is obvious which is which.
 */

import { copyFileSync, existsSync, readFileSync, renameSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

import { writeFileAtomic, fsyncDirectory } from '../atomic.js'
import { writeEnvelope, type KeyEnvelope } from '../envelope.js'
import { databasePath, ensureVaultDirectory, envelopePath, vaultDirectory } from '../paths.js'

const JOURNAL_NAME = 'restore.journal'
const JOURNAL_FORMAT = 1

/** SQLite's sidecars. They belong to the database they were written beside. */
const SIDECAR_SUFFIXES = ['-wal', '-shm'] as const

function journalPath(): string {
  return join(vaultDirectory(), JOURNAL_NAME)
}

/** Where a database waits between being staged and being applied. */
export function incomingDatabasePath(): string {
  return `${databasePath()}.incoming`
}

function incomingEnvelopePath(): string {
  return `${envelopePath()}.incoming`
}

interface Journal {
  format: number
  /** True when the envelope is being replaced alongside the database. */
  envelope: boolean
  stamp: string
}

function readJournal(): Journal | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(journalPath(), 'utf8'))
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const o = parsed as Record<string, unknown>
  if (o['format'] !== JOURNAL_FORMAT) return null
  if (typeof o['envelope'] !== 'boolean' || typeof o['stamp'] !== 'string') return null
  return o as unknown as Journal
}

function removeQuietly(path: string): void {
  try {
    unlinkSync(path)
  } catch {
    /* absent already, which is the state this was asking for */
  }
}

function copyAside(path: string, stamp: string): void {
  if (!existsSync(path)) return
  copyFileSync(path, `${path}.replaced-${stamp}`)
}

/** Stage the database that is to replace this vault's. Nothing is applied yet. */
export function stageDatabase(bytes: Buffer): void {
  ensureVaultDirectory()
  writeFileAtomic(incomingDatabasePath(), bytes)
}

/** Stage the envelope that is to replace this vault's. Nothing is applied yet. */
export function stageEnvelope(envelope: KeyEnvelope): void {
  ensureVaultDirectory()
  writeEnvelope(envelope, incomingEnvelopePath())
}

/**
 * Forget a staged install. Called when verification refuses what was staged.
 *
 * The sidecars go too. Verification *opens* the staged database to prove the
 * key works and the pages are sound, and an open leaves a `-wal` beside it —
 * which would otherwise outlive the file it belonged to.
 */
export function discardStaged(): void {
  const db = incomingDatabasePath()
  removeQuietly(db)
  for (const suffix of SIDECAR_SUFFIXES) removeQuietly(`${db}${suffix}`)
  removeQuietly(incomingEnvelopePath())
}

/**
 * Apply what has been staged.
 *
 * @param withEnvelope replace `jadeite.keys` too. False when `service.ts`'s
 *   `select()` found a live, unlocked vault whose own vaultId matches the
 *   container — the case the comment this replaces described as "restoring
 *   its own backup". That is not quite the same as "the credentials in force
 *   now": a restore attempted from the *lock screen* has no open database to
 *   compare a vaultId against, so `select()` treats it as a foreign transfer
 *   and this flag comes back true — installing whatever password/recovery
 *   pair was current when the backup was taken, even for a vault's own file.
 *   See `service.ts`'s `select()` for the exact condition and the residual
 *   this leaves.
 * @param stamp names the copies of what is being replaced. Passed in so a test
 *   can predict them and so one restore's copies share one name.
 */
export function commitInstall(withEnvelope: boolean, stamp: string): void {
  const dir = vaultDirectory()
  const db = databasePath()
  const keys = envelopePath()

  // The journal goes down first and is flushed before a single rename. Its
  // presence is what licenses the replay below; its absence is what licenses
  // the sweep.
  writeFileAtomic(
    journalPath(),
    `${JSON.stringify({ format: JOURNAL_FORMAT, envelope: withEnvelope, stamp })}\n`
  )

  // The outgoing vault is copied, not renamed: a rename would leave the target
  // absent for the width of this function, and `vaultExists()` answering false
  // in that window is how a first-run ceremony could start on top of a live
  // vault.
  copyAside(db, stamp)
  for (const suffix of SIDECAR_SUFFIXES) copyAside(`${db}${suffix}`, stamp)
  if (withEnvelope) copyAside(keys, stamp)

  // A stale -wal belongs to the database being replaced. Left in place it would
  // be replayed into the incoming one, whose pages it knows nothing about.
  for (const suffix of SIDECAR_SUFFIXES) removeQuietly(`${db}${suffix}`)

  if (withEnvelope) renameSync(incomingEnvelopePath(), keys)
  renameSync(incomingDatabasePath(), db)
  for (const suffix of SIDECAR_SUFFIXES) removeQuietly(`${incomingDatabasePath()}${suffix}`)
  fsyncDirectory(dir)

  removeQuietly(journalPath())
  fsyncDirectory(dir)
}

export type InstallRecovery = 'none' | 'completed' | 'swept'

/**
 * Finish or sweep an install that a crash interrupted.
 *
 * Runs before anything reads the vault — `main/index.ts` calls it once, at
 * start, ahead of the first `vault.status()`. Idempotent, and safe on a machine
 * that has never restored anything.
 */
export function completeInterruptedInstall(): InstallRecovery {
  const dir = vaultDirectory()
  if (!existsSync(dir)) return 'none'

  const journal = readJournal()
  if (!journal) {
    // No journal, so no rename was ever begun. Anything staged is litter from a
    // crash during verification, and the data directory is meant to hold two
    // files (§4.1).
    const staged = existsSync(incomingDatabasePath()) || existsSync(incomingEnvelopePath())
    if (!staged && !existsSync(journalPath())) return 'none'
    discardStaged()
    removeQuietly(journalPath())
    fsyncDirectory(dir)
    return 'swept'
  }

  // Replay. Each rename is skipped if it already happened, which is what makes
  // this safe to run twice.
  const db = databasePath()
  const incoming = incomingDatabasePath()

  // Whether the database rename is still owed decides everything below, and it
  // is read once. If a staged database is waiting, the `jadeite.db` on disk is
  // still the *outgoing* one; if it is not, the rename already happened and
  // `jadeite.db` is the vault that was just installed. The same `-wal` filename
  // means opposite things in those two states.
  const databaseOwed = existsSync(incoming)

  if (databaseOwed) {
    // The sidecar hygiene `commitInstall` performs, repeated here because a
    // crash may have landed before it. A `-wal` beside the outgoing database
    // holds pages belonging to the file about to be replaced; left in place it
    // is replayed into the arriving one, which knows nothing about them. The
    // result passes `integrity_check` and holds rows the backup never
    // contained — a restore that silently did not restore, which is exactly
    // the partial application this module exists to prevent.
    //
    // It is guarded rather than unconditional, and the guard is the important
    // half. Once the rename has happened, a `-wal` beside `jadeite.db` belongs
    // to the *new* vault and holds committed transactions; deleting it to tidy
    // up after a restore would discard the owner's work to fix a problem that
    // is no longer there.
    copyAside(db, journal.stamp)
    for (const suffix of SIDECAR_SUFFIXES) copyAside(`${db}${suffix}`, journal.stamp)
    if (journal.envelope) copyAside(envelopePath(), journal.stamp)
    for (const suffix of SIDECAR_SUFFIXES) removeQuietly(`${db}${suffix}`)
  }

  if (journal.envelope && existsSync(incomingEnvelopePath())) {
    renameSync(incomingEnvelopePath(), envelopePath())
  }
  if (databaseOwed) {
    renameSync(incoming, db)
    // The staged database was opened during verification, so it has sidecars of
    // its own. They are named for a file that no longer exists.
    for (const suffix of SIDECAR_SUFFIXES) removeQuietly(`${incoming}${suffix}`)
  }
  fsyncDirectory(dir)

  removeQuietly(journalPath())
  fsyncDirectory(dir)
  return 'completed'
}
