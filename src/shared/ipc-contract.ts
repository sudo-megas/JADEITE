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
  settingsSet: 'settings:set'
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

export const SETTING_KEYS = {
  language: 'language',
  palette: 'palette',
  autoLockMinutes: 'auto_lock_minutes'
} as const

export const DEFAULT_SETTINGS: Readonly<Record<string, string>> = {
  [SETTING_KEYS.language]: 'tr',
  [SETTING_KEYS.palette]: 'default-dark',
  [SETTING_KEYS.autoLockMinutes]: '10'
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
}
