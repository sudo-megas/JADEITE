/**
 * Section 4's view of the vault.
 *
 * The same rule the three stores before it keep: every mutation re-reads from the
 * vault rather than patching a local copy.
 *
 * The three statistics are *not* here. They are computed in the component from
 * the lines this store holds, because they are three additions and a sort —
 * putting them in the store would give one truth a second home, and putting them
 * behind the bridge would cross it to fetch what the renderer already has.
 */

import { create } from 'zustand'

import type { Line, LineDraft, LinePatch, Section4ErrorCode } from '@shared/section4/types'
import { registerVaultScoped } from './vault-scoped.js'

interface Section4State {
  lines: Line[]
  loading: boolean
  error: Section4ErrorCode | null
  /** Moves when a line is added, so the list can focus the new one. */
  addToken: number

  load(): Promise<void>
  addLine(draft: LineDraft): Promise<void>
  updateLine(patch: LinePatch): Promise<void>
  deleteLine(id: number): Promise<void>
  moveLine(line: Line, delta: number): Promise<void>
  dismissError(): void
  reset(): void
}

const api = (): typeof window.jadeite.section4 => window.jadeite.section4

type Actions =
  | 'load'
  | 'addLine'
  | 'updateLine'
  | 'deleteLine'
  | 'moveLine'
  | 'dismissError'
  | 'reset'

function emptyState(): Omit<Section4State, Actions> {
  return { lines: [], loading: false, error: null, addToken: 0 }
}

export const useSection4Store = create<Section4State>((set, get) => ({
  ...emptyState(),

  async load() {
    set({ loading: true, error: null })
    const result = await api().lines()
    if (!result.ok) {
      set({ loading: false, error: result.error })
      return
    }
    set({ lines: result.value, loading: false })
  },

  async addLine(draft) {
    if (await run(set, () => api().addLine(draft))) {
      set((state) => ({ addToken: state.addToken + 1 }))
    }
  },

  async updateLine(patch) {
    await run(set, () => api().updateLine(patch))
  },

  async deleteLine(id) {
    await run(set, () => api().deleteLine(id))
  },

  /** The whole new order is computed here and sent complete, never a swap. */
  async moveLine(line, delta) {
    const ordered = [...get().lines].sort((a, b) => a.position - b.position || a.id - b.id)
    const from = ordered.findIndex((candidate) => candidate.id === line.id)
    const to = from + delta
    if (from === -1 || to < 0 || to >= ordered.length) return

    const [moved] = ordered.splice(from, 1)
    if (!moved) return
    ordered.splice(to, 0, moved)

    await run(set, () => api().reorderLines(ordered.map((candidate) => candidate.id)))
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

async function run(
  set: Setter,
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

  const reread = await window.jadeite.section4.lines()
  if (!reread.ok) {
    set({ error: reread.error })
    return false
  }

  set({ lines: reread.value })
  return true
}
