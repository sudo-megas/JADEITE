/**
 * The doomed half of the crash-recovery test.
 *
 * Unlocks the vault, commits a batch, then kills itself outright — no close,
 * no checkpoint, no chance to tidy up. Exactly what a power cut looks like to
 * the database.
 */

import * as vault from '../../src/main/vault/vault.js'

export async function crashWriter(): Promise<never> {
  const password = process.env['JADEITE_TEST_PASSWORD'] ?? ''
  const rows = Number.parseInt(process.env['JADEITE_TEST_ROWS'] ?? '0', 10)

  const opened = await vault.unlock(password)
  if (!opened.ok) {
    console.error('crash-writer could not unlock the vault')
    process.exit(2)
  }

  const db = vault.database()
  if (!db) {
    console.error('crash-writer has no database handle')
    process.exit(2)
  }

  const insert = db.prepare('INSERT INTO s4_lines (label, value, position) VALUES (?, ?, ?)')
  const commitBatch = db.transaction(() => {
    for (let i = 0; i < rows; i++) insert.run(`line-${i}`, i * 100, i)
  })
  commitBatch()

  // Open a transaction and never commit it, so there is genuinely in-flight
  // work to roll back. A bare insert would autocommit and prove nothing.
  db.exec('BEGIN')
  insert.run('never-committed', -1, rows + 1)

  // No close(), no checkpoint. Straight to a hard kill.
  process.kill(process.pid, 'SIGKILL')

  // Unreachable; present so the signature is honest.
  await new Promise(() => {})
  throw new Error('unreachable')
}
