/**
 * The complete contract between the renderer and the main process.
 *
 * Types only — this module must never contain runtime behaviour, because it is
 * imported by both sides of the context bridge.
 */

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
  configSet: 'config:set'
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

export type Result<T> = { ok: true; value: T } | { ok: false; error: VaultErrorCode }

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
  autoLockMinutes: 'auto_lock_minutes'
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
}
