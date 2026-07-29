/**
 * The Section 4 half of the IPC surface.
 *
 * Same discipline as the three sections before it: every argument is validated
 * here rather than trusted, nothing throws across the bridge, and a failure comes
 * back as a coarse code. The renderer is sandboxed and is treated as hostile input
 * even though it is our own code — that is what the sandbox is for.
 */

import { ipcMain } from 'electron'
import type { Database as DatabaseType } from 'better-sqlite3-multiple-ciphers'

import { IPC, type Result } from '../../shared/ipc-contract.js'
import type {
  Line,
  LineDraft,
  LinePatch,
  Section4ErrorCode
} from '../../shared/section4/types.js'
import { MAX_LABEL_LENGTH } from '../../shared/section4/types.js'
import * as s4 from '../vault/db/section4.js'
import { Section4Error } from '../vault/db/section4.js'
import { VaultDataError } from '../vault/db/errors.js'
import * as vault from '../vault/vault.js'

type S4Result<T> = Result<T, Section4ErrorCode>

/** A runtime mirror of Section4ErrorCode; the union is erased at build time. */
const CODES: readonly string[] = [
  'LOCKED',
  'NO_SUCH_LINE',
  'INVALID_LABEL',
  'INVALID_VALUE',
  'INTERNAL'
]

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

function isId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function asLabel(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'string') throw new Section4Error('INVALID_LABEL')
  // A coarse pre-trim cap, so the deep clean is never handed a megabyte.
  if (value.length > MAX_LABEL_LENGTH * 4) throw new Section4Error('INVALID_LABEL')
  return value
}

function asValue(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Section4Error('INVALID_VALUE')
  }
  return value
}

/** Rebuilt rather than passed through, so no unexpected key travels with it. */
function asDraft(value: unknown): LineDraft {
  if (typeof value !== 'object' || value === null) throw new Section4Error('INTERNAL')
  const raw = value as Record<string, unknown>
  return { label: asLabel(raw['label']), value: asValue(raw['value']) }
}

/** Absent and null are kept apart: one leaves a field, the other clears it. */
function asPatch(value: unknown): LinePatch {
  if (typeof value !== 'object' || value === null) throw new Section4Error('INTERNAL')
  const raw = value as Record<string, unknown>

  const id = raw['id']
  if (!isId(id)) throw new Section4Error('NO_SUCH_LINE')

  const patch: LinePatch = { id }
  if (raw['label'] !== undefined) patch.label = asLabel(raw['label'])
  if (raw['value'] !== undefined) patch.value = asValue(raw['value'])
  return patch
}

export function registerSection4Handlers(): void {
  ipcMain.handle(IPC.s4Lines, (): S4Result<Line[]> => withVault(s4.readLines))

  ipcMain.handle(IPC.s4AddLine, (_e, draft: unknown): S4Result<number> =>
    withVault((db) => s4.addLine(db, asDraft(draft)))
  )

  ipcMain.handle(IPC.s4UpdateLine, (_e, patch: unknown): S4Result<null> =>
    withVault((db) => {
      s4.updateLine(db, asPatch(patch))
      return null
    })
  )

  ipcMain.handle(IPC.s4DeleteLine, (_e, id: unknown): S4Result<null> =>
    withVault((db) => {
      if (!isId(id)) throw new Section4Error('NO_SUCH_LINE')
      s4.deleteLine(db, id)
      return null
    })
  )

  ipcMain.handle(IPC.s4ReorderLines, (_e, orderedIds: unknown): S4Result<null> =>
    withVault((db) => {
      if (!Array.isArray(orderedIds) || !orderedIds.every(isId)) {
        throw new Section4Error('INTERNAL')
      }
      s4.reorderLines(db, orderedIds)
      return null
    })
  )
}
