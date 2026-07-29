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
import type {
  BankDraft,
  BankUsage,
  CellPatch,
  Section2ErrorCode,
  YearGrid
} from './section2/types.js'
import type {
  LedgerData,
  PersonDraft,
  PersonUsage,
  Section3ErrorCode,
  TransactionDraft,
  TransactionPatch,
  TypeCode
} from './section3/types.js'
import type {
  Line,
  LineDraft,
  LinePatch,
  Section4ErrorCode
} from './section4/types.js'

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
  s1DeleteYear: 's1:delete-year',

  // Section 2 — Payments / Installments (§7).
  s2Years: 's2:years',
  s2CreateYear: 's2:create-year',
  s2Grid: 's2:grid',
  s2AddBank: 's2:add-bank',
  s2RenameBank: 's2:rename-bank',
  s2SetCreditLimit: 's2:set-credit-limit',
  s2SetCounterParty: 's2:set-counter-party',
  s2ReorderBanks: 's2:reorder-banks',
  s2BankUsage: 's2:bank-usage',
  s2DeleteBank: 's2:delete-bank',
  s2SetCell: 's2:set-cell',
  s2SetArchived: 's2:set-archived',

  // Section 3 — Valuables (§8). One read, because holdings derive from the
  // ledger and the prices together and must not come from two reads.
  s3Ledger: 's3:ledger',
  s3AddPerson: 's3:add-person',
  s3RenamePerson: 's3:rename-person',
  s3SetPersonColour: 's3:set-person-colour',
  s3ReorderPersons: 's3:reorder-persons',
  s3PersonUsage: 's3:person-usage',
  s3DeletePerson: 's3:delete-person',
  s3AddTransaction: 's3:add-transaction',
  s3UpdateTransaction: 's3:update-transaction',
  s3DeleteTransaction: 's3:delete-transaction',
  s3SetManualPrice: 's3:set-manual-price',
  s3ClearManualPrice: 's3:clear-manual-price',

  // Section 4 — Calculation Zone (§9).
  s4Lines: 's4:lines',
  s4AddLine: 's4:add-line',
  s4UpdateLine: 's4:update-line',
  s4DeleteLine: 's4:delete-line',
  s4ReorderLines: 's4:reorder-lines'
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
  /** Section 2 — Payments / Installments (§7). Everything here needs the vault open. */
  section2: Section2Api
  /** Section 3 — Valuables (§8). Everything here needs the vault open. */
  section3: Section3Api
  /** Section 4 — Calculation Zone (§9). Everything here needs the vault open. */
  section4: Section4Api
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

/**
 * Section 2 — Payments / Installments (§7).
 *
 * There is no `deleteYear` and no `setAccentOverride` here on purpose. A year
 * and its accent belong to the vault rather than to a section, and both already
 * have exactly one home in Section 1's year menu. A second copy of a
 * destructive dialogue is the "same list kept in two places" defect of §7.1,
 * rebuilt deliberately.
 */
export interface Section2Api {
  /** Existing years, ascending, plus the accent anchor. Creates one if none exist. */
  years(): Promise<Result<YearIndex, Section2ErrorCode>>
  createYear(year: number): Promise<Result<YearIndex, Section2ErrorCode>>
  grid(year: number): Promise<Result<YearGrid, Section2ErrorCode>>
  addBank(year: number, draft: BankDraft): Promise<Result<number, Section2ErrorCode>>
  renameBank(id: number, name: string): Promise<Result<null, Section2ErrorCode>>
  setCreditLimit(id: number, limit: number): Promise<Result<null, Section2ErrorCode>>
  setCounterParty(id: number, party: string | null): Promise<Result<null, Section2ErrorCode>>
  reorderBanks(
    year: number,
    isCounter: boolean,
    orderedIds: number[]
  ): Promise<Result<null, Section2ErrorCode>>
  /** What deleting this column would destroy, asked before it is offered. */
  bankUsage(id: number): Promise<Result<BankUsage, Section2ErrorCode>>
  deleteBank(id: number): Promise<Result<null, Section2ErrorCode>>
  setCell(patch: CellPatch): Promise<Result<null, Section2ErrorCode>>
  /** Freeze this year's grid, or reopen it (§7.3). */
  setArchived(year: number, archived: boolean): Promise<Result<null, Section2ErrorCode>>
}

/**
 * Section 3 — Valuables (§8).
 *
 * There is no `years` call and no year argument anywhere: the ledger is a
 * lifetime, not a workspace (shared/section3/types.ts).
 *
 * Everything is read by `ledger()` in one crossing. Holdings, cost basis and
 * unrealised gain are derived from the transactions and the prices *together*, so
 * fetching them separately would let the screen show a holding computed from one
 * read beside a market value computed from another — two views of one truth,
 * which is the defect this whole application is a reply to.
 */
export interface Section3Api {
  ledger(): Promise<Result<LedgerData, Section3ErrorCode>>

  addPerson(draft: PersonDraft): Promise<Result<number, Section3ErrorCode>>
  renamePerson(id: number, name: string): Promise<Result<null, Section3ErrorCode>>
  setPersonColour(id: number, colour: string | null): Promise<Result<null, Section3ErrorCode>>
  reorderPersons(orderedIds: number[]): Promise<Result<null, Section3ErrorCode>>
  /** How many rows would move to Ortak, asked before the offer is made. */
  personUsage(id: number): Promise<Result<PersonUsage, Section3ErrorCode>>
  /** Removes the person and reassigns their rows; deletes no transaction. */
  deletePerson(id: number): Promise<Result<null, Section3ErrorCode>>

  addTransaction(draft: TransactionDraft): Promise<Result<number, Section3ErrorCode>>
  updateTransaction(patch: TransactionPatch): Promise<Result<null, Section3ErrorCode>>
  deleteTransaction(seq: number): Promise<Result<null, Section3ErrorCode>>

  setManualPrice(typeCode: TypeCode, value: number): Promise<Result<null, Section3ErrorCode>>
  clearManualPrice(typeCode: TypeCode): Promise<Result<null, Section3ErrorCode>>
}

/**
 * Section 4 — Calculation Zone (§9).
 *
 * The smallest surface in the application, for the least fancy section in it.
 * Total, average and median are computed in the renderer from the lines this
 * returns — they are three additions and a sort, and a crossing of the bridge to
 * fetch what the renderer already holds would be a second home for one truth.
 */
export interface Section4Api {
  lines(): Promise<Result<Line[], Section4ErrorCode>>
  addLine(draft: LineDraft): Promise<Result<number, Section4ErrorCode>>
  updateLine(patch: LinePatch): Promise<Result<null, Section4ErrorCode>>
  deleteLine(id: number): Promise<Result<null, Section4ErrorCode>>
  reorderLines(orderedIds: number[]): Promise<Result<null, Section4ErrorCode>>
}
