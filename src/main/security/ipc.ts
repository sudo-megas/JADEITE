/**
 * The typed IPC surface — the whole of it.
 *
 * Every handler validates its own arguments and returns a Result. Nothing
 * throws across the bridge: an exception would carry a stack trace, file paths
 * and sometimes argument values into the renderer, which is exactly the
 * information a sandbox exists to withhold.
 */

import { ipcMain, type BrowserWindow } from 'electron'

import { IPC, type Result, type VaultStatus } from '../../shared/ipc-contract.js'
import * as vault from '../vault/vault.js'
import { getSetting, setSetting } from '../vault/db/settings.js'

/** Long enough for any real passphrase, short enough to bound Argon2id input. */
const MAX_CREDENTIAL_LENGTH = 1024
const MAX_SETTING_KEY_LENGTH = 64
const MAX_SETTING_VALUE_LENGTH = 4096

function isCredential(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= MAX_CREDENTIAL_LENGTH
}

const INTERNAL = { ok: false, error: 'INTERNAL' } as const

/** Run a handler so that no exception can ever reach the renderer. */
async function guarded<T>(fn: () => Promise<Result<T>> | Result<T>): Promise<Result<T>> {
  try {
    return await fn()
  } catch {
    return INTERNAL
  }
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.vaultStatus, (): VaultStatus => vault.status())

  ipcMain.handle(IPC.vaultCreate, (_e, password: unknown) =>
    guarded(() => {
      if (!isCredential(password)) return { ok: false, error: 'WEAK_PASSWORD' } as const
      return vault.create(password)
    })
  )

  ipcMain.handle(IPC.vaultUnlock, (_e, password: unknown) =>
    guarded(() => {
      if (!isCredential(password)) return { ok: false, error: 'WRONG_CREDENTIAL' } as const
      return vault.unlock(password)
    })
  )

  ipcMain.handle(IPC.vaultLock, () => {
    vault.lock('manual')
  })

  ipcMain.handle(IPC.vaultReset, (_e, recoveryKey: unknown, newPassword: unknown) =>
    guarded(() => {
      if (typeof recoveryKey !== 'string' || recoveryKey.length > MAX_CREDENTIAL_LENGTH) {
        return { ok: false, error: 'MALFORMED_RECOVERY_KEY' } as const
      }
      if (!isCredential(newPassword)) return { ok: false, error: 'WEAK_PASSWORD' } as const
      return vault.reset(recoveryKey, newPassword)
    })
  )

  ipcMain.handle(IPC.settingsGet, (_e, key: unknown) =>
    guarded((): Result<string | null> => {
      if (typeof key !== 'string' || key.length === 0 || key.length > MAX_SETTING_KEY_LENGTH) {
        return INTERNAL
      }
      const db = vault.database()
      if (!db) return { ok: false, error: 'LOCKED' }
      return { ok: true, value: getSetting(db, key) }
    })
  )

  ipcMain.handle(IPC.settingsSet, (_e, key: unknown, value: unknown) =>
    guarded((): Result<null> => {
      if (typeof key !== 'string' || key.length === 0 || key.length > MAX_SETTING_KEY_LENGTH) {
        return INTERNAL
      }
      if (typeof value !== 'string' || value.length > MAX_SETTING_VALUE_LENGTH) return INTERNAL
      const db = vault.database()
      if (!db) return { ok: false, error: 'LOCKED' }
      setSetting(db, key, value)
      return { ok: true, value: null }
    })
  )
}

/** Tell the renderer the vault locked itself, so it can drop to the lock screen. */
export function forwardLockEvents(getWindow: () => BrowserWindow | null): () => void {
  return vault.onLock((reason) => {
    const win = getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC.vaultLockedEvent, reason)
    }
  })
}
