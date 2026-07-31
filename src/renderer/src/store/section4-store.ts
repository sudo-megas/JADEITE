/**
 * Section 4's view of the vault.
 *
 * The same rule the three stores before it keep: every mutation re-reads from the
 * vault rather than patching a local copy. The read is cheap enough to keep the
 * rule honest here — the table is sparse, so it returns only the boxes carrying a
 * figure, which is a hundred rows in the month the owner described it about and a
 * thousand at the grid's ceiling.
 *
 * The three statistics are *not* here. They are computed in the component from
 * the cells this store holds, because they are three additions and a sort —
 * putting them in the store would give one truth a second home, and putting them
 * behind the bridge would cross it to fetch what the renderer already has.
 *
 * `rowsShown` is the exception to all of that: the one piece of state here that
 * is not a copy of something the vault holds. `visibleRows` gives the floor —
 * one empty row after the last figure — and the floor drops when a box is
 * emptied. A grid that shrank at that moment would take the row the caret is
 * standing in out from under it, so this keeps the high-water mark of the
 * session instead: it rises with the figures and comes back down only when the
 * grid is reloaded or emptied outright.
 */

import { create } from 'zustand'

import { visibleRows } from '@shared/section4/engine'
import type { Cell, CellPatch, Section4ErrorCode } from '@shared/section4/types'
import { MIN_ROWS } from '@shared/section4/types'
import { registerVaultScoped } from './vault-scoped.js'

interface Section4State {
  cells: Cell[]
  loading: boolean
  error: Section4ErrorCode | null
  /** Rows the grid is drawing; a high-water mark, never lowered by an edit. */
  rowsShown: number

  load(): Promise<void>
  setCell(patch: CellPatch): Promise<void>
  clear(): Promise<void>
  dismissError(): void
  reset(): void
}

const api = (): typeof window.jadeite.section4 => window.jadeite.section4

type Actions = 'load' | 'setCell' | 'clear' | 'dismissError' | 'reset'

function emptyState(): Omit<Section4State, Actions> {
  return { cells: [], loading: false, error: null, rowsShown: MIN_ROWS }
}

export const useSection4Store = create<Section4State>((set, get) => ({
  ...emptyState(),

  async load() {
    set({ loading: true, error: null })
    const result = await api().cells()
    if (!result.ok) {
      set({ loading: false, error: result.error })
      return
    }
    // A fresh read is also a fresh mark: whatever the grid grew to last session
    // is not a fact about this one, only what the stored figures ask for is.
    set({ cells: result.value, loading: false, rowsShown: visibleRows(result.value) })
  },

  async setCell(patch) {
    await run(set, get, () => api().setCell(patch))
  },

  async clear() {
    if (await run(set, get, () => api().clear())) {
      // The only place the mark comes down while the section stays on screen.
      // Emptying every box is the owner saying the grid is finished with, so the
      // rows it grew to are finished with too.
      set({ rowsShown: visibleRows(get().cells) })
    }
  },

  dismissError() {
    set({ error: null })
  },

  reset() {
    set(emptyState())
  }
}))

registerVaultScoped(() => {
  useSection4Store.getState().reset()
})

type Setter = (partial: Partial<Section4State>) => void
type Getter = () => Section4State

async function run(
  set: Setter,
  get: Getter,
  operation: () => Promise<{ ok: true; value: unknown } | { ok: false; error: Section4ErrorCode }>
): Promise<boolean> {
  set({ error: null })

  let result: Awaited<ReturnType<typeof operation>>
  try {
    result = await operation()
  } catch {
    set({ error: 'INTERNAL' })
    return false
  }

  if (!result.ok) {
    set({ error: result.error })
    return false
  }

  const reread = await window.jadeite.section4.cells()
  if (!reread.ok) {
    set({ error: reread.error })
    return false
  }

  set({
    cells: reread.value,
    rowsShown: Math.max(get().rowsShown, visibleRows(reread.value))
  })
  return true
}
