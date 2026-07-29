/**
 * The context bridge — the entire renderer-facing surface.
 *
 * The renderer touches no filesystem, no crypto and no database. It asks for
 * ceremonies by name and receives plain data back. This file is bundled as
 * CommonJS because the renderer is sandboxed.
 */

import { contextBridge, ipcRenderer } from 'electron'

import {
  IPC,
  type AppConfig,
  type JadeiteApi,
  type LockReason,
  type RecoveryKeyIssue,
  type Result,
  type VaultStatus
} from '../shared/ipc-contract.js'

const api: JadeiteApi = {
  vault: {
    status: (): Promise<VaultStatus> => ipcRenderer.invoke(IPC.vaultStatus),
    create: (password: string): Promise<Result<RecoveryKeyIssue>> =>
      ipcRenderer.invoke(IPC.vaultCreate, password),
    unlock: (password: string): Promise<Result<null>> =>
      ipcRenderer.invoke(IPC.vaultUnlock, password),
    lock: (): Promise<void> => ipcRenderer.invoke(IPC.vaultLock),
    reset: (recoveryKey: string, newPassword: string): Promise<Result<RecoveryKeyIssue>> =>
      ipcRenderer.invoke(IPC.vaultReset, recoveryKey, newPassword),
    onLocked: (listener: (reason: LockReason) => void): (() => void) => {
      // The main process's event payload is passed through, never the
      // IpcRendererEvent itself — that object carries a live sender handle.
      const wrapped = (_event: unknown, reason: LockReason): void => listener(reason)
      ipcRenderer.on(IPC.vaultLockedEvent, wrapped)
      return () => {
        ipcRenderer.removeListener(IPC.vaultLockedEvent, wrapped)
      }
    }
  },
  settings: {
    get: (key: string): Promise<Result<string | null>> => ipcRenderer.invoke(IPC.settingsGet, key),
    set: (key: string, value: string): Promise<Result<null>> =>
      ipcRenderer.invoke(IPC.settingsSet, key, value)
  },
  config: {
    get: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.configGet),
    set: (patch: Partial<AppConfig>): Promise<AppConfig> =>
      ipcRenderer.invoke(IPC.configSet, patch)
  }
}

contextBridge.exposeInMainWorld('jadeite', api)
