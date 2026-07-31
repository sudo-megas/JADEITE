/**
 * The backup surface — XJADEITE §15, §4.4.
 *
 * This file owns the only two file dialogs in the application, and it owns them
 * so that nothing else has to. The picker runs here, the path it returns stays
 * here, and what crosses to the renderer is a description of a container rather
 * than a location on a disk. `hardening.spec.ts` asserts that no filesystem
 * path is reachable through the bridge, and a backup feature is the obvious
 * place for the first one to appear.
 *
 * Three of the five channels answer while the vault is locked. That is not an
 * oversight in the guard: §4.4's second row is the disk-death case, where there
 * is no vault to be unlocked and the credential being proved belongs to the
 * container rather than to this machine.
 */

import { app, dialog, ipcMain, type BrowserWindow } from 'electron'

import { IPC } from '../../shared/ipc-contract.js'
import {
  BACKUP_REASONS,
  type BackupCandidate,
  type BackupErrorCode,
  type BackupReason,
  type BackupReceipt,
  type BackupStatus
} from '../../shared/backup/types.js'
import type { Result } from '../../shared/ipc-contract.js'
import * as vault from '../vault/vault.js'
import * as backup from '../vault/backup/service.js'
import { exclusively } from './ceremonies.js'

type BackupResult<T> = Result<T, BackupErrorCode>

const INTERNAL = { ok: false, error: 'INTERNAL' } as const
const CANCELLED = { ok: false, error: 'CANCELLED' } as const

/** Matches `MAX_CREDENTIAL_LENGTH` in `ipc.ts`; the same Argon2id bound applies. */
const MAX_CREDENTIAL_LENGTH = 1024

async function guarded<T>(
  fn: () => Promise<BackupResult<T>> | BackupResult<T>
): Promise<BackupResult<T>> {
  try {
    return await fn()
  } catch {
    return INTERNAL
  }
}

function isReason(v: unknown): v is BackupReason {
  return typeof v === 'string' && (BACKUP_REASONS as readonly string[]).includes(v)
}

/** `jadeite-2026-07-31.jbk` — sortable, and legal on every filesystem. */
function suggestedName(): string {
  return `jadeite-${new Date().toISOString().slice(0, 10)}.jbk`
}

const FILTERS = [{ name: 'JADEITE', extensions: ['jbk'] }]

export function registerBackupHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC.backupStatus, (): Promise<BackupResult<BackupStatus>> =>
    guarded(() => backup.status())
  )

  ipcMain.handle(IPC.backupCreate, (_e, reason: unknown): Promise<BackupResult<BackupReceipt>> =>
    guarded(async () => {
      if (!isReason(reason)) return INTERNAL
      if (!vault.isUnlocked()) return { ok: false, error: 'LOCKED' } as const

      const window = getWindow()
      const options = {
        title: 'JADEITE',
        defaultPath: `${app.getPath('home')}/${suggestedName()}`,
        filters: FILTERS
      }
      const chosen = window
        ? await dialog.showSaveDialog(window, options)
        : await dialog.showSaveDialog(options)
      if (chosen.canceled || !chosen.filePath) return CANCELLED

      // Re-checked after the dialog, and deliberately — `section3-ipc.ts`
      // establishes the opposite default, that a service knows what to do about
      // a lock it discovers mid-flight. Nothing here does: the owner may have
      // spent a minute choosing a folder, the idle timer may have fired while
      // they did, and sealing a vault needs the connection the timer just
      // closed. Better to say so than to answer INTERNAL from inside a vacuum.
      if (!vault.isUnlocked()) return { ok: false, error: 'LOCKED' } as const

      return backup.create(chosen.filePath, reason, app.getVersion())
    })
  )

  ipcMain.handle(IPC.backupSelect, (): Promise<BackupResult<BackupCandidate>> =>
    guarded(async () => {
      const window = getWindow()
      const options = {
        title: 'JADEITE',
        properties: ['openFile' as const],
        filters: FILTERS
      }
      const chosen = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options)

      const path = chosen.filePaths[0]
      if (chosen.canceled || path === undefined) return CANCELLED

      return backup.select(path)
    })
  )

  // Through the shared ceremony queue, because §4.4's second row derives a key
  // at the same 256 MiB as an unlock does. One queue across both files, or the
  // ceiling it exists to impose would only bind half the channels that breach it.
  ipcMain.handle(IPC.backupRestore, (_e, credential: unknown): Promise<BackupResult<null>> =>
    exclusively((): Promise<BackupResult<null>> | BackupResult<null> => {
      if (credential === null || credential === undefined) return backup.restore(null)
      if (typeof credential !== 'string' || credential.length > MAX_CREDENTIAL_LENGTH) {
        // A malformed credential is answered as a wrong one, following the
        // vault channels: the renderer learns that it did not open the
        // container, never that its argument had the wrong type.
        return { ok: false, error: 'WRONG_CREDENTIAL' } as const
      }
      return backup.restore(credential)
    }, INTERNAL)
  )

  ipcMain.handle(IPC.backupCancel, (): Promise<BackupResult<null>> =>
    guarded(() => {
      backup.cancel()
      return { ok: true, value: null }
    })
  )
}
