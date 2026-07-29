/**
 * The complete contract between the renderer and the main process.
 *
 * Types only — this module must never contain runtime behaviour, because it is
 * imported by both sides of the context bridge.
 */

import type {
  CategoryDraft,
  CategoryKind,
  CategoryUsage,
  EntryPatch,
  Section1ErrorCode,
  ValueType,
  YearUsage,
  YearWorkspace
} from './section1/types.js'

export const IPC = {
  vaultStatus: 'vault:status',
  vaultCreate: 'vault:create',
  vaultUnlock: 'vault:unlock',
  vaultLock: 'vault:lock',
  vaultReset: 'vault:reset',
  vaultLockedEvent: 'vault:locked',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  configGet: 'config:get',
  configSet: 'config:set',

  // Section 1 — Income & Expenses (§6).
  s1Years: 's1:years',
  s1CreateYear: 's1:create-year',
  s1Workspace: 's1:workspace',
  s1AddCategory: 's1:add-category',
  s1RenameCategory: 's1:rename-category',
  s1RetypeCategory: 's1:retype-category',
  s1ReorderCategories: 's1:reorder-categories',
  s1CategoryUsage: 's1:category-usage',
  s1DeleteCategory: 's1:delete-category',
  s1SetEntry: 's1:set-entry',
  s1SetAccentOverride: 's1:set-accent-override',
  s1YearUsage: 's1:year-usage',
  s1DeleteYear: 's1:delete-year'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

/**
 * Failure reasons that may cross the bridge. Deliberately coarse: the renderer
 * learns that a credential was wrong, never which stored value it failed
 * against, and never a stack trace.
 */
export type VaultErrorCode =
  | 'NO_VAULT'
  | 'VAULT_EXISTS'
  | 'LOCKED'
  | 'WRONG_CREDENTIAL'
  | 'MALFORMED_RECOVERY_KEY'
  | 'WEAK_PASSWORD'
  | 'ENVELOPE_CORRUPT'
  | 'INTERNAL'

/**
 * Every crossing of the bridge answers with one of these.
 *
 * The error type is a parameter so a section can name its own failures without
 * widening `VaultErrorCode`, which exists to say as little as possible about
 * credentials and must not acquire "that column name is taken" as a member.
 */
export type Result<T, E = VaultErrorCode> = { ok: true; value: T } | { ok: false; error: E }

export interface VaultStatus {
  /** A vault exists on disk (both envelope and database present). */
  exists: boolean
  /** No data-encryption key is held in memory. */
  locked: boolean
}

/** Returned exactly once, at vault creation and after every password reset. */
export interface RecoveryKeyIssue {
  recoveryKey: string
  /** 1 for the first key ever issued, incrementing with each reset. */
  generation: number
}

/** Why the vault locked itself, so the lock screen can explain. */
export type LockReason = 'idle' | 'manual' | 'reset'

/**
 * Minimum master-password length.
 *
 * The specification does not set one. Argon2id at 256 MiB already makes
 * offline guessing expensive, so this is a floor against the trivially empty
 * rather than a composition policy — those push people toward worse passwords.
 * Shared so the renderer and the vault cannot disagree about it.
 */
export const MIN_PASSWORD_LENGTH = 8

/**
 * Settings stored inside the encrypted vault.
 *
 * Appearance and language are deliberately absent: they live in the
 * unencrypted `config.json` instead, because the lock screen needs them before
 * the vault can be opened. Security settings stay here, where tampering with
 * them requires the vault key.
 */
export const SETTING_KEYS = {
  autoLockMinutes: 'auto_lock_minutes',
  /**
   * The year the palette's accent sequence counts from (§12.3).
   *
   * Written once, when the vault's first year is created, and never
   * recalculated. Deriving it from the earliest year present would make every
   * workspace's colour depend on the whole dataset, so adding one older year
   * later would repaint all the others — and the accent is exactly what the
   * owner navigates by after a month of use.
   */
  accentAnchorYear: 'accent_anchor_year'
} as const

export const DEFAULT_SETTINGS: Readonly<Record<string, string>> = {
  [SETTING_KEYS.autoLockMinutes]: '10'
}

/**
 * The unencrypted application configuration — how the app looks and which
 * language it speaks. Readable before unlock, and holding nothing about money.
 */
export interface AppConfig {
  format: number
  /** A palette id; an unknown one falls back rather than propagating. */
  palette: string
  language: 'tr' | 'en'
}

export const DEFAULT_APP_CONFIG: Readonly<AppConfig> = {
  format: 1,
  palette: 'default-dark',
  language: 'tr'
}

/** The entire surface exposed to the renderer through the context bridge. */
export interface JadeiteApi {
  vault: {
    status(): Promise<VaultStatus>
    create(password: string): Promise<Result<RecoveryKeyIssue>>
    unlock(password: string): Promise<Result<null>>
    lock(): Promise<void>
    reset(recoveryKey: string, newPassword: string): Promise<Result<RecoveryKeyIssue>>
    onLocked(listener: (reason: LockReason) => void): () => void
  }
  settings: {
    get(key: string): Promise<Result<string | null>>
    set(key: string, value: string): Promise<Result<null>>
  }
  /**
   * Appearance and language. Unlike `settings`, these are readable and
   * writable while the vault is locked — that is the whole reason they live
   * outside it.
   */
  config: {
    get(): Promise<AppConfig>
    set(patch: Partial<AppConfig>): Promise<AppConfig>
  }
  /** Section 1 — Income & Expenses (§6). Everything here needs the vault open. */
  section1: Section1Api
}

/** What the year switcher needs before any workspace is loaded. */
export interface YearIndex {
  years: number[]
  /** The year the accent sequence counts from (§12.3). */
  anchorYear: number
}

export interface Section1Api {
  /** Existing years, ascending, plus the accent anchor. Creates one if none exist. */
  years(): Promise<Result<YearIndex, Section1ErrorCode>>
  createYear(year: number): Promise<Result<YearIndex, Section1ErrorCode>>
  workspace(year: number): Promise<Result<YearWorkspace, Section1ErrorCode>>
  addCategory(year: number, draft: CategoryDraft): Promise<Result<number, Section1ErrorCode>>
  renameCategory(id: number, name: string): Promise<Result<null, Section1ErrorCode>>
  retypeCategory(id: number, valueType: ValueType): Promise<Result<null, Section1ErrorCode>>
  reorderCategories(
    year: number,
    kind: CategoryKind,
    orderedIds: number[]
  ): Promise<Result<null, Section1ErrorCode>>
  /** What deleting this column would destroy, asked before it is offered. */
  categoryUsage(id: number): Promise<Result<CategoryUsage, Section1ErrorCode>>
  deleteCategory(id: number): Promise<Result<null, Section1ErrorCode>>
  setEntry(patch: EntryPatch): Promise<Result<null, Section1ErrorCode>>
  setAccentOverride(year: number, accent: string | null): Promise<Result<null, Section1ErrorCode>>
  /** What deleting this year would destroy, asked before it is offered. */
  yearUsage(year: number): Promise<Result<YearUsage, Section1ErrorCode>>
  deleteYear(year: number): Promise<Result<YearIndex, Section1ErrorCode>>
}
