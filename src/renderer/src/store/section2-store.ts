/**
 * Section 2's view of the vault.
 *
 * Two rules, the same two Section 1's store keeps.
 *
 * Every mutation re-reads the grid from the vault rather than patching a local
 * copy. The alternative — a client-side model that believes it knows what the
 * database contains — is how two views of one truth start to disagree, which is
 * the defect this whole application is a reply to.
 *
 * The open year is this store's own. Section 1 and Section 2 read the same
 * `years` table but keep their own place in it: checking an old instalment plan
 * should not drag the income grid to 2019 and leave it there.
 *
 * There is no sort and no filter here. Section 2's rows are the calendar, and a
 * grid whose rows are the calendar is not sorted — see docs/realisation-iv.md.
 */

import { create } from 'zustand'

import type { Bank, BankDraft, Section2ErrorCode, YearGrid } from '@shared/section2/types'
import { registerVaultScoped } from './vault-scoped.js'

/** Which way the workspace transition should play. */
export type SwitchDirection = 'forward' | 'backward' | 'none'

interface Section2State {
  years: number[]
  /** The year the accent sequence counts from (§12.3). */
  anchorYear: number
  activeYear: number | null
  grid: YearGrid | null
  loading: boolean
  error: Section2ErrorCode | null
  direction: SwitchDirection
  /** Moves only on a real workspace change, so editing never restarts a sampler. */
  switchToken: number

  load(): Promise<void>
  selectYear(year: number): Promise<void>
  createYear(year: number): Promise<void>
  addBank(draft: BankDraft): Promise<void>
  renameBank(id: number, name: string): Promise<void>
  setCreditLimit(id: number, limit: number): Promise<void>
  setCounterParty(id: number, party: string | null): Promise<void>
  moveBank(bank: Bank, delta: number): Promise<void>
  deleteBank(id: number): Promise<void>
  setCell(month: number, bankId: number, amount: number | null): Promise<void>
  setArchived(archived: boolean): Promise<void>
  dismissError(): void
  reset(): void
}

const api = (): typeof window.jadeite.section2 => window.jadeite.section2

/** The state of a store that has never seen an open vault. */
function emptyState(): Omit<
  Section2State,
  | 'load'
  | 'selectYear'
  | 'createYear'
  | 'addBank'
  | 'renameBank'
  | 'setCreditLimit'
  | 'setCounterParty'
  | 'moveBank'
  | 'deleteBank'
  | 'setCell'
  | 'setArchived'
  | 'dismissError'
  | 'reset'
> {
  return {
    years: [],
    anchorYear: new Date().getFullYear(),
    activeYear: null,
    grid: null,
    loading: false,
    error: null,
    direction: 'none',
    switchToken: 0
  }
}

export const useSection2Store = create<Section2State>((set, get) => ({
  ...emptyState(),

  async load() {
    set({ loading: true, error: null })
    const index = await api().years()
    if (!index.ok) {
      set({ loading: false, error: index.error })
      return
    }

    const { years, anchorYear } = index.value
    const current = get().activeYear
    // Keep the year already open across a reload; otherwise open the newest,
    // which is the one a person almost always wants.
    const target = current !== null && years.includes(current) ? current : years[years.length - 1]

    if (target === undefined) {
      set({ years, anchorYear, activeYear: null, grid: null, loading: false })
      return
    }

    const grid = await api().grid(target)
    if (!grid.ok) {
      set({ years, anchorYear, loading: false, error: grid.error })
      return
    }
    set({ years, anchorYear, activeYear: target, grid: grid.value, loading: false })
  },

  /**
   * Switch workspace.
   *
   * The rows are in hand before anything moves: the outgoing year stays fully
   * interactive until the incoming one is ready, so the transition never plays
   * over an empty pane waiting to be filled.
   */
  async selectYear(year) {
    const { activeYear } = get()
    if (year === activeYear) return

    set({ error: null })
    const grid = await api().grid(year)
    if (!grid.ok) {
      set({ error: grid.error })
      return
    }

    set((state) => ({
      activeYear: year,
      grid: grid.value,
      direction: activeYear === null ? 'none' : year > activeYear ? 'forward' : 'backward',
      switchToken: state.switchToken + 1
    }))
  },

  async createYear(year) {
    set({ error: null })
    const created = await api().createYear(year)
    if (!created.ok) {
      set({ error: created.error })
      return
    }
    set({ years: created.value.years, anchorYear: created.value.anchorYear })
    await get().selectYear(year)
  },

  async addBank(draft) {
    await run(set, get, () => api().addBank(requireYear(get), draft))
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
        requireYear(get),
        bank.isCounter,
        ordered.map((candidate) => candidate.id)
      )
    )
  },

  async deleteBank(id) {
    await run(set, get, () => api().deleteBank(id))
  },

  async setCell(month, bankId, amount) {
    await run(set, get, () => api().setCell({ year: requireYear(get), month, bankId, amount }))
  },

  async setArchived(archived) {
    await run(set, get, () => api().setArchived(requireYear(get), archived))
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

function requireYear(get: Getter): number {
  const year = get().activeYear
  if (year === null) throw new Error('no active year')
  return year
}

/**
 * Perform a write, then re-read the grid it changed.
 *
 * The re-read is the point: the grid renders what the vault holds, never what
 * the renderer hoped it wrote. It is also how a refusal from a frozen year
 * reaches the screen without the interface having to predict one.
 */
async function run(
  set: Setter,
  get: Getter,
  operation: () => Promise<{ ok: true; value: unknown } | { ok: false; error: Section2ErrorCode }>
): Promise<void> {
  const year = get().activeYear
  if (year === null) return

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

  const grid = await window.jadeite.section2.grid(year)
  if (!grid.ok) {
    set({ error: grid.error })
    return
  }

  set({ grid: grid.value })
}
