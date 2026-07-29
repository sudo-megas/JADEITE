/**
 * The Section 2 half of the IPC surface.
 *
 * Same discipline as Section 1's handlers: every argument is validated here
 * rather than trusted, nothing throws across the bridge, and a failure comes
 * back as a coarse code. The renderer is sandboxed and is treated as hostile
 * input even though it is our own code — that is what the sandbox is for.
 *
 * The validation here and the validation in db/section2.ts are deliberately
 * both present. This layer coerces a shape out of whatever arrived; that layer
 * re-checks the meaning of it. Neither is allowed to assume the other ran.
 */

import { ipcMain } from 'electron'
import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'

import { IPC, type Result, type YearIndex } from '../../shared/ipc-contract.js'
import type {
  BankDraft,
  BankUsage,
  CellPatch,
  Section2ErrorCode,
  YearGrid
} from '../../shared/section2/types.js'
import { MAX_BANK_NAME_LENGTH, MAX_COUNTER_PARTY_LENGTH } from '../../shared/section2/types.js'
import { isMonth, isValidYear } from '../../shared/calendar.js'
import * as s2 from '../vault/db/section2.js'
import { Section2Error } from '../vault/db/section2.js'
import * as years from '../vault/db/years.js'
import { VaultDataError } from '../vault/db/errors.js'
import * as vault from '../vault/vault.js'

type S2Result<T> = Result<T, Section2ErrorCode>

/**
 * A runtime mirror of Section2ErrorCode.
 *
 * The union is erased at build time, so the allow-list has to exist as data.
 * Anything not on it becomes INTERNAL, which is what makes catching a wide
 * error type safe: an unrecognised code cannot widen what reaches the renderer.
 */
const CODES: readonly string[] = [
  'LOCKED',
  'NO_SUCH_YEAR',
  'YEAR_EXISTS',
  'ARCHIVED',
  'NO_SUCH_BANK',
  'DUPLICATE_NAME',
  'INVALID_NAME',
  'INVALID_AMOUNT',
  'INVALID_LIMIT',
  'INVALID_YEAR',
  'INTERNAL'
]

function asCode(value: string): Section2ErrorCode {
  return (CODES.includes(value) ? value : 'INTERNAL') as Section2ErrorCode
}

/**
 * Run a handler against an open vault.
 *
 * The database handle is fetched per call and never retained: it is only valid
 * while the vault is unlocked, and the vault can lock itself between two clicks.
 */
function withVault<T>(fn: (db: DatabaseType) => T): S2Result<T> {
  const db = vault.database()
  if (!db) return { ok: false, error: 'LOCKED' }
  try {
    return { ok: true, value: fn(db) }
  } catch (error) {
    // The base class, so the shared year lifecycle's own failures survive.
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
  years.ensureAnyYear(db)
  return { years: years.listYears(db), anchorYear: years.accentAnchorYear(db) }
}

/**
 * Rebuild the draft rather than passing the renderer's object through.
 *
 * A fresh literal cannot carry an unexpected key or a prototype along with it,
 * and every field has been looked at by the time it exists.
 */
function asDraft(value: unknown): BankDraft {
  if (typeof value !== 'object' || value === null) throw new Section2Error('INTERNAL')
  const raw = value as Record<string, unknown>

  const name = raw['name']
  const limit = raw['creditLimit']
  const party = raw['counterParty']

  if (typeof name !== 'string') throw new Section2Error('INVALID_NAME')
  // A coarse pre-trim cap, so the deep clean is never handed a megabyte.
  if (name.length > MAX_BANK_NAME_LENGTH * 4) throw new Section2Error('INVALID_NAME')

  const isCounter = raw['isCounter'] === true

  if (limit !== undefined && (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 0)) {
    throw new Section2Error('INVALID_LIMIT')
  }
  if (party !== null && party !== undefined && typeof party !== 'string') {
    throw new Section2Error('INTERNAL')
  }
  if (typeof party === 'string' && party.length > MAX_COUNTER_PARTY_LENGTH * 4) {
    throw new Section2Error('INTERNAL')
  }

  return {
    name,
    creditLimit: typeof limit === 'number' ? limit : 0,
    isCounter,
    counterParty: typeof party === 'string' ? party : null
  }
}

function asPatch(value: unknown): CellPatch {
  if (typeof value !== 'object' || value === null) throw new Section2Error('INTERNAL')
  const raw = value as Record<string, unknown>

  const year = raw['year']
  const month = raw['month']
  const bankId = raw['bankId']
  const amount = raw['amount']

  if (!isValidYear(year)) throw new Section2Error('INVALID_YEAR')
  if (typeof month !== 'number' || !isMonth(month)) throw new Section2Error('INTERNAL')
  if (!isId(bankId)) throw new Section2Error('NO_SUCH_BANK')

  if (amount !== null && (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 0)) {
    throw new Section2Error('INVALID_AMOUNT')
  }

  return { year, month, bankId, amount: amount as number | null }
}

export function registerSection2Handlers(): void {
  ipcMain.handle(IPC.s2Years, (): S2Result<YearIndex> => withVault(readYearIndex))

  ipcMain.handle(IPC.s2CreateYear, (_e, year: unknown): S2Result<YearIndex> =>
    withVault((db) => {
      if (!isValidYear(year)) throw new Section2Error('INVALID_YEAR')
      years.createYear(db, year)
      return readYearIndex(db)
    })
  )

  ipcMain.handle(IPC.s2Grid, (_e, year: unknown): S2Result<YearGrid> =>
    withVault((db) => {
      if (!isValidYear(year)) throw new Section2Error('INVALID_YEAR')
      return s2.readGrid(db, year)
    })
  )

  ipcMain.handle(IPC.s2AddBank, (_e, year: unknown, draft: unknown): S2Result<number> =>
    withVault((db) => {
      if (!isValidYear(year)) throw new Section2Error('INVALID_YEAR')
      return s2.addBank(db, year, asDraft(draft))
    })
  )

  ipcMain.handle(IPC.s2RenameBank, (_e, id: unknown, name: unknown): S2Result<null> =>
    withVault((db) => {
      if (!isId(id)) throw new Section2Error('NO_SUCH_BANK')
      s2.renameBank(db, id, name)
      return null
    })
  )

  ipcMain.handle(IPC.s2SetCreditLimit, (_e, id: unknown, limit: unknown): S2Result<null> =>
    withVault((db) => {
      if (!isId(id)) throw new Section2Error('NO_SUCH_BANK')
      s2.setCreditLimit(db, id, limit)
      return null
    })
  )

  ipcMain.handle(IPC.s2SetCounterParty, (_e, id: unknown, party: unknown): S2Result<null> =>
    withVault((db) => {
      if (!isId(id)) throw new Section2Error('NO_SUCH_BANK')
      s2.setCounterParty(db, id, party)
      return null
    })
  )

  ipcMain.handle(
    IPC.s2ReorderBanks,
    (_e, year: unknown, isCounter: unknown, orderedIds: unknown): S2Result<null> =>
      withVault((db) => {
        if (!isValidYear(year)) throw new Section2Error('INVALID_YEAR')
        if (!Array.isArray(orderedIds) || !orderedIds.every(isId)) {
          throw new Section2Error('INTERNAL')
        }
        s2.reorderBanks(db, year, isCounter === true, orderedIds)
        return null
      })
  )

  ipcMain.handle(IPC.s2BankUsage, (_e, id: unknown): S2Result<BankUsage> =>
    withVault((db) => {
      if (!isId(id)) throw new Section2Error('NO_SUCH_BANK')
      return s2.bankUsage(db, id)
    })
  )

  ipcMain.handle(IPC.s2DeleteBank, (_e, id: unknown): S2Result<null> =>
    withVault((db) => {
      if (!isId(id)) throw new Section2Error('NO_SUCH_BANK')
      s2.deleteBank(db, id)
      return null
    })
  )

  ipcMain.handle(IPC.s2SetCell, (_e, patch: unknown): S2Result<null> =>
    withVault((db) => {
      s2.setCell(db, asPatch(patch))
      return null
    })
  )

  ipcMain.handle(IPC.s2SetArchived, (_e, year: unknown, archived: unknown): S2Result<null> =>
    withVault((db) => {
      if (!isValidYear(year)) throw new Section2Error('INVALID_YEAR')
      s2.setArchived(db, year, archived === true)
      return null
    })
  )
}
