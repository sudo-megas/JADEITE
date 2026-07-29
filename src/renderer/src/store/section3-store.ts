/**
 * Section 3's view of the vault.
 *
 * The same rule Sections 1 and 2 keep: every mutation re-reads from the vault
 * rather than patching a local copy. The alternative — a client-side model that
 * believes it knows what the database contains — is how two views of one truth
 * start to disagree, which is the defect this whole application is a reply to.
 * Here it matters more than anywhere else, because holdings, cost basis and
 * unrealised gain are *all* derived: a stale local copy would not show one wrong
 * number, it would show six.
 *
 * There is no active year and no year switcher. `s3_transactions` has no year
 * column, so unlike the two grids before it this store has no place in a
 * calendar to keep.
 *
 * One read serves the whole section. Holdings derive from the transactions and
 * the prices together, so fetching them separately would let the screen show a
 * holding computed from one read beside a market value computed from another.
 */

import { create } from 'zustand'

import type {
  LedgerData,
  Person,
  PersonDraft,
  Section3ErrorCode,
  TransactionDraft,
  TransactionPatch,
  TypeCode
} from '@shared/section3/types'
import { registerVaultScoped } from './vault-scoped.js'

/** Which of §8's three sub-sections is on screen. */
export type Section3View = 'ledger' | 'holdings' | 'prices'

interface Section3State {
  data: LedgerData | null
  loading: boolean
  error: Section3ErrorCode | null
  view: Section3View
  /**
   * Moves whenever a row is committed, so the append row can reset itself
   * without watching the whole ledger for a change it caused.
   */
  commitToken: number

  load(): Promise<void>
  setView(view: Section3View): void

  addPerson(draft: PersonDraft): Promise<void>
  renamePerson(id: number, name: string): Promise<void>
  setPersonColour(id: number, colour: string | null): Promise<void>
  movePerson(person: Person, delta: number): Promise<void>
  deletePerson(id: number): Promise<void>

  /** Resolves true when the row was accepted, so the caller can clear itself. */
  addTransaction(draft: TransactionDraft): Promise<boolean>
  updateTransaction(patch: TransactionPatch): Promise<void>
  deleteTransaction(seq: number): Promise<void>

  setManualPrice(typeCode: TypeCode, value: number): Promise<void>
  clearManualPrice(typeCode: TypeCode): Promise<void>

  dismissError(): void
  reset(): void
}

const api = (): typeof window.jadeite.section3 => window.jadeite.section3

type Actions =
  | 'load'
  | 'setView'
  | 'addPerson'
  | 'renamePerson'
  | 'setPersonColour'
  | 'movePerson'
  | 'deletePerson'
  | 'addTransaction'
  | 'updateTransaction'
  | 'deleteTransaction'
  | 'setManualPrice'
  | 'clearManualPrice'
  | 'dismissError'
  | 'reset'

/** The state of a store that has never seen an open vault. */
function emptyState(): Omit<Section3State, Actions> {
  return { data: null, loading: false, error: null, view: 'ledger', commitToken: 0 }
}

export const useSection3Store = create<Section3State>((set, get) => ({
  ...emptyState(),

  async load() {
    set({ loading: true, error: null })
    const result = await api().ledger()
    if (!result.ok) {
      set({ loading: false, error: result.error })
      return
    }
    set({ data: result.value, loading: false })
  },

  setView(view) {
    set({ view })
  },

  async addPerson(draft) {
    await run(set, () => api().addPerson(draft))
  },

  async renamePerson(id, name) {
    await run(set, () => api().renamePerson(id, name))
  },

  async setPersonColour(id, colour) {
    await run(set, () => api().setPersonColour(id, colour))
  },

  /**
   * Move a person one place along the list.
   *
   * The whole new order is computed here and sent complete, not a pair of
   * positions, so the vault always receives a consistent arrangement rather than
   * having to reason about a swap.
   */
  async movePerson(person, delta) {
    const persons = get().data?.persons
    if (!persons) return

    const ordered = [...persons].sort((a, b) => a.position - b.position || a.id - b.id)
    const from = ordered.findIndex((candidate) => candidate.id === person.id)
    const to = from + delta
    if (from === -1 || to < 0 || to >= ordered.length) return

    const [moved] = ordered.splice(from, 1)
    if (!moved) return
    ordered.splice(to, 0, moved)

    await run(set, () => api().reorderPersons(ordered.map((candidate) => candidate.id)))
  },

  async deletePerson(id) {
    await run(set, () => api().deletePerson(id))
  },

  async addTransaction(draft) {
    const accepted = await run(set, () => api().addTransaction(draft))
    if (accepted) set((state) => ({ commitToken: state.commitToken + 1 }))
    return accepted
  },

  async updateTransaction(patch) {
    await run(set, () => api().updateTransaction(patch))
  },

  async deleteTransaction(seq) {
    await run(set, () => api().deleteTransaction(seq))
  },

  async setManualPrice(typeCode, value) {
    await run(set, () => api().setManualPrice(typeCode, value))
  },

  async clearManualPrice(typeCode) {
    await run(set, () => api().clearManualPrice(typeCode))
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
  useSection3Store.getState().reset()
})

type Setter = (partial: Partial<Section3State>) => void

/**
 * Perform a write, then re-read everything it could have changed.
 *
 * The re-read is the point: the screen renders what the vault holds, never what
 * the renderer hoped it wrote. Returns whether the write was accepted, which the
 * append row needs in order to decide whether to clear itself — a row that was
 * refused must stay on screen with what was typed in it.
 */
async function run(
  set: Setter,
  operation: () => Promise<{ ok: true; value: unknown } | { ok: false; error: Section3ErrorCode }>
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

  const reread = await window.jadeite.section3.ledger()
  if (!reread.ok) {
    set({ error: reread.error })
    return false
  }

  set({ data: reread.value })
  return true
}
