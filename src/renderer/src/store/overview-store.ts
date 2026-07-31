/**
 * Overview's view of the vault — XJADEITE §10.
 *
 * Section 1's store holds **one** year, on purpose: checking an old workspace
 * should not drag the whole application to 2019 and leave it there. Overview
 * wants every year at once, which is exactly the thing that store is built not
 * to do. So it has its own, and it drives Section 1's not at all.
 *
 * **It loops the existing per-year channel rather than adding a multi-year
 * read.** `s1:years` once, then `s1:workspace` per year, plus two reads that
 * have no year to give them: `s2:grid`, which is one standing grid since point
 * revision v0.8b (§7.1 as amended), and the single lifetime `s3:ledger`. That is
 * N + 3 crossings where a new channel would be three — and the rejected
 * alternative is worse than it sounds. A multi-year channel would want to
 * assemble something in the main process, and `src/main/vault/db/years.ts`
 * forbids exactly that: "No arithmetic lives here. Totals are computed by the
 * section engines and stored nowhere." Adding a second place where a rule about
 * the owner's money is written down, to save nine synchronous SQLite reads, is a
 * bad trade. `better-sqlite3` is synchronous; ten years costs milliseconds.
 *
 * **A year that fails to read is kept, not dropped.** Its `workspace` is null
 * and the card is still drawn, because a year silently missing from a dashboard
 * is indistinguishable from a year that had nothing in it — and this application
 * exists because two documents disagreed about a kilogram of gold while both
 * looked complete.
 *
 * Read-only throughout. There is no mutator on this store and no callback
 * reaching one, which is how §10's "read-only" is structural rather than
 * intended: there is no code path from Overview to a write.
 */

import { create } from 'zustand'

import type { YearWorkspace } from '@shared/section1/types'
import type { PaymentsGrid } from '@shared/section2/types'
import type { LedgerData } from '@shared/section3/types'
import { registerVaultScoped } from './vault-scoped.js'

/** One year, and whatever of it could be read. */
export interface OverviewYear {
  year: number
  /** Null when the read failed. The card is drawn regardless. */
  workspace: YearWorkspace | null
}

export interface OverviewState {
  years: readonly OverviewYear[]
  /** The year the accent sequence counts from (§12.3), so cards match sections. */
  anchorYear: number | null
  /**
   * The Payments grid, read once rather than once per year.
   *
   * Section 2 has no year to iterate (§7.1 as amended), so the two debt tiles
   * read one standing grid — which is also why they no longer have to choose
   * which year to speak for.
   */
  payments: PaymentsGrid | null
  ledger: LedgerData | null
  loading: boolean
  /** A failure that stopped the whole load — the year list itself, or the vault. */
  error: string | null

  load(): Promise<void>
  reset(): void
}

type Actions = 'load' | 'reset'

function emptyState(): Omit<OverviewState, Actions> {
  return { years: [], anchorYear: null, payments: null, ledger: null, loading: false, error: null }
}

export const useOverviewStore = create<OverviewState>((set) => ({
  ...emptyState(),

  async load() {
    set({ loading: true, error: null })

    const index = await window.jadeite.section1.years()
    if (!index.ok) {
      set({ loading: false, error: index.error })
      return
    }

    const { years, anchorYear } = index.value

    // Sequential rather than concurrent, deliberately. Every one of these lands
    // in the same synchronous SQLite connection on the other side of the bridge,
    // so racing them buys nothing and makes a partial failure harder to
    // attribute to the year that produced it.
    const collected: OverviewYear[] = []
    for (const year of years) {
      const workspace = await window.jadeite.section1.workspace(year)
      collected.push({ year, workspace: workspace.ok ? workspace.value : null })
    }

    // Neither of these is a workspace, so neither takes a year. The Payments
    // grid is one standing grid (§7.1 as amended) and the valuables ledger is a
    // lifetime — the same call Altın Eğrisi makes.
    const payments = await window.jadeite.section2.grid()
    const ledger = await window.jadeite.section3.ledger()

    set({
      years: collected,
      anchorYear,
      payments: payments.ok ? payments.value : null,
      ledger: ledger.ok ? ledger.value : null,
      loading: false,
      error: null
    })
  },

  reset() {
    set(emptyState())
  }
}))

// Registered on import. Overview holds a copy of every year the owner has, which
// makes it the store with the most to forget when the vault shuts.
registerVaultScoped(() => {
  useOverviewStore.getState().reset()
})
