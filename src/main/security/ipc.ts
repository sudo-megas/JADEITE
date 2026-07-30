/**
 * The typed IPC surface — the whole of it.
 *
 * Every handler validates its own arguments and returns a Result. Nothing
 * throws across the bridge: an exception would carry a stack trace, file paths
 * and sometimes argument values into the renderer, which is exactly the
 * information a sandbox exists to withhold.
 */

import { ipcMain, type BrowserWindow } from 'electron'

import { IPC, type AppConfig, type Result, type VaultStatus } from '../../shared/ipc-contract.js'
import * as vault from '../vault/vault.js'
import { cancelInFlight } from '../prices/service.js'
import { getSetting, setSetting } from '../vault/db/settings.js'
import { readAppConfig, updateAppConfig } from '../config/app-config.js'
import { registerSection1Handlers } from './section1-ipc.js'
import { registerSection2Handlers } from './section2-ipc.js'
import { registerSection3Handlers } from './section3-ipc.js'
import { registerSection4Handlers } from './section4-ipc.js'

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
  registerSection1Handlers()
  registerSection2Handlers()
  registerSection3Handlers()
  registerSection4Handlers()

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

  // Appearance and language are answerable while locked — the lock screen is
  // precisely where they are needed first.
  ipcMain.handle(IPC.configGet, (): AppConfig => readAppConfig())

  ipcMain.handle(IPC.configSet, (_e, patch: unknown): AppConfig => {
    if (typeof patch !== 'object' || patch === null) return readAppConfig()
    const raw = patch as Record<string, unknown>
    // Only the two fields are accepted, and each is validated again inside
    // updateAppConfig before it reaches the file.
    return updateAppConfig({
      ...(typeof raw['palette'] === 'string' ? { palette: raw['palette'] } : {}),
      ...(raw['language'] === 'tr' || raw['language'] === 'en'
        ? { language: raw['language'] }
        : {})
    })
  })
}

/** Tell the renderer the vault locked itself, so it can drop to the lock screen. */
export function forwardLockEvents(getWindow: () => BrowserWindow | null): () => void {
  return vault.onLock((reason) => {
    // A price fetch in flight has nowhere to put its answer once the key is
    // gone, and a socket left open past the lock is exactly the kind of thing
    // §3.3 exists to prevent. Cut it first, then tell the renderer.
    cancelInFlight()

    const win = getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC.vaultLockedEvent, reason)
    }
  })
}
