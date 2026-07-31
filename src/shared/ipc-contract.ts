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
  PaymentsGrid,
  Section2ErrorCode
} from './section2/types.js'
import type {
  LedgerData,
  PersonDraft,
  PersonUsage,
  RefreshOutcome,
  Section3ErrorCode,
  TransactionDraft,
  TransactionPatch,
  TypeCode
} from './section3/types.js'
// Section 2 already owns the unqualified `CellPatch` in this file, and both
// sections genuinely have one; the alias renames the newcomer rather than the
// import that was here first.
import type {
  Cell,
  CellPatch as Section4CellPatch,
  Section4ErrorCode
} from './section4/types.js'
import type {
  BackupCandidate,
  BackupErrorCode,
  BackupReason,
  BackupReceipt,
  BackupStatus
} from './backup/types.js'

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

  // Section 2 — Payments / Installments (§7). No year channels: the section
  // holds one standing grid (§7.1, §7.3 as amended).
  s2Grid: 's2:grid',
  s2AddBank: 's2:add-bank',
  s2RenameBank: 's2:rename-bank',
  s2SetCreditLimit: 's2:set-credit-limit',
  s2SetCounterParty: 's2:set-counter-party',
  s2ReorderBanks: 's2:reorder-banks',
  s2BankUsage: 's2:bank-usage',
  s2DeleteBank: 's2:delete-bank',
  s2SetCell: 's2:set-cell',

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
  /**
   * Ask the provider once (§14). Manual refresh is primary; this is the button.
   * It hangs off Section 3 rather than opening a new top-level namespace,
   * because a live price is a fact about a valuable and belongs where the rest
   * of them are.
   */
  s3RefreshPrices: 's3:refresh-prices',

  // Section 4 — Calculation Zone (§9). Three channels: read the grid, write one
  // box, empty every box. There is no add and no reorder, because a grid of
  // fixed boxes has nothing to add and no order to rearrange.
  s4Cells: 's4:cells',
  s4SetCell: 's4:set-cell',
  s4Clear: 's4:clear',

  /**
   * Backup, restore and machine transfer (§15).
   *
   * A top-level namespace rather than a hanging-off of `vault`, unlike
   * `s3:refresh-prices` which was hung off Section 3 deliberately. The rule
   * that decided both is the same: a channel belongs where its subject lives.
   * A live price is a fact about a valuable. A backup is not a fact about the
   * vault — half of these channels must answer while the vault is **shut**,
   * because §4.4's second row is the disk-death case and there is no vault left
   * to hang them off.
   *
   * `select` and `restore` are two channels for one act on purpose. The picker
   * runs in the main process and the container is verified there, so the
   * renderer can show the owner what they are about to overwrite — §15 requires
   * "explicit confirmation", and a confirmation that cannot describe what it is
   * confirming is a formality. The chosen container waits in the main process
   * between the two calls; its path never crosses.
   */
  backupStatus: 'backup:status',
  backupCreate: 'backup:create',
  backupSelect: 'backup:select',
  backupRestore: 'backup:restore',
  backupCancel: 'backup:cancel'
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
   * Minutes between automatic price refreshes; 0 is off (§14).
   *
   * In the vault rather than in `config.json`, unlike the palette: it is the
   * only setting whose value causes the machine to open a network connection,
   * and §4.1 puts anything that governs access or egress behind the key.
   *
   * No `DEFAULT_SETTINGS` entry, deliberately. `getSetting` answers null for a
   * key with no default and both readers treat null as off, so seeding a row
   * saying "off" would write a fact into every fresh vault that its absence
   * already states.
   */
  priceRefreshMinutes: 'price_refresh_minutes',
  /**
   * The year the palette's accent sequence counts from (§12.3).
   *
   * Written once, when the vault's first year is created, and never
   * recalculated. Deriving it from the earliest year present would make every
   * workspace's colour depend on the whole dataset, so adding one older year
   * later would repaint all the others — and the accent is exactly what the
   * owner navigates by after a month of use.
   */
  accentAnchorYear: 'accent_anchor_year',
  /**
   * This vault's lineage — sixteen random bytes, minted by the v5 migration
   * and never rewritten (§15). Carried in every `.jbk` so a restore can tell a
   * backup of *this* vault from another machine's before it touches anything.
   */
  vaultId: 'vault_id',
  /**
   * Days between backup reminders; absent is off (§15).
   *
   * No `DEFAULT_SETTINGS` entry, following `priceRefreshMinutes`: null already
   * means off and seeding a row saying so writes a fact its absence states.
   * Realisation IX ships with the reminder off and the choice on the Backup
   * page, because a prompt the owner never asked for is a nag — the one
   * mandated prompt is the credential-change one of §4.4, which is not this.
   */
  backupReminderDays: 'backup_reminder_days',
  /**
   * When each section was last edited, written by the v5 triggers.
   *
   * Read only when a backup is sealed. The literal strings are repeated in the
   * migration's SQL, which cannot import them; the migration suite asserts the
   * two homes agree.
   */
  sectionTouchedAt: {
    s1: 's1_touched_at',
    s2: 's2_touched_at',
    s3: 's3_touched_at',
    s4: 's4_touched_at'
  }
} as const

export const DEFAULT_SETTINGS: Readonly<Record<string, string>> = {
  [SETTING_KEYS.autoLockMinutes]: '10'
}

/**
 * Which settings the renderer may read, and which it may write.
 *
 * `settings:get` and `settings:set` were generic over any string key, which was
 * true of the table and wrong as a contract. The vault holds rows the renderer
 * has no business naming: `vault_id` is minted once by a migration and
 * `s1_touched_at` … `s4_touched_at` are kept by triggers, and both are read
 * when a backup is sealed (§15). A renderer able to write them could make this
 * vault's own backups demand a credential — breaking §4.4's first row, which
 * promises the opposite — or fabricate the edit times a merge chooser will
 * one day believe.
 *
 * That was never exploitable from the interface. It did not need to be: the
 * bridge is the boundary, and a boundary whose safety rests on the renderer
 * asking only for what it happens to need today is not one. `lineage.ts` says
 * of the vault id that "there is no write path to get wrong", and these two
 * lists are what make that sentence true.
 *
 * **Readable is not writable.** `backup_reminder_days` is written here and read
 * back through `backup.status()`, which reports it alongside the log it is
 * judged against — one crossing for one screen, rather than a figure and its
 * consequence fetched separately.
 */
export const RENDERER_READABLE_SETTINGS: readonly string[] = Object.freeze([
  SETTING_KEYS.autoLockMinutes,
  SETTING_KEYS.priceRefreshMinutes
])

export const RENDERER_WRITABLE_SETTINGS: readonly string[] = Object.freeze([
  SETTING_KEYS.autoLockMinutes,
  SETTING_KEYS.priceRefreshMinutes,
  SETTING_KEYS.backupReminderDays
])

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
  /** Backup, restore and machine transfer (§15). Half of it answers while locked. */
  backup: BackupApi
}

/**
 * Backup, restore and machine transfer — XJADEITE §15, §4.4.
 *
 * Nothing on this surface carries a filesystem path in either direction. The
 * picker runs in the main process, the chosen container waits there, and the
 * renderer learns what is in it and nothing about where it came from. That is
 * not decoration: `hardening.spec.ts` asserts that no path is reachable through
 * the bridge, and a backup feature is the obvious place for one to leak.
 */
export interface BackupApi {
  /** Needs the vault open — the log and the reminder setting live inside it. */
  status(): Promise<Result<BackupStatus, BackupErrorCode>>
  /** Ask where, seal the vault, write it, record it. Needs the vault open. */
  create(reason: BackupReason): Promise<Result<BackupReceipt, BackupErrorCode>>
  /**
   * Choose a container and read it, without applying anything.
   *
   * Answers while the vault is locked, because the case this exists for is a
   * dead disk (§4.4 row 2). The container stays in the main process until
   * `restore` or `cancel`.
   */
  select(): Promise<Result<BackupCandidate, BackupErrorCode>>
  /**
   * Replace this machine's vault with the selected container.
   *
   * `credential` is the password **or** recovery key that was current when the
   * backup was taken, and is required exactly when the candidate said it would
   * be. Pass null when it said otherwise: an open vault restoring its own
   * backup already holds the key (§4.4 row 1).
   */
  restore(credential: string | null): Promise<Result<null, BackupErrorCode>>
  /** Forget the selected container. */
  cancel(): Promise<Result<null, BackupErrorCode>>
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
 * There is no year on this surface at all. Ödemeler is one standing grid of the
 * twelve months the owner is living in (§7.1, §7.3 as amended by point revision
 * v0.8b), so there is nothing to select, nothing to create and nothing to
 * freeze. The years that remain are Section 1's, and its year menu is their one
 * home — a second copy of a destructive dialogue would be the "same list kept in
 * two places" defect of §7.1, rebuilt deliberately.
 */
export interface Section2Api {
  grid(): Promise<Result<PaymentsGrid, Section2ErrorCode>>
  addBank(draft: BankDraft): Promise<Result<number, Section2ErrorCode>>
  renameBank(id: number, name: string): Promise<Result<null, Section2ErrorCode>>
  setCreditLimit(id: number, limit: number): Promise<Result<null, Section2ErrorCode>>
  setCounterParty(id: number, party: string | null): Promise<Result<null, Section2ErrorCode>>
  reorderBanks(isCounter: boolean, orderedIds: number[]): Promise<Result<null, Section2ErrorCode>>
  /** What deleting this column would destroy, asked before it is offered. */
  bankUsage(id: number): Promise<Result<BankUsage, Section2ErrorCode>>
  deleteBank(id: number): Promise<Result<null, Section2ErrorCode>>
  setCell(patch: CellPatch): Promise<Result<null, Section2ErrorCode>>
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

  /**
   * Ask the live provider once, and say what happened (§14).
   *
   * This resolves `ok` even when the provider failed: an unreachable source is
   * an ordinary state of the world, not an error in the application, and §14
   * requires that it be "quiet and non-blocking". The `RefreshOutcome` carries
   * the failure so 3c can show a line about it while every manual price on the
   * screen carries on being the authority.
   */
  refreshPrices(): Promise<Result<RefreshOutcome, Section3ErrorCode>>
}

/**
 * Section 4 — Calculation Zone (§9).
 *
 * The smallest surface in the application, for the least fancy section in it.
 * Total, average and median are computed in the renderer from the cells this
 * returns — they are three additions and a sort, and a crossing of the bridge to
 * fetch what the renderer already holds would be a second home for one truth.
 *
 * `cells` answers only the boxes that carry a figure, however many boxes the
 * grid is drawing: the table is sparse, and a hundred empty boxes have nothing
 * to say. How many rows to draw is the renderer's question and is answered from
 * these cells (`shared/section4/engine.ts`), never stored.
 */
export interface Section4Api {
  cells(): Promise<Result<Cell[], Section4ErrorCode>>
  setCell(patch: Section4CellPatch): Promise<Result<null, Section4ErrorCode>>
  /** Empty every box. Confirmed in the interface, never here. */
  clear(): Promise<Result<null, Section4ErrorCode>>
}
