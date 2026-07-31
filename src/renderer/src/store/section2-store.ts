/**
 * Section 2's view of the vault.
 *
 * Every mutation re-reads the grid from the vault rather than patching a local
 * copy. The alternative — a client-side model that believes it knows what the
 * database contains — is how two views of one truth start to disagree, which is
 * the defect this whole application is a reply to.
 *
 * There is no year here, and no year state to keep. This store used to hold an
 * open year of its own, deliberately independent of Section 1's, so that
 * checking an old instalment plan would not drag the income grid to 2019 and
 * leave it there. Point revision v0.8b removed the years rather than the
 * independence: Ödemeler is one standing grid of the twelve months the owner is
 * living in (§7.1, §7.3 as amended), and Section 1 keeps its workspaces alone.
 *
 * There is no sort and no filter here either. Section 2's rows are the calendar,
 * and a grid whose rows are the calendar is not sorted — see
 * docs/realisation-iv.md.
 */

import { create } from 'zustand'

import type { Bank, BankDraft, PaymentsGrid, Section2ErrorCode } from '@shared/section2/types'
import { registerVaultScoped } from './vault-scoped.js'

interface Section2State {
  grid: PaymentsGrid | null
  loading: boolean
  error: Section2ErrorCode | null

  load(): Promise<void>
  addBank(draft: BankDraft): Promise<void>
  renameBank(id: number, name: string): Promise<void>
  setCreditLimit(id: number, limit: number): Promise<void>
  setCounterParty(id: number, party: string | null): Promise<void>
  moveBank(bank: Bank, delta: number): Promise<void>
  deleteBank(id: number): Promise<void>
  setCell(month: number, bankId: number, amount: number | null): Promise<void>
  dismissError(): void
  reset(): void
}

const api = (): typeof window.jadeite.section2 => window.jadeite.section2

/** The state of a store that has never seen an open vault. */
function emptyState(): Pick<Section2State, 'grid' | 'loading' | 'error'> {
  return {
    grid: null,
    loading: false,
    error: null
  }
}

export const useSection2Store = create<Section2State>((set, get) => ({
  ...emptyState(),

  async load() {
    set({ loading: true, error: null })
    const grid = await api().grid()
    if (!grid.ok) {
      set({ loading: false, error: grid.error })
      return
    }
    set({ grid: grid.value, loading: false })
  },

  async addBank(draft) {
    await run(set, get, () => api().addBank(draft))
  },

  async renameBank(id, name) {
    await run(set, get, () => api().renameBank(id, name))
  },

  async setCreditLimit(id, limit) {
    await run(set, get, () => api().setCreditLimit(id, limit))
  },

  async setCounterParty(id, party) {
    await run(set, get, () => api().setCounterParty(id, party))
  },

  /**
   * Move a column one place along its own side.
   *
   * The whole side's new order is computed here and sent complete, not a pair of
   * positions, so the vault always receives a consistent arrangement rather than
   * having to reason about a swap.
   */
  async moveBank(bank, delta) {
    const grid = get().grid
    if (!grid) return

    const side = grid.banks
      .filter((candidate) => candidate.isCounter === bank.isCounter)
      .sort((a, b) => a.position - b.position || a.id - b.id)

    const from = side.findIndex((candidate) => candidate.id === bank.id)
    const to = from + delta
    if (from === -1 || to < 0 || to >= side.length) return

    const ordered = [...side]
    const [moved] = ordered.splice(from, 1)
    if (!moved) return
    ordered.splice(to, 0, moved)

    await run(set, get, () =>
      api().reorderBanks(
        bank.isCounter,
        ordered.map((candidate) => candidate.id)
      )
    )
  },

  async deleteBank(id) {
    await run(set, get, () => api().deleteBank(id))
  },

  async setCell(month, bankId, amount) {
    await run(set, get, () => api().setCell({ month, bankId, amount }))
  },

  dismissError() {
    set({ error: null })
  },

  reset() {
    set(emptyState())
  }
}))

// Registered on import, so a section that was never opened is still covered.
registerVaultScoped(() => {
  useSection2Store.getState().reset()
})

type Setter = (partial: Partial<Section2State>) => void
type Getter = () => Section2State

/**
 * Perform a write, then re-read the grid it changed.
 *
 * The re-read is the point: the grid renders what the vault holds, never what
 * the renderer hoped it wrote.
 *
 * The guard is a load check, not a year check. Nothing in this section can be
 * edited before its grid has arrived — there are no cells on screen to edit —
 * and a mutation fired against a store that has not loaded would write into a
 * grid the owner has not seen.
 */
async function run(
  set: Setter,
  get: Getter,
  operation: () => Promise<{ ok: true; value: unknown } | { ok: false; error: Section2ErrorCode }>
): Promise<void> {
  if (get().grid === null) return

  set({ error: null })
  let result: Awaited<ReturnType<typeof operation>>
  try {
    result = await operation()
  } catch {
    set({ error: 'INTERNAL' })
    return
  }

  if (!result.ok) {
    set({ error: result.error })
    return
  }

  const grid = await window.jadeite.section2.grid()
  if (!grid.ok) {
    set({ error: grid.error })
    return
  }

  set({ grid: grid.value })
}
