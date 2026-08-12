/**
 * The Section 1 half of the IPC surface.
 *
 * Same discipline as the vault's handlers: every argument is validated here
 * rather than trusted, nothing throws across the bridge, and a failure comes
 * back as a coarse code. The renderer is sandboxed and is treated as hostile
 * input even though it is our own code — that is what the sandbox is for.
 */

import { ipcMain } from 'electron'
import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'

import { IPC, type Result, type YearIndex } from '../../shared/ipc-contract.js'
import type {
  CategoryDraft,
  CategoryUsage,
  EntryPatch,
  Section1ErrorCode,
  YearUsage,
  YearWorkspace
} from '../../shared/section1/types.js'
import {
  MAX_CATEGORY_NAME_LENGTH,
  MAX_NOTE_LENGTH,
  VALUE_TYPES,
  isMonth
} from '../../shared/section1/types.js'
import * as s1 from '../vault/db/section1.js'
import { Section1Error } from '../vault/db/section1.js'
import { VaultDataError } from '../vault/db/errors.js'
import * as vault from '../vault/vault.js'

type S1Result<T> = Result<T, Section1ErrorCode>

const CODES: readonly string[] = [
  'LOCKED',
  'NO_SUCH_YEAR',
  'YEAR_EXISTS',
  'LAST_YEAR',
  'NO_SUCH_CATEGORY',
  'DUPLICATE_NAME',
  'INVALID_NAME',
  'INVALID_AMOUNT',
  'INVALID_YEAR',
  'INTERNAL'
]

function asCode(value: string): Section1ErrorCode {
  return (CODES.includes(value) ? value : 'INTERNAL') as Section1ErrorCode
}

/**
 * Run a handler against an open vault.
 *
 * The database handle is fetched per call and never retained: it is only valid
 * while the vault is unlocked, and the vault can lock itself between two clicks.
 */
function withVault<T>(fn: (db: DatabaseType) => T): S1Result<T> {
  const db = vault.database()
  if (!db) return { ok: false, error: 'LOCKED' }
  try {
    return { ok: true, value: fn(db) }
  } catch (error) {
    // The base class, not Section1Error: the year lifecycle is shared with
    // Section 2 (db/years.ts) and cannot know which section is asking, so it
    // throws the base. `asCode` still narrows anything unrecognised to
    // INTERNAL, so catching wider cannot widen what crosses the bridge.
    if (error instanceof VaultDataError) return { ok: false, error: asCode(error.code) }
    return { ok: false, error: 'INTERNAL' }
  }
}

function isId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function readYearIndex(db: DatabaseType): YearIndex {
  // A vault that has never had a year gets one, so the switcher always has
  // somewhere to be and the app never opens on a modal.
  s1.ensureAnyYear(db)
  return { years: s1.listYears(db), anchorYear: s1.accentAnchorYear(db) }
}

function asDraft(value: unknown): CategoryDraft {
  if (typeof value !== 'object' || value === null) throw new Section1Error('INTERNAL')
  const raw = value as Record<string, unknown>
  if (typeof raw['name'] !== 'string') throw new Section1Error('INVALID_NAME')
  // A coarse pre-trim cap, so the deep clean is never handed a megabyte.
  if (raw['name'].length > MAX_CATEGORY_NAME_LENGTH * 4) throw new Section1Error('INVALID_NAME')
  if (raw['kind'] !== 'income' && raw['kind'] !== 'expense') throw new Section1Error('INTERNAL')
  if (typeof raw['valueType'] !== 'string' || !VALUE_TYPES.includes(raw['valueType'] as never)) {
    throw new Section1Error('INTERNAL')
  }
  return {
    name: raw['name'],
    kind: raw['kind'],
    valueType: raw['valueType'] as CategoryDraft['valueType']
  }
}

function asPatch(value: unknown): EntryPatch {
  if (typeof value !== 'object' || value === null) throw new Section1Error('INTERNAL')
  const raw = value as Record<string, unknown>

  const year = raw['year']
  const month = raw['month']
  const categoryId = raw['categoryId']
  const amount = raw['amount']
  const note = raw['note']

  if (!s1.isValidYear(year)) throw new Section1Error('INVALID_YEAR')
  if (typeof month !== 'number' || !isMonth(month)) throw new Section1Error('INTERNAL')
  if (!isId(categoryId)) throw new Section1Error('NO_SUCH_CATEGORY')

  if (amount !== null && (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 0)) {
    throw new Section1Error('INVALID_AMOUNT')
  }
  if (note !== null && note !== undefined && typeof note !== 'string') {
    throw new Section1Error('INTERNAL')
  }
  if (typeof note === 'string' && note.length > MAX_NOTE_LENGTH * 4) {
    throw new Section1Error('INTERNAL')
  }

  return {
    year,
    month,
    categoryId,
    amount: amount as number | null,
    isRefund: raw['isRefund'] === true,
    note: typeof note === 'string' ? note : null
  }
}

export function registerSection1Handlers(): void {
  ipcMain.handle(IPC.s1Years, (): S1Result<YearIndex> => withVault(readYearIndex))

  ipcMain.handle(IPC.s1CreateYear, (_e, year: unknown): S1Result<YearIndex> =>
    withVault((db) => {
      if (!s1.isValidYear(year)) throw new Section1Error('INVALID_YEAR')
      s1.createYear(db, year)
      return readYearIndex(db)
    })
  )

  ipcMain.handle(IPC.s1Workspace, (_e, year: unknown): S1Result<YearWorkspace> =>
    withVault((db) => {
      if (!s1.isValidYear(year)) throw new Section1Error('INVALID_YEAR')
      return s1.readWorkspace(db, year)
    })
  )

  ipcMain.handle(IPC.s1AddCategory, (_e, year: unknown, draft: unknown): S1Result<number> =>
    withVault((db) => {
      if (!s1.isValidYear(year)) throw new Section1Error('INVALID_YEAR')
      return s1.addCategory(db, year, asDraft(draft))
    })
  )

  ipcMain.handle(IPC.s1RenameCategory, (_e, id: unknown, name: unknown): S1Result<null> =>
    withVault((db) => {
      if (!isId(id)) throw new Section1Error('NO_SUCH_CATEGORY')
      if (typeof name !== 'string') throw new Section1Error('INVALID_NAME')
      // A coarse pre-trim cap, so the deep clean is never handed a megabyte.
      if (name.length > MAX_CATEGORY_NAME_LENGTH * 4) throw new Section1Error('INVALID_NAME')
      s1.renameCategory(db, id, name)
      return null
    })
  )

  ipcMain.handle(IPC.s1RetypeCategory, (_e, id: unknown, valueType: unknown): S1Result<null> =>
    withVault((db) => {
      if (!isId(id)) throw new Section1Error('NO_SUCH_CATEGORY')
      if (typeof valueType !== 'string' || !VALUE_TYPES.includes(valueType as never)) {
        throw new Section1Error('INTERNAL')
      }
      s1.setCategoryValueType(db, id, valueType)
      return null
    })
  )

  ipcMain.handle(
    IPC.s1ReorderCategories,
    (_e, year: unknown, kind: unknown, orderedIds: unknown): S1Result<null> =>
      withVault((db) => {
        if (!s1.isValidYear(year)) throw new Section1Error('INVALID_YEAR')
        if (kind !== 'income' && kind !== 'expense') throw new Section1Error('INTERNAL')
        if (!Array.isArray(orderedIds)) throw new Section1Error('INTERNAL')
        s1.reorderCategories(db, year, kind, orderedIds.filter(isId))
        return null
      })
  )

  ipcMain.handle(IPC.s1CategoryUsage, (_e, id: unknown): S1Result<CategoryUsage> =>
    withVault((db) => {
      if (!isId(id)) throw new Section1Error('NO_SUCH_CATEGORY')
      return s1.categoryUsage(db, id)
    })
  )

  ipcMain.handle(IPC.s1DeleteCategory, (_e, id: unknown): S1Result<null> =>
    withVault((db) => {
      if (!isId(id)) throw new Section1Error('NO_SUCH_CATEGORY')
      s1.deleteCategory(db, id)
      return null
    })
  )

  ipcMain.handle(IPC.s1SetEntry, (_e, patch: unknown): S1Result<null> =>
    withVault((db) => {
      s1.setEntry(db, asPatch(patch))
      return null
    })
  )

  ipcMain.handle(IPC.s1YearUsage, (_e, year: unknown): S1Result<YearUsage> =>
    withVault((db) => {
      if (!s1.isValidYear(year)) throw new Section1Error('INVALID_YEAR')
      return s1.yearUsage(db, year)
    })
  )

  ipcMain.handle(IPC.s1DeleteYear, (_e, year: unknown): S1Result<YearIndex> =>
    withVault((db) => {
      if (!s1.isValidYear(year)) throw new Section1Error('INVALID_YEAR')
      s1.deleteYear(db, year)
      return readYearIndex(db)
    })
  )

  ipcMain.handle(
    IPC.s1SetAccentOverride,
    (_e, year: unknown, accent: unknown): S1Result<null> =>
      withVault((db) => {
        if (!s1.isValidYear(year)) throw new Section1Error('INVALID_YEAR')
        if (accent !== null && typeof accent !== 'string') throw new Section1Error('INTERNAL')
        // A coarse pre-trim cap: the longest legal token is `#RRGGBBAA`, nine
        // characters, so nothing legitimate is anywhere near this limit.
        if (typeof accent === 'string' && accent.length > 64) throw new Section1Error('INTERNAL')
        s1.setAccentOverride(db, year, accent)
        return null
      })
  )
}
