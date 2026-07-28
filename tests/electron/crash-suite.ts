/**
 * "Kill-and-relaunch mid-session corrupts nothing (WAL discipline)" —
 * Realisation I acceptance, proved rather than asserted.
 *
 * A child process opens the real vault, commits a batch, and is then SIGKILLed
 * without ever closing the database, leaving an uncheckpointed write-ahead log
 * behind. The parent then reopens and checks that everything committed is
 * present and the file is sound.
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from './harness.js'
import * as vault from '../../src/main/vault/vault.js'
import { vaultDirectory } from '../../src/main/vault/paths.js'

const PASSWORD = 'wal-discipline-passphrase'
const COMMITTED_ROWS = 500

let dataHome: string

beforeEach(() => {
  dataHome = mkdtempSync(join(tmpdir(), 'jadeite-crash-'))
  process.env['XDG_DATA_HOME'] = dataHome
  vault.lock()
})

afterEach(() => {
  vault.lock()
  rmSync(dataHome, { recursive: true, force: true })
})

/** Relaunch this same bundle in the role of a process that dies mid-session. */
function runDoomedWriter(): number | null {
  const bundle = process.env['JADEITE_TEST_BUNDLE']
  if (!bundle) throw new Error('JADEITE_TEST_BUNDLE not set by the test runner')

  const result = spawnSync(process.execPath, ['--no-sandbox', bundle], {
    stdio: 'inherit',
    env: {
      ...process.env,
      XDG_DATA_HOME: dataHome,
      JADEITE_TEST_ROLE: 'crash-writer',
      JADEITE_TEST_PASSWORD: PASSWORD,
      JADEITE_TEST_ROWS: String(COMMITTED_ROWS)
    }
  })
  return result.signal === 'SIGKILL' ? 9 : result.status
}

describe('surviving a kill mid-session', () => {
  it('loses nothing that was committed, and leaves a sound database', async () => {
    const created = await vault.create(PASSWORD)
    expect(created.ok, 'vault creation').toBe(true)
    vault.lock()

    const outcome = runDoomedWriter()
    expect(outcome, 'the writer was expected to die by SIGKILL').toBe(9)

    // An uncheckpointed log should be sitting there, unrecovered.
    const filesAfterCrash = readdirSync(vaultDirectory()).sort()
    expect(filesAfterCrash.includes('jadeite.db')).toBe(true)

    const reopened = await vault.unlock(PASSWORD)
    expect(reopened, 'reopening after the kill').toEqual({ ok: true, value: null })

    const db = vault.database()!
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok')

    const { n } = db.prepare('SELECT count(*) AS n FROM s4_lines').get() as { n: number }
    expect(n, 'every committed row should have survived').toBe(COMMITTED_ROWS)

    // And the vault is still fully usable afterwards.
    db.prepare('INSERT INTO s4_lines (label, value, position) VALUES (?, ?, ?)').run(
      'after-recovery',
      1,
      COMMITTED_ROWS + 1
    )
    vault.lock()
    expect(readdirSync(vaultDirectory()).sort()).toEqual(['jadeite.db', 'jadeite.keys'])
  })

  it('still refuses the wrong password after an unclean shutdown', async () => {
    const created = await vault.create(PASSWORD)
    expect(created.ok).toBe(true)
    vault.lock()
    runDoomedWriter()

    expect(await vault.unlock('not-the-password')).toEqual({
      ok: false,
      error: 'WRONG_CREDENTIAL'
    })
  })
})
