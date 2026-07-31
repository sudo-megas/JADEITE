/**
 * The Section 4 half of the IPC surface.
 *
 * Same discipline as the three sections before it: every argument is validated
 * here rather than trusted, nothing throws across the bridge, and a failure comes
 * back as a coarse code. The renderer is sandboxed and is treated as hostile input
 * even though it is our own code — that is what the sandbox is for.
 *
 * Three channels for three acts. The validation here and the validation in
 * `db/section4.ts` say the same two things about a slot and a value, deliberately:
 * this side rejects a payload that is not the shape of a patch at all, and that
 * side is the last word for any caller, including a future one that is not this
 * bridge.
 */

import { ipcMain } from 'electron'
import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'

import { IPC, type Result } from '../../shared/ipc-contract.js'
import type { Cell, CellPatch, Section4ErrorCode } from '../../shared/section4/types.js'
import * as s4 from '../vault/db/section4.js'
import { Section4Error } from '../vault/db/section4.js'
import { VaultDataError } from '../vault/db/errors.js'
import * as vault from '../vault/vault.js'

type S4Result<T> = Result<T, Section4ErrorCode>

/** A runtime mirror of Section4ErrorCode; the union is erased at build time. */
const CODES: readonly string[] = ['LOCKED', 'INVALID_SLOT', 'INVALID_VALUE', 'INTERNAL']

function asCode(value: string): Section4ErrorCode {
  return (CODES.includes(value) ? value : 'INTERNAL') as Section4ErrorCode
}

function withVault<T>(fn: (db: DatabaseType) => T): S4Result<T> {
  const db = vault.database()
  if (!db) return { ok: false, error: 'LOCKED' }
  try {
    return { ok: true, value: fn(db) }
  } catch (error) {
    if (error instanceof VaultDataError) return { ok: false, error: asCode(error.code) }
    return { ok: false, error: 'INTERNAL' }
  }
}

/**
 * Rebuilt rather than passed through, so no unexpected key travels with it.
 *
 * Null and absent are the same answer here, unlike the patches of Sections 1 to
 * 3: a box has exactly one field, so there is nothing for "leave it alone" to
 * mean and every write says what the box now holds.
 */
function asPatch(value: unknown): CellPatch {
  if (typeof value !== 'object' || value === null) throw new Section4Error('INTERNAL')
  const raw = value as Record<string, unknown>

  const slot = raw['slot']
  if (typeof slot !== 'number') throw new Section4Error('INVALID_SLOT')

  const figure = raw['value']
  if (figure === null || figure === undefined) return { slot, value: null }
  if (typeof figure !== 'number') throw new Section4Error('INVALID_VALUE')
  return { slot, value: figure }
}

export function registerSection4Handlers(): void {
  ipcMain.handle(IPC.s4Cells, (): S4Result<Cell[]> => withVault(s4.readCells))

  ipcMain.handle(IPC.s4SetCell, (_e, patch: unknown): S4Result<null> =>
    withVault((db) => {
      s4.setCell(db, asPatch(patch))
      return null
    })
  )

  ipcMain.handle(IPC.s4Clear, (): S4Result<null> =>
    withVault((db) => {
      s4.clearCells(db)
      return null
    })
  )
}
