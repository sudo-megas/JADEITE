/**
 * The typed IPC surface — the whole of it.
 *
 * Every handler validates its own arguments and returns a Result. Nothing
 * throws across the bridge: an exception would carry a stack trace, file paths
 * and sometimes argument values into the renderer, which is exactly the
 * information a sandbox exists to withhold.
 */

import { ipcMain, type BrowserWindow } from 'electron'

import {
  DEFAULT_APP_CONFIG,
  IPC,
  RENDERER_READABLE_SETTINGS,
  RENDERER_WRITABLE_SETTINGS,
  type AppConfig,
  type Result,
  type VaultStatus
} from '../../shared/ipc-contract.js'
import * as vault from '../vault/vault.js'
import { cancelInFlight } from '../prices/service.js'
import { getSetting, setSetting } from '../vault/db/settings.js'
import { readAppConfig, updateAppConfig } from '../config/app-config.js'
import { registerSection1Handlers } from './section1-ipc.js'
import { registerSection2Handlers } from './section2-ipc.js'
import { registerSection3Handlers } from './section3-ipc.js'
import { registerSection4Handlers } from './section4-ipc.js'
import { registerBackupHandlers } from './backup-ipc.js'
import { exclusively } from './ceremonies.js'

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

/**
 * @param getWindow the window a modal file dialog should attach to, fetched
 *   rather than captured because it is replaced on `activate`. The same thunk
 *   `forwardLockEvents` takes, and for the same reason.
 */
export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  registerSection1Handlers()
  registerSection2Handlers()
  registerSection3Handlers()
  registerSection4Handlers()
  registerBackupHandlers(getWindow)

  // Guarded at Realisation X, and the two below it for the same reason. §3.3's
  // hardening amendment says "no handler is exempt from the guard, including
  // the two that answer while locked" — and these were the exemptions. Neither
  // leaks anything today: `status()` reads two paths and `lock()`'s callees
  // catch their own errors. What makes it worth two lines rather than a note is
  // that `vault.lock()` runs every registered `onLock` listener synchronously
  // inside this handler, so the unguarded path is inherited by listeners that
  // do not exist yet, and an exception escaping one of them is serialised into
  // the renderer's rejected `invoke()` — message included, which is the exact
  // failure clause (2) was written after.
  //
  // These two cannot use `guarded()`: it answers `{ok: false, error}` and these
  // channels do not carry a `Result`. The fallback is chosen instead, and it is
  // the conservative pair. `locked: true` never grants anything, and
  // `exists: true` sends a renderer that cannot be told the truth to the unlock
  // screen rather than to the first-run ceremony — the wrong one to guess at,
  // since it is the screen that offers to make a vault.
  ipcMain.handle(IPC.vaultStatus, (): VaultStatus => {
    try {
      return vault.status()
    } catch {
      return { exists: true, locked: true }
    }
  })

  ipcMain.handle(IPC.vaultCreate, (_e, password: unknown) =>
    exclusively(() => {
      if (!isCredential(password)) return { ok: false, error: 'WEAK_PASSWORD' } as const
      return vault.create(password)
    }, INTERNAL)
  )

  ipcMain.handle(IPC.vaultUnlock, (_e, password: unknown) =>
    exclusively(() => {
      if (!isCredential(password)) return { ok: false, error: 'WRONG_CREDENTIAL' } as const
      return vault.unlock(password)
    }, INTERNAL)
  )

  ipcMain.handle(IPC.vaultLock, () => {
    try {
      vault.lock('manual')
    } catch {
      // Swallowed rather than reported, and the asymmetry is deliberate: the
      // renderer asked for the vault to be shut, and the one thing it must not
      // learn is why that went wrong on a machine it cannot see. `lock()`
      // closes the database, drops the handle and zeroises the key *before* it
      // calls a single listener (vault.ts:63-70), so a throw reaching here
      // means a listener misbehaved after the fact — not that the vault is
      // still open.
    }
  })

  ipcMain.handle(IPC.vaultReset, (_e, recoveryKey: unknown, newPassword: unknown) =>
    exclusively(() => {
      if (typeof recoveryKey !== 'string' || recoveryKey.length > MAX_CREDENTIAL_LENGTH) {
        return { ok: false, error: 'MALFORMED_RECOVERY_KEY' } as const
      }
      if (!isCredential(newPassword)) return { ok: false, error: 'WEAK_PASSWORD' } as const
      return vault.reset(recoveryKey, newPassword)
    }, INTERNAL)
  )

  ipcMain.handle(IPC.settingsGet, (_e, key: unknown) =>
    guarded((): Result<string | null> => {
      if (typeof key !== 'string' || key.length === 0 || key.length > MAX_SETTING_KEY_LENGTH) {
        return INTERNAL
      }
      // The lock is tested before the allow-list, so a key this surface does not
      // carry answers the same LOCKED as one it does. Which settings exist is
      // not a secret, but a shut vault should say one thing about everything.
      const db = vault.database()
      if (!db) return { ok: false, error: 'LOCKED' }
      if (!RENDERER_READABLE_SETTINGS.includes(key)) return INTERNAL
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
      // The vault's lineage and its section stamps are written by a migration
      // and by triggers, and by nothing else (§15). This is what makes that so.
      if (!RENDERER_WRITABLE_SETTINGS.includes(key)) return INTERNAL
      setSetting(db, key, value)
      return { ok: true, value: null }
    })
  )

  // Appearance and language are answerable while locked — the lock screen is
  // precisely where they are needed first.
  //
  // Both are wrapped, and `configSet` is the reason. `readAppConfig` swallows
  // its own failures, but `updateAppConfig` writes a file and `writeFileAtomic`
  // rethrows — and an Electron handler's exception is serialised into the
  // renderer's rejected `invoke()`, message and all. A config directory the app
  // cannot write to produces `EACCES: permission denied, open
  // '/home/…/config.json.tmp'`, which is an absolute path crossing the bridge
  // out of the one handler in this file that had no guard. The module's own
  // opening paragraph says nothing throws across the bridge; this is what had
  // been quietly untrue of it.
  ipcMain.handle(IPC.configGet, (): AppConfig => configOrDefault())

  ipcMain.handle(IPC.configSet, (_e, patch: unknown): AppConfig => {
    if (typeof patch !== 'object' || patch === null) return configOrDefault()
    const raw = patch as Record<string, unknown>
    try {
      // Only the two fields are accepted, and each is validated again inside
      // updateAppConfig before it reaches the file.
      return updateAppConfig({
        ...(typeof raw['palette'] === 'string' ? { palette: raw['palette'] } : {}),
        ...(raw['language'] === 'tr' || raw['language'] === 'en'
          ? { language: raw['language'] }
          : {})
      })
    } catch {
      // The write failed and the renderer is told what is still true rather
      // than why. Appearance is the one thing in this application that may be
      // wrong without consequence.
      return configOrDefault()
    }
  })
}

/** Appearance, or the defaults, but never an exception. */
function configOrDefault(): AppConfig {
  try {
    return readAppConfig()
  } catch {
    return { ...DEFAULT_APP_CONFIG }
  }
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
