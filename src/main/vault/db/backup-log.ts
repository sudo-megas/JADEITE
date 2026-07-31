/**
 * `backup_log` — the vault's own record of what has been backed up.
 *
 * The table has existed since schema v1 (§5.3) and nothing had ever written to
 * it; Realisation IX is what it was reserved for.
 *
 * It stores the destination path, and that column never leaves this process.
 * The renderer is told when the last backup happened and how many there have
 * been, which is what the Backup page needs to say something true. Where the
 * owner keeps their archive drive is not the renderer's business, and
 * `hardening.spec.ts` holds the bridge to that.
 */

import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'

import type { BackupReason } from '../../../shared/backup/types.js'

export interface BackupRecord {
  createdAt: string
  destination: string
  /** SHA-256 of the sealed database, hex. */
  checksum: string
  reason: BackupReason
}

export interface BackupSummary {
  lastBackupAt: string | null
  count: number
}

export function recordBackup(db: DatabaseType, record: BackupRecord): void {
  db.prepare(
    'INSERT INTO backup_log (created_at, destination, checksum, reason) VALUES (?, ?, ?, ?)'
  ).run(record.createdAt, record.destination, record.checksum, record.reason)
}

export function backupSummary(db: DatabaseType): BackupSummary {
  const row = db
    .prepare('SELECT count(*) AS n, max(created_at) AS newest FROM backup_log')
    .get() as { n: number; newest: string | null }
  return { lastBackupAt: row.newest, count: row.n }
}

/**
 * Has it been longer than `days` since the last backup?
 *
 * A vault that has never been backed up is overdue as soon as a cadence is
 * chosen — that is the state the reminder most exists for. A cadence of null is
 * never overdue, because the owner turned reminders off.
 */
export function isOverdue(summary: BackupSummary, days: number | null, now: Date): boolean {
  if (days === null || days <= 0) return false
  if (summary.lastBackupAt === null) return true
  const last = Date.parse(summary.lastBackupAt)
  if (!Number.isFinite(last)) return true
  return now.getTime() - last >= days * 24 * 60 * 60 * 1000
}
