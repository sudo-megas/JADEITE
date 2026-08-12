/**
 * The dialog-then-recheck race, in `backup-ipc.ts`'s own words — freeze audit
 * L28.
 *
 * `backup/service.ts`'s `create()` documents why it is safe on its own: "the
 * idle timer cannot lock the vault halfway through [it]. The picker runs
 * before this is called, which is where the owner's thinking time is spent;
 * the IPC layer re-checks the vault after it returns." A lock arriving while
 * `dialog.showSaveDialog` is still pending — genuinely long-lived, since it
 * waits on the owner — must never reach a container built from a connection
 * that has since closed. Two guards stand between the race and that outcome:
 * `backup-ipc.ts`'s own re-check placed after the `await`, and `create()`'s
 * own `if (!db) return LOCKED` at its own top. Both read the same
 * `vault.database()`, and `vault.lock()` nulls it and the key together,
 * synchronously, so the two guards can never disagree about which state the
 * vault is in — this suite proves the pair of them together refuse the race
 * cleanly, not which one specifically fires. What it can and does prove is
 * the property that actually matters: no half-built container reaches disk.
 *
 * Nothing before this file had ever driven that claim. `tests/electron/
 * backup-suite.ts` calls `backup.create()` directly and never touches the
 * handler this race actually lives in; `hardening.spec.ts`'s one concurrency
 * test covers ceremony queueing, a different mechanism entirely.
 *
 * There is no renderer in this harness to invoke the handler *through*
 * `ipcMain`, so the listener `registerBackupHandlers` installs is captured —
 * once, at module load, the same way `tests/electron/egress-suite.ts` captures
 * what `hardenSession` installs on a stubbed session — and called directly.
 * `dialog.showSaveDialog` is a real Electron API this process can reach even
 * headlessly; it is stood in for exactly long enough to control when it
 * resolves, which is the whole of what this race depends on.
 */

import { dialog, ipcMain } from 'electron'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from './harness.js'

import { registerBackupHandlers } from '../../src/main/security/backup-ipc.js'
import { IPC } from '../../src/shared/ipc-contract.js'
import * as vault from '../../src/main/vault/vault.js'

type CreateHandler = (event: unknown, reason: unknown) => Promise<unknown>

/**
 * Captured once, here, rather than inside a `beforeEach`: `ipcMain.handle`
 * throws if the same channel is registered twice, and this suite has no
 * reason to install the real listener more than once for its whole run.
 */
const capturedCreateHandler: CreateHandler = (() => {
  let captured: CreateHandler | null = null
  const original = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = ((channel: string, listener: (...args: unknown[]) => unknown) => {
    if (channel === IPC.backupCreate) captured = listener as CreateHandler
    return original(channel, listener)
  }) as typeof ipcMain.handle
  try {
    registerBackupHandlers(() => null)
  } finally {
    ipcMain.handle = original
  }
  if (captured === null) throw new Error('registerBackupHandlers never registered backup:create')
  return captured
})()

const PASSWORD = 'yedek-dialog-yarisi-2026'

let dataHome: string
let archive: string

beforeEach(() => {
  dataHome = mkdtempSync(join(tmpdir(), 'jadeite-backup-ipc-'))
  archive = mkdtempSync(join(tmpdir(), 'jadeite-backup-ipc-archive-'))
  process.env['XDG_DATA_HOME'] = dataHome
  process.env['JADEITE_DATA_HOME'] = dataHome
  vault.lock()
})

afterEach(() => {
  vault.lock()
  rmSync(dataHome, { recursive: true, force: true })
  rmSync(archive, { recursive: true, force: true })
})

interface DialogControl {
  /** Resolves the pending `showSaveDialog` call as if the owner chose `filePath`. */
  resolve(filePath: string): void
  restore(): void
}

/**
 * Stands in for `dialog.showSaveDialog` for the life of one test, returning a
 * promise this suite decides when to settle — the owner's "thinking time",
 * made controllable instead of merely awaited.
 */
function controlledSaveDialog(): DialogControl {
  const original = dialog.showSaveDialog
  let settle: ((result: { canceled: boolean; filePath?: string }) => void) | null = null
  dialog.showSaveDialog = ((..._args: unknown[]) =>
    new Promise<{ canceled: boolean; filePath?: string }>((resolve) => {
      settle = resolve
    })) as typeof dialog.showSaveDialog

  return {
    resolve(filePath) {
      if (settle === null) throw new Error('showSaveDialog was never called')
      settle({ canceled: false, filePath })
    },
    restore() {
      dialog.showSaveDialog = original
    }
  }
}

describe('the save-dialog race backup-ipc.ts documents and re-checks for (L28)', () => {
  it('is refused with LOCKED when the vault locks while the dialog is still open, and writes nothing', async () => {
    await vault.create(PASSWORD)
    const control = controlledSaveDialog()
    const destination = join(archive, 'raced.jbk')
    try {
      // Synchronous up to `dialog.showSaveDialog`'s first `await`, exactly as
      // `guarded`'s own `await fn()` is — by the time this call returns, the
      // stub above has already been invoked and is waiting to be resolved.
      const pending = capturedCreateHandler({}, 'manual')

      // The owner's idle timer fires while they are still choosing a folder —
      // the exact window `backup-ipc.ts`'s comment names.
      vault.lock('idle')

      // The dialog now resolves with a path, as if the owner picked one right
      // after the vault closed underneath them.
      control.resolve(destination)

      expect(await pending).toEqual({ ok: false, error: 'LOCKED' })

      // The stronger claim, and the one that actually matters: no half-built
      // container ever reaches disk. `backup-ipc.ts`'s own re-check and
      // `service.ts create()`'s independent guard (`if (!db) return LOCKED`)
      // agree on the same `vault.database()` invariant, so this suite cannot
      // tell — and does not need to tell — which of the two stopped it;
      // esbuild statically refuses to let a test reassign a bundled module's
      // export (`Cannot assign to import "create"`), so spying on `create`
      // itself to attribute the refusal to one specific line is not an option
      // here. What is provable, and what the race actually threatens, is
      // whether a file gets written from a connection that has since closed.
      expect(existsSync(destination)).toBe(false)
    } finally {
      control.restore()
    }
  })

  it('still succeeds when nothing locked the vault while the dialog was open', async () => {
    await vault.create(PASSWORD)
    const control = controlledSaveDialog()
    try {
      const pending = capturedCreateHandler({}, 'manual')
      control.resolve(join(archive, 'unraced.jbk'))

      const result = (await pending) as { ok: boolean }
      expect(result.ok, 'the dialog alone must not be mistaken for the race').toBe(true)
    } finally {
      control.restore()
    }
  })

  it('answers LOCKED immediately, without ever showing a dialog, if the vault was already shut', async () => {
    // No vault.create() here — locked from the start.
    const control = controlledSaveDialog()
    try {
      const result = await capturedCreateHandler({}, 'manual')
      expect(result).toEqual({ ok: false, error: 'LOCKED' })
    } finally {
      control.restore()
    }
  })
})
