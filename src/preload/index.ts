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
  type Section1Api,
  type VaultStatus,
  type YearIndex
} from '../shared/ipc-contract.js'
import type {
  CategoryDraft,
  CategoryKind,
  CategoryUsage,
  EntryPatch,
  Section1ErrorCode,
  ValueType,
  YearUsage,
  YearWorkspace
} from '../shared/section1/types.js'

type S1<T> = Promise<Result<T, Section1ErrorCode>>

/**
 * Section 1 is a plain pass-through: the preload adds no behaviour, so there is
 * no second place where a rule about the owner's money could be written down
 * and then drift from the first.
 */
const section1: Section1Api = {
  years: (): S1<YearIndex> => ipcRenderer.invoke(IPC.s1Years),
  createYear: (year: number): S1<YearIndex> => ipcRenderer.invoke(IPC.s1CreateYear, year),
  workspace: (year: number): S1<YearWorkspace> => ipcRenderer.invoke(IPC.s1Workspace, year),
  addCategory: (year: number, draft: CategoryDraft): S1<number> =>
    ipcRenderer.invoke(IPC.s1AddCategory, year, draft),
  renameCategory: (id: number, name: string): S1<null> =>
    ipcRenderer.invoke(IPC.s1RenameCategory, id, name),
  retypeCategory: (id: number, valueType: ValueType): S1<null> =>
    ipcRenderer.invoke(IPC.s1RetypeCategory, id, valueType),
  reorderCategories: (year: number, kind: CategoryKind, orderedIds: number[]): S1<null> =>
    ipcRenderer.invoke(IPC.s1ReorderCategories, year, kind, orderedIds),
  categoryUsage: (id: number): S1<CategoryUsage> => ipcRenderer.invoke(IPC.s1CategoryUsage, id),
  deleteCategory: (id: number): S1<null> => ipcRenderer.invoke(IPC.s1DeleteCategory, id),
  setEntry: (patch: EntryPatch): S1<null> => ipcRenderer.invoke(IPC.s1SetEntry, patch),
  setAccentOverride: (year: number, accent: string | null): S1<null> =>
    ipcRenderer.invoke(IPC.s1SetAccentOverride, year, accent),
  yearUsage: (year: number): S1<YearUsage> => ipcRenderer.invoke(IPC.s1YearUsage, year),
  deleteYear: (year: number): S1<YearIndex> => ipcRenderer.invoke(IPC.s1DeleteYear, year)
}

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
  },
  section1
}

contextBridge.exposeInMainWorld('jadeite', api)
