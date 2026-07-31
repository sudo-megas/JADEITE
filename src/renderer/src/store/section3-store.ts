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
  LivePriceErrorCode,
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

  /** A fetch is in flight. The button is disabled and says so. */
  refreshing: boolean
  /**
   * Why the last fetch produced nothing, or null.
   *
   * Separate from `error`, which is for the vault refusing something the owner
   * did. An unreachable price source is not a fault in the application and must
   * not be shown as one (§14): the manual prices on screen carry on being the
   * authority, and this is a line beside them rather than an alarm over them.
   */
  liveError: LivePriceErrorCode | null

  /**
   * Seconds until the limiter will ask the provider again, when it just refused
   * to (§14). Null whenever the last refresh actually reached the source.
   *
   * This exists because a refused refresh used to be completely invisible. The
   * limiter's floor is 60 seconds, but after a run of failures it backs off to a
   * thirty-minute ceiling, and `refreshPrices` returns `skipped` *before* it
   * records the attempt — so the timestamp did not move either. For half an hour
   * the button was indistinguishable from a dead one, and the figure on screen
   * was last month's with nothing to say so.
   */
  liveRetryAfter: number | null

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
  refreshPrices(): Promise<void>

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
  | 'refreshPrices'
  | 'dismissError'
  | 'reset'

/** The state of a store that has never seen an open vault. */
function emptyState(): Omit<Section3State, Actions> {
  return {
    data: null,
    loading: false,
    error: null,
    view: 'ledger',
    commitToken: 0,
    refreshing: false,
    liveError: null,
    liveRetryAfter: null
  }
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

  /**
   * Ask the provider once (§14), then re-read like every other write.
   *
   * Three things this deliberately does not do. It does not set `loading`,
   * because that blanks the section and the owner is looking at prices they
   * already have while this happens. It does not treat `skipped` as a failure —
   * the limiter refusing a too-soon request is politeness working, and the
   * timestamp already on screen stays correct — but it does now *say* so,
   * through `liveRetryAfter`, because silent politeness and a dead button are
   * the same thing from the other side of the screen. And it does not care that
   * `written` is often zero: a snapshot is stored only when a figure moves, so
   * a good refresh on a quiet day writes nothing at all, and reporting that as
   * failure would make a working provider look broken.
   */
  async refreshPrices() {
    if (get().refreshing) return
    set({ refreshing: true, liveError: null, liveRetryAfter: null })

    try {
      const result = await api().refreshPrices()
      if (!result.ok) {
        // The vault refused — locked, most likely. That is an application
        // state, not a provider state, so it goes to `error`.
        set({ error: result.error })
        return
      }

      const { status, retryAfterSeconds } = result.value
      set({
        liveError: status === 'ok' || status === 'skipped' ? null : status,
        // Only `skipped` carries it, and only `skipped` should show it.
        liveRetryAfter: status === 'skipped' ? (retryAfterSeconds ?? null) : null
      })

      // The vault is the authority on what was actually stored, exactly as it
      // is for every other write in this store.
      const reread = await api().ledger()
      if (reread.ok) set({ data: reread.value })
      else set({ error: reread.error })
    } catch {
      set({ error: 'INTERNAL' })
    } finally {
      set({ refreshing: false })
    }
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
