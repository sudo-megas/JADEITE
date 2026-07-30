/**
 * Section 1's state: which year is open, what is in it, and how the view is
 * currently sorted and filtered.
 *
 * Every mutation re-reads the workspace from the vault rather than patching a
 * local copy. A 12 × 16 grid is nothing to read, and the alternative — a
 * client-side model that believes it knows what the database contains — is how
 * two views of one truth start to disagree. The vault is the only thing that
 * knows what the owner's money is.
 *
 * Sort and filter live here and nowhere else: they are view state for this
 * session, and the schema has no home for them. Opening JADEITE next week to a
 * grid silently out of month order, with no memory of why, would be a defect.
 */

import { create } from 'zustand'

import type { Section1ErrorCode, ValueType, YearWorkspace } from '@shared/section1/types'
import type { CategoryDraft, CategoryKind } from '@shared/section1/types'
import { registerVaultScoped } from './vault-scoped.js'

/** Which way the outgoing workspace should leave (§6.1). */
export type SwitchDirection = 'forward' | 'backward' | 'none'

/** The comparators a per-column filter offers (§6.2). */
export type FilterMode = 'all' | 'filled' | 'empty' | 'refund' | 'atLeast' | 'atMost'

export interface ColumnFilter {
  mode: FilterMode
  /** Minor units; only read by the numeric comparators. */
  threshold: number | null
}

/**
 * Which column the view is sorted by.
 *
 * Keyed by grid column id rather than by category id, because the TOTAL group's
 * columns are sortable too and have no category behind them — "which month was
 * worst?" is a question about the net, not about a category.
 */
export interface SortState {
  columnId: string
  descending: boolean
}

interface Section1State {
  years: number[]
  anchorYear: number
  activeYear: number | null
  /**
   * A year asked for from outside before this section had mounted (§10).
   *
   * `selectYear` writes nothing synchronously — its first statement is an
   * `await` — so a caller that selects a year and then navigates loses the race
   * against the section's own `load()`, which reads `activeYear`, still finds
   * the old one, and settles on the newest year instead. Overview's cards deep
   * link exactly that way. This is set synchronously by `focusYear` and consumed
   * by `load`, so the intent survives the gap.
   */
  pendingYear: number | null
  workspace: YearWorkspace | null

  loading: boolean
  error: Section1ErrorCode | null
  /** Which way the workspace that is arriving should come in from. */
  direction: SwitchDirection
  /** Bumped on every successful switch so the pane can replay its transition. */
  switchToken: number

  sort: SortState | null
  filters: Record<number, ColumnFilter>

  load(): Promise<void>
  selectYear(year: number): Promise<void>
  /** Ask for a year synchronously, before this section exists. */
  focusYear(year: number): void
  createYear(year: number): Promise<void>
  deleteYear(year: number): Promise<void>

  addCategory(draft: CategoryDraft): Promise<void>
  renameCategory(id: number, name: string): Promise<void>
  retypeCategory(id: number, valueType: ValueType): Promise<void>
  moveCategory(id: number, kind: CategoryKind, delta: number): Promise<void>
  deleteCategory(id: number): Promise<void>
  setAccentOverride(accent: string | null): Promise<void>

  setEntry(
    month: number,
    categoryId: number,
    amount: number | null,
    isRefund: boolean,
    note: string | null
  ): Promise<void>

  toggleSort(columnId: string): void
  clearSort(): void
  setFilter(categoryId: number, filter: ColumnFilter | null): void
  clearFilters(): void
  dismissError(): void

  /**
   * Drop everything read out of the vault.
   *
   * Called when the vault locks, never by a component. See
   * store/vault-scoped.ts for why this exists.
   */
  reset(): void
}

const api = (): typeof window.jadeite.section1 => window.jadeite.section1

/** The state of a store that has never seen an open vault. */
function emptyState(): Omit<
  Section1State,
  | 'load'
  | 'selectYear'
  | 'focusYear'
  | 'createYear'
  | 'deleteYear'
  | 'addCategory'
  | 'renameCategory'
  | 'retypeCategory'
  | 'moveCategory'
  | 'deleteCategory'
  | 'setAccentOverride'
  | 'setEntry'
  | 'toggleSort'
  | 'clearSort'
  | 'setFilter'
  | 'clearFilters'
  | 'dismissError'
  | 'reset'
> {
  return {
    years: [],
    anchorYear: new Date().getFullYear(),
    activeYear: null,
    pendingYear: null,
    workspace: null,
    loading: false,
    error: null,
    direction: 'none',
    switchToken: 0,
    sort: null,
    filters: {}
  }
}

export const useSection1Store = create<Section1State>((set, get) => ({
  ...emptyState(),

  async load() {
    set({ loading: true, error: null })
    const index = await api().years()
    if (!index.ok) {
      set({ loading: false, error: index.error })
      return
    }

    const { years, anchorYear } = index.value
    const { activeYear: current, pendingYear } = get()
    // A year asked for from outside wins over both: it is the most recent
    // statement of intent, and it was made before this section could hold one.
    // Then the year already open, kept across a reload; then the newest, which
    // is what a person almost always wants.
    const asked = pendingYear !== null && years.includes(pendingYear) ? pendingYear : null
    const target =
      asked ?? (current !== null && years.includes(current) ? current : years[years.length - 1])

    if (target === undefined) {
      set({ years, anchorYear, activeYear: null, pendingYear: null, workspace: null, loading: false })
      return
    }

    const workspace = await api().workspace(target)
    if (!workspace.ok) {
      set({ years, anchorYear, loading: false, error: workspace.error })
      return
    }
    set({
      years,
      anchorYear,
      activeYear: target,
      pendingYear: null,
      workspace: workspace.value,
      loading: false
    })
  },

  /**
   * Switch workspace.
   *
   * The rows are in hand before anything moves: the outgoing year stays fully
   * interactive until the incoming one is ready, so the transition never plays
   * over an empty pane waiting to be filled.
   */
  focusYear(year) {
    set({ pendingYear: year })
  },

  async selectYear(year) {
    const { activeYear } = get()
    if (year === activeYear) return

    set({ error: null })
    const workspace = await api().workspace(year)
    if (!workspace.ok) {
      set({ error: workspace.error })
      return
    }

    set((state) => ({
      activeYear: year,
      pendingYear: null,
      workspace: workspace.value,
      direction: activeYear === null ? 'none' : year > activeYear ? 'forward' : 'backward',
      switchToken: state.switchToken + 1,
      // View state belongs to the workspace being looked at, not to the app.
      sort: null,
      filters: {}
    }))
  },

  /**
   * Remove a year and everything in it.
   *
   * The index is re-read rather than patched locally, and a surviving year is
   * opened — the switcher is never left pointing at something that is gone.
   */
  async deleteYear(year) {
    set({ error: null })
    const removed = await api().deleteYear(year)
    if (!removed.ok) {
      set({ error: removed.error })
      return
    }

    const { years, anchorYear } = removed.value
    const wasActive = get().activeYear === year
    set({ years, anchorYear })
    if (!wasActive) return

    // Nothing is open any more; land on the newest survivor.
    set({ activeYear: null, workspace: null })
    const survivor = years[years.length - 1]
    if (survivor !== undefined) await get().selectYear(survivor)
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

  async addCategory(draft) {
    await run(set, get, () => api().addCategory(requireYear(get), draft))
  },

  async renameCategory(id, name) {
    await run(set, get, () => api().renameCategory(id, name))
  },

  async retypeCategory(id, valueType) {
    await run(set, get, () => api().retypeCategory(id, valueType))
  },

  /**
   * Nudge a column one place within its own group.
   *
   * The whole group's order is sent, not a pair of positions, so the vault
   * always receives a complete and consistent arrangement.
   */
  async moveCategory(id, kind, delta) {
    const workspace = get().workspace
    if (!workspace) return

    const group = workspace.categories.filter((c) => c.kind === kind)
    const from = group.findIndex((c) => c.id === id)
    const to = from + delta
    if (from < 0 || to < 0 || to >= group.length) return

    const ordered = group.map((c) => c.id)
    const [moved] = ordered.splice(from, 1)
    if (moved === undefined) return
    ordered.splice(to, 0, moved)

    await run(set, get, () => api().reorderCategories(requireYear(get), kind, ordered))
  },

  async deleteCategory(id) {
    await run(set, get, () => api().deleteCategory(id))
  },

  async setAccentOverride(accent) {
    await run(set, get, () => api().setAccentOverride(requireYear(get), accent))
  },

  async setEntry(month, categoryId, amount, isRefund, note) {
    await run(set, get, () =>
      api().setEntry({ year: requireYear(get), month, categoryId, amount, isRefund, note })
    )
  },

  toggleSort(columnId) {
    const current = get().sort
    // Three states, so one more click always returns the calendar order the
    // grid is really about.
    if (!current || current.columnId !== columnId) {
      set({ sort: { columnId, descending: false } })
    } else if (!current.descending) {
      set({ sort: { columnId, descending: true } })
    } else {
      set({ sort: null })
    }
  },

  clearSort() {
    set({ sort: null })
  },

  setFilter(categoryId, filter) {
    set((state) => {
      const filters = { ...state.filters }
      if (filter === null || filter.mode === 'all') delete filters[categoryId]
      else filters[categoryId] = filter
      return { filters }
    })
  },

  clearFilters() {
    set({ filters: {} })
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
  useSection1Store.getState().reset()
})

type Setter = (partial: Partial<Section1State>) => void
type Getter = () => Section1State

function requireYear(get: Getter): number {
  const year = get().activeYear
  if (year === null) throw new Error('no active year')
  return year
}

/**
 * Perform a write, then re-read the workspace it changed.
 *
 * The re-read is the point: the grid renders what the vault holds, never what
 * the renderer hoped it wrote.
 */
async function run(
  set: Setter,
  get: Getter,
  operation: () => Promise<{ ok: true; value: unknown } | { ok: false; error: Section1ErrorCode }>
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

  const workspace = await window.jadeite.section1.workspace(year)
  if (!workspace.ok) {
    set({ error: workspace.error })
    return
  }

  const { sort, filters } = get()
  set({
    workspace: workspace.value,
    ...pruneViewState(workspace.value, sort, filters)
  })
}

/**
 * Drop sort and filter state that no longer refers to anything.
 *
 * Deleting a column the view was sorted or filtered by would otherwise leave an
 * entry behind: the header is gone, so nothing shows the filter, but the grid
 * still believes one is active and offers to clear it. The view has to describe
 * the year as it now is.
 */
function pruneViewState(
  workspace: YearWorkspace,
  sort: SortState | null,
  filters: Record<number, ColumnFilter>
): { sort: SortState | null; filters: Record<number, ColumnFilter> } {
  const liveIds = new Set(workspace.categories.map((c) => c.id))
  const liveTypes = new Set(workspace.categories.map((c) => c.valueType))

  const keptFilters: Record<number, ColumnFilter> = {}
  for (const [id, filter] of Object.entries(filters)) {
    if (liveIds.has(Number(id))) keptFilters[Number(id)] = filter
  }

  // A category column is `c<id>`; the computed ones are `subtotal-<type>` and
  // `net-<type>`, which vanish when the year's last column of that type does.
  let keptSort = sort
  if (sort) {
    if (sort.columnId.startsWith('c')) {
      if (!liveIds.has(Number.parseInt(sort.columnId.slice(1), 10))) keptSort = null
    } else {
      const type = sort.columnId.replace(/^(subtotal|net)-/, '')
      if (!liveTypes.has(type as never)) keptSort = null
    }
  }

  return { sort: keptSort, filters: keptFilters }
}
