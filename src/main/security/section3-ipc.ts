/**
 * The Section 3 half of the IPC surface.
 *
 * Same discipline as Sections 1 and 2: every argument is validated here rather
 * than trusted, nothing throws across the bridge, and a failure comes back as a
 * coarse code. The renderer is sandboxed and is treated as hostile input even
 * though it is our own code — that is what the sandbox is for.
 *
 * The validation here and the validation in db/section3.ts are deliberately both
 * present. This layer coerces a shape out of whatever arrived; that layer
 * re-checks the meaning of it. Neither is allowed to assume the other ran.
 */

import { ipcMain } from 'electron'
import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'

import { IPC, type Result } from '../../shared/ipc-contract.js'
import type {
  LedgerData,
  PersonDraft,
  PersonUsage,
  Section3ErrorCode,
  TransactionDraft,
  TransactionPatch
} from '../../shared/section3/types.js'
import {
  MAX_NOTE_LENGTH,
  MAX_PERSON_NAME_LENGTH,
  MAX_SOURCE_LENGTH
} from '../../shared/section3/types.js'
import * as s3 from '../vault/db/section3.js'
import { Section3Error } from '../vault/db/section3.js'
import { VaultDataError } from '../vault/db/errors.js'
import * as vault from '../vault/vault.js'

type S3Result<T> = Result<T, Section3ErrorCode>

/**
 * A runtime mirror of Section3ErrorCode.
 *
 * The union is erased at build time, so the allow-list has to exist as data.
 * Anything not on it becomes INTERNAL, which is what makes catching a wide error
 * type safe: an unrecognised code cannot widen what reaches the renderer.
 */
const CODES: readonly string[] = [
  'LOCKED',
  'NO_SUCH_TRANSACTION',
  'NO_SUCH_PERSON',
  'NO_SUCH_TYPE',
  'BUILTIN_PERSON',
  'DUPLICATE_NAME',
  'INVALID_NAME',
  'INVALID_DATE',
  'INVALID_QUANTITY',
  'INVALID_PRICE',
  'INTERNAL'
]

function asCode(value: string): Section3ErrorCode {
  return (CODES.includes(value) ? value : 'INTERNAL') as Section3ErrorCode
}

/**
 * Run a handler against an open vault.
 *
 * The database handle is fetched per call and never retained: it is only valid
 * while the vault is unlocked, and the vault can lock itself between two
 * keystrokes.
 */
function withVault<T>(fn: (db: DatabaseType) => T): S3Result<T> {
  const db = vault.database()
  if (!db) return { ok: false, error: 'LOCKED' }
  try {
    return { ok: true, value: fn(db) }
  } catch (error) {
    if (error instanceof VaultDataError) return { ok: false, error: asCode(error.code) }
    return { ok: false, error: 'INTERNAL' }
  }
}

function isId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

/** A coarse pre-trim cap, so the deep clean is never handed a megabyte. */
function preCap(value: unknown, limit: number, code: string): void {
  if (typeof value === 'string' && value.length > limit * 4) throw new Section3Error(code)
}

/**
 * Rebuild the draft rather than passing the renderer's object through.
 *
 * A fresh literal cannot carry an unexpected key or a prototype along with it,
 * and every field has been looked at by the time it exists.
 */
function asPersonDraft(value: unknown): PersonDraft {
  if (typeof value !== 'object' || value === null) throw new Section3Error('INTERNAL')
  const raw = value as Record<string, unknown>

  const name = raw['name']
  if (typeof name !== 'string') throw new Section3Error('INVALID_NAME')
  preCap(name, MAX_PERSON_NAME_LENGTH, 'INVALID_NAME')

  const colour = raw['colour']
  if (colour !== null && colour !== undefined && typeof colour !== 'string') {
    throw new Section3Error('INTERNAL')
  }

  return { name, colour: typeof colour === 'string' ? colour : null }
}

function asTransactionDraft(value: unknown): TransactionDraft {
  if (typeof value !== 'object' || value === null) throw new Section3Error('INTERNAL')
  const raw = value as Record<string, unknown>

  const date = raw['date']
  if (typeof date !== 'string' || date.length > 32) throw new Section3Error('INVALID_DATE')

  const typeCode = raw['typeCode']
  if (typeof typeCode !== 'string' || typeCode.length > 32) {
    throw new Section3Error('NO_SUCH_TYPE')
  }

  const direction = raw['direction']
  if (direction !== 'acquire' && direction !== 'dispose') throw new Section3Error('INTERNAL')

  // Denomination and count, not quantity: quantity is a generated column and no
  // caller is permitted to assert it. The product's bound is checked in the vault
  // layer, which is the side that knows `MAX_QUANTITY`; here the job is only to
  // prove two safe positive integers arrived.
  const denomination = raw['denomination']
  if (
    typeof denomination !== 'number' ||
    !Number.isSafeInteger(denomination) ||
    denomination <= 0
  ) {
    throw new Section3Error('INVALID_QUANTITY')
  }

  const count = raw['count']
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count <= 0) {
    throw new Section3Error('INVALID_QUANTITY')
  }

  const unitPrice = raw['unitPrice']
  if (typeof unitPrice !== 'number' || !Number.isSafeInteger(unitPrice) || unitPrice < 0) {
    throw new Section3Error('INVALID_PRICE')
  }

  const source = raw['source']
  const note = raw['note']
  if (source !== null && source !== undefined && typeof source !== 'string') {
    throw new Section3Error('INTERNAL')
  }
  if (note !== null && note !== undefined && typeof note !== 'string') {
    throw new Section3Error('INTERNAL')
  }
  preCap(source, MAX_SOURCE_LENGTH, 'INTERNAL')
  preCap(note, MAX_NOTE_LENGTH, 'INTERNAL')

  const personId = raw['personId']
  if (personId !== null && personId !== undefined && !isId(personId)) {
    throw new Section3Error('NO_SUCH_PERSON')
  }

  return {
    date,
    dateProvisional: raw['dateProvisional'] === true,
    typeCode: typeCode as TransactionDraft['typeCode'],
    direction,
    denomination,
    count,
    unitPrice,
    source: typeof source === 'string' ? source : null,
    note: typeof note === 'string' ? note : null,
    personId: typeof personId === 'number' ? personId : null
  }
}

/**
 * Rebuild a patch, preserving the difference between absent and null.
 *
 * Absent means "leave this alone" and null means "clear it", and collapsing the
 * two would make a single-field correction silently wipe the rest of the row.
 * Nothing arrives as `undefined` over the bridge, so a key that is present is a
 * key the caller meant.
 */
function asTransactionPatch(value: unknown): TransactionPatch {
  if (typeof value !== 'object' || value === null) throw new Section3Error('INTERNAL')
  const raw = value as Record<string, unknown>

  const seq = raw['seq']
  if (!isId(seq)) throw new Section3Error('NO_SUCH_TRANSACTION')

  const patch: TransactionPatch = { seq }

  if (raw['date'] !== undefined) {
    const date = raw['date']
    if (typeof date !== 'string' || date.length > 32) throw new Section3Error('INVALID_DATE')
    patch.date = date
  }

  if (raw['dateProvisional'] !== undefined) patch.dateProvisional = raw['dateProvisional'] === true

  if (raw['typeCode'] !== undefined) {
    const typeCode = raw['typeCode']
    if (typeof typeCode !== 'string' || typeCode.length > 32) {
      throw new Section3Error('NO_SUCH_TYPE')
    }
    patch.typeCode = typeCode as TransactionDraft['typeCode']
  }

  if (raw['direction'] !== undefined) {
    const direction = raw['direction']
    if (direction !== 'acquire' && direction !== 'dispose') throw new Section3Error('INTERNAL')
    patch.direction = direction
  }

  // Either factor may arrive alone — the grid edits one cell at a time — and the
  // vault validates the resulting pair against the row's other half.
  if (raw['denomination'] !== undefined) {
    const denomination = raw['denomination']
    if (
      typeof denomination !== 'number' ||
      !Number.isSafeInteger(denomination) ||
      denomination <= 0
    ) {
      throw new Section3Error('INVALID_QUANTITY')
    }
    patch.denomination = denomination
  }

  if (raw['count'] !== undefined) {
    const count = raw['count']
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count <= 0) {
      throw new Section3Error('INVALID_QUANTITY')
    }
    patch.count = count
  }

  if (raw['unitPrice'] !== undefined) {
    const unitPrice = raw['unitPrice']
    if (typeof unitPrice !== 'number' || !Number.isSafeInteger(unitPrice) || unitPrice < 0) {
      throw new Section3Error('INVALID_PRICE')
    }
    patch.unitPrice = unitPrice
  }

  if (raw['source'] !== undefined) {
    const source = raw['source']
    if (source !== null && typeof source !== 'string') throw new Section3Error('INTERNAL')
    preCap(source, MAX_SOURCE_LENGTH, 'INTERNAL')
    patch.source = source
  }

  if (raw['note'] !== undefined) {
    const note = raw['note']
    if (note !== null && typeof note !== 'string') throw new Section3Error('INTERNAL')
    preCap(note, MAX_NOTE_LENGTH, 'INTERNAL')
    patch.note = note
  }

  if (raw['personId'] !== undefined) {
    const personId = raw['personId']
    if (personId !== null && !isId(personId)) throw new Section3Error('NO_SUCH_PERSON')
    patch.personId = personId
  }

  return patch
}

export function registerSection3Handlers(): void {
  ipcMain.handle(IPC.s3Ledger, (): S3Result<LedgerData> => withVault(s3.readLedger))

  // --- Persons -------------------------------------------------------------

  ipcMain.handle(IPC.s3AddPerson, (_e, draft: unknown): S3Result<number> =>
    withVault((db) => s3.addPerson(db, asPersonDraft(draft)))
  )

  ipcMain.handle(IPC.s3RenamePerson, (_e, id: unknown, name: unknown): S3Result<null> =>
    withVault((db) => {
      if (!isId(id)) throw new Section3Error('NO_SUCH_PERSON')
      preCap(name, MAX_PERSON_NAME_LENGTH, 'INVALID_NAME')
      s3.renamePerson(db, id, name)
      return null
    })
  )

  ipcMain.handle(IPC.s3SetPersonColour, (_e, id: unknown, colour: unknown): S3Result<null> =>
    withVault((db) => {
      if (!isId(id)) throw new Section3Error('NO_SUCH_PERSON')
      s3.setPersonColour(db, id, colour)
      return null
    })
  )

  ipcMain.handle(IPC.s3ReorderPersons, (_e, orderedIds: unknown): S3Result<null> =>
    withVault((db) => {
      if (!Array.isArray(orderedIds) || !orderedIds.every(isId)) {
        throw new Section3Error('INTERNAL')
      }
      s3.reorderPersons(db, orderedIds)
      return null
    })
  )

  ipcMain.handle(IPC.s3PersonUsage, (_e, id: unknown): S3Result<PersonUsage> =>
    withVault((db) => {
      if (!isId(id)) throw new Section3Error('NO_SUCH_PERSON')
      return s3.personUsage(db, id)
    })
  )

  ipcMain.handle(IPC.s3DeletePerson, (_e, id: unknown): S3Result<null> =>
    withVault((db) => {
      if (!isId(id)) throw new Section3Error('NO_SUCH_PERSON')
      s3.deletePerson(db, id)
      return null
    })
  )

  // --- The ledger ----------------------------------------------------------

  ipcMain.handle(IPC.s3AddTransaction, (_e, draft: unknown): S3Result<number> =>
    withVault((db) => s3.addTransaction(db, asTransactionDraft(draft)))
  )

  ipcMain.handle(IPC.s3UpdateTransaction, (_e, patch: unknown): S3Result<null> =>
    withVault((db) => {
      s3.updateTransaction(db, asTransactionPatch(patch))
      return null
    })
  )

  ipcMain.handle(IPC.s3DeleteTransaction, (_e, seq: unknown): S3Result<null> =>
    withVault((db) => {
      if (!isId(seq)) throw new Section3Error('NO_SUCH_TRANSACTION')
      s3.deleteTransaction(db, seq)
      return null
    })
  )

  // --- 3c, prices ----------------------------------------------------------

  ipcMain.handle(IPC.s3SetManualPrice, (_e, typeCode: unknown, value: unknown): S3Result<null> =>
    withVault((db) => {
      s3.setManualPrice(db, typeCode, value)
      return null
    })
  )

  ipcMain.handle(IPC.s3ClearManualPrice, (_e, typeCode: unknown): S3Result<null> =>
    withVault((db) => {
      s3.clearManualPrice(db, typeCode)
      return null
    })
  )
}
