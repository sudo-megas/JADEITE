/**
 * Overview's selection layer — every figure the dashboard prints, and every
 * state in which there is no figure to print.
 *
 * §10 asks for a read-only dashboard in which "every number is derived from
 * Sections 1–3", and REALISATION.md's first acceptance box asks that every one
 * of them be shown to equal its section source by an automated cross-check. The
 * largest population of Overview numbers is chart points, and a point inside a
 * `<canvas>` is cross-checked by nothing at all. So the series are built here,
 * as values, where `tests/unit/overview-selection.test.ts` can pin them one by
 * one without booting Electron.
 *
 * **Nothing is derived in this file.** Every number below comes out of
 * `computeWorkspace`, `computeGrid`, `computeHoldings` or `buildSeries` — the
 * same four functions the sections themselves call. Overview re-implementing any
 * of that arithmetic would be a second place for a rule about the owner's money
 * to live, which is the defect the whole application answers. What this file
 * does is *choose*: which year, which bucket, which of several honest readings,
 * and — mostly — what to say when there is no reading at all.
 *
 * **No React, no store, no IPC, no clock.** The current month is passed in
 * exactly as `computeGrid` takes it (`section2/engine.ts`), for the reason
 * stated there: a module that read the clock could not be tested for a month
 * that has not happened yet.
 *
 * **Every tile answers with a discriminated state, never a bare number.** This
 * is the point of the file. The rejected alternative was `number | null` per
 * tile, and it fails twice: it collapses four distinct absences into one, and it
 * leaves the component to guess which caption belongs to the null it got. A
 * selector that can only answer with a figure has no way to say *there is no
 * figure*, so it prints `0,00 ₺` — which on a dashboard is a claim rather than
 * an absence, and three of the four grand tiles have a state in which that claim
 * is false.
 */

import { buildSeries, type ValuePoint } from '@shared/altin/series'
import { bucketOf, computeWorkspace, type Bucket, type ComputedWorkspace } from '@shared/section1/engine'
import { VALUE_TYPES, type ValueType, type YearWorkspace } from '@shared/section1/types'
import { computeGrid } from '@shared/section2/engine'
import type { PaymentsGrid } from '@shared/section2/types'
import { computeHoldings, type HoldingsView } from '@shared/section3/engine'
import type { LedgerData, TypeCode } from '@shared/section3/types'
import { sortedTypeCodes, typeCodesAttribute } from '@shared/section3/codes'

export { sortedTypeCodes, typeCodesAttribute }

/**
 * The value type every headline figure on this dashboard is quoted in.
 *
 * Named once rather than written 'TRY' at nine call sites, and named at all
 * because §6.2's rule is that a total only ever adds columns of one type: a
 * dashboard figure has to say which type it is a figure *of*, and the cases
 * below exist to handle the years where the answer is "none of them".
 */
export const HEADLINE_VALUE_TYPE: ValueType = 'TRY'

/**
 * One year as Overview received it, and whatever of it could be read.
 *
 * Structurally the store's `OverviewYear`, and deliberately **not imported from
 * it**. `store/overview-store.ts` reaches `window.jadeite`, and `tests/unit`
 * type-checks under `tsconfig.node.json`, whose lib carries no DOM — so a
 * type-only import of the store would make this module unbuildable from the very
 * suite that exists to prove it. Same argument as `main/prices/hosts.ts`: a
 * module two runtimes have to agree about does not get to depend on either one.
 *
 * The fields are exactly the store's two, so the store's value is assignable
 * here and the compiler checks the agreement at every call site the parent
 * writes. Adding a field would break a file this module does not own.
 */
export interface OverviewYear {
  year: number
  workspace: YearWorkspace | null
}

/**
 * Ascending by year, always.
 *
 * The store fills `years` from whatever `s1:years` returned, and a chronological
 * chart and a "latest year" both go quietly wrong on a descending list. Sorted
 * here rather than documented as a precondition the parent has to keep, because
 * an ordering rule that lives in a comment is an ordering rule that will be
 * broken. Ten elements; the cost is nothing.
 */
function byYear(years: readonly OverviewYear[]): readonly OverviewYear[] {
  return [...years].sort((a, b) => a.year - b.year)
}

/** Stable ordering for a set of value types, matching §6.2's own sequence. */
function orderValueTypes(present: ReadonlySet<ValueType>): readonly ValueType[] {
  return VALUE_TYPES.filter((valueType) => present.has(valueType))
}

// --- The year card ----------------------------------------------------------

/**
 * What a year card has to say — and it is not always a number.
 *
 * `yearBuckets` is one bucket per value type in use, never a single figure, and
 * `section1/engine.ts:22-27` forbids adding across them: "a year that also holds
 * a dollar column gets a second bucket instead of a number that means nothing."
 * A card is one tile with room for one figure, so it shows the lira net — which
 * leaves four situations, not two, and the difference between them is the whole
 * reason this is a union.
 *
 * - **`net`** — the year has a lira column. `others` names any further types it
 *   holds; when it is non-empty the card must draw the marker, or a card reading
 *   ₺180.000 for a year that also took $4.000 is silently omitting money, which
 *   is the retiring workbook's defect wearing a new hat.
 * - **`other-only`** — the year has columns, none of them lira. There is no
 *   honest lira figure, so the card shows none and names what it does hold.
 *   `bucketOf` would answer this case with a zeroed bucket
 *   (`section1/engine.ts:178`), and a card reading `0,00 ₺` over a year of
 *   dollars is a false claim about the owner's lira; the branch exists to stop
 *   exactly that call.
 * - **`no-columns`** — the year read fine and has no categories at all. Not the
 *   same as the case above: nothing was omitted, there is simply nothing yet.
 * - **`unreadable`** — the workspace read failed. The card is still drawn, so
 *   the year is not silently missing from the grid of years; a year absent from
 *   a dashboard is indistinguishable from a year that held nothing, and this
 *   application exists because two documents disagreed while both looked
 *   complete.
 */
export type HeadlineBucket =
  | { kind: 'unreadable' }
  | { kind: 'no-columns' }
  | { kind: 'other-only'; others: readonly ValueType[] }
  | { kind: 'net'; bucket: Bucket; others: readonly ValueType[] }

/**
 * The card's figure, from a computed workspace or from the failure to read one.
 *
 * Takes `ComputedWorkspace | null` rather than a raw workspace so the engine is
 * called once per year by `yearCards` below and the branch table here stays a
 * pure function of engine output — which is what lets the test hand it four
 * hand-built cases and pin all four.
 */
export function headlineBucket(computed: ComputedWorkspace | null): HeadlineBucket {
  if (computed === null) return { kind: 'unreadable' }

  const inUse = computed.valueTypesInUse
  if (inUse.length === 0) return { kind: 'no-columns' }

  // `valueTypesInUse` is already in §6.2's order, so filtering preserves it.
  const others = inUse.filter((valueType) => valueType !== HEADLINE_VALUE_TYPE)
  if (!inUse.includes(HEADLINE_VALUE_TYPE)) return { kind: 'other-only', others }

  return { kind: 'net', bucket: bucketOf(computed.yearBuckets, HEADLINE_VALUE_TYPE), others }
}

export interface YearCard {
  year: number
  headline: HeadlineBucket
}

/** Every year the owner has, oldest first, each with whatever its card can say. */
export function yearCards(years: readonly OverviewYear[]): readonly YearCard[] {
  return byYear(years).map((entry) => ({
    year: entry.year,
    headline: headlineBucket(entry.workspace === null ? null : computeWorkspace(entry.workspace))
  }))
}

// --- The trend charts -------------------------------------------------------

/**
 * Why a year contributes no points to a chart.
 *
 * Derived from `HeadlineBucket` rather than listed again, so the card taxonomy
 * and the chart taxonomy are provably one thing: a year the cards call
 * `other-only` cannot become a year the chart quietly drew at zero.
 */
export type ExclusionReason = Exclude<HeadlineBucket['kind'], 'net'>

export interface ExcludedYear {
  year: number
  reason: ExclusionReason
}

/** One month of one year's lira net. */
export interface MonthNet {
  month: number
  /** Kuruş. Negative is a real answer, not an error. */
  net: number
  /**
   * The month's lira bucket is zero on **both** sides — nothing went into income
   * and nothing into expenses.
   *
   * Derived from the bucket rather than from `MonthRow.cells`, because a cell may
   * belong to another value type: a month holding only a dollar entry has an
   * empty lira bucket, which is what this line draws. Carried so the chart can
   * leave a gap where the year has not been filled in yet instead of plotting a
   * zero — a line that dives to the axis every unentered month describes months
   * the owner never had, and on the current year that is every month still to
   * come.
   *
   * It says what it says and no more: an income of ₺500 and a refund of ₺500
   * against that same category cancel both sides to nothing and read as empty,
   * though two entries exist. Preferring that rare gap to a routine false zero is
   * the trade this flag makes.
   */
  empty: boolean
}

/** A month of a named year — the point type of the continuous chart. */
export interface NetPoint extends MonthNet {
  year: number
}

/** One year's twelve points, plus the figure its card shows. */
export interface YearLine {
  year: number
  /** Twelve, Ocak → Aralık, always all twelve even when empty. */
  months: readonly MonthNet[]
  /**
   * The year's own lira net, read from `yearBuckets` — **not** Σ `months`.
   * The engine computes both from the same placed entries; reading the one the
   * year card reads is what makes the chart's total and the card's figure
   * incapable of disagreeing.
   */
  net: number
}

interface Walked {
  drawn: YearLine[]
  excluded: ExcludedYear[]
  otherValueTypes: readonly ValueType[]
}

/**
 * Walk the years once, splitting them into what a chart can draw and what it
 * cannot.
 *
 * Both trend charts need the same walk, and running `computeWorkspace` twice
 * over the same years for two charts is two chances to disagree about which
 * years were drawn — the failure mode `altin/series.ts:89-96` gives for building
 * its three series in one pass.
 */
function walkYears(years: readonly OverviewYear[]): Walked {
  const drawn: YearLine[] = []
  const excluded: ExcludedYear[] = []
  const others = new Set<ValueType>()

  for (const entry of byYear(years)) {
    // The unreadable year is taken first so that `computed` below is narrowed to
    // a workspace rather than to one that might be missing. An earlier draft
    // computed `ComputedWorkspace | null` and reached for `computed?.months ?? []`
    // in the drawn branch, where the null is unreachable — and an unreachable
    // fallback that yields an empty array is a year drawn with no months at all,
    // silently, which is the failure this whole module argues against.
    if (entry.workspace === null) {
      excluded.push({ year: entry.year, reason: 'unreadable' })
      continue
    }

    const computed = computeWorkspace(entry.workspace)
    const headline = headlineBucket(computed)

    if (headline.kind !== 'net') {
      if (headline.kind === 'other-only') {
        for (const valueType of headline.others) others.add(valueType)
      }
      excluded.push({ year: entry.year, reason: headline.kind })
      continue
    }

    for (const valueType of headline.others) others.add(valueType)

    const months: MonthNet[] = computed.months.map((row) => {
      const bucket = bucketOf(row.buckets, HEADLINE_VALUE_TYPE)
      return {
        month: row.month,
        net: bucket.net,
        empty: bucket.income === 0 && bucket.expense === 0
      }
    })

    drawn.push({ year: entry.year, months, net: headline.bucket.net })
  }

  return { drawn, excluded, otherValueTypes: orderValueTypes(others) }
}

/** §10's net-by-month trend: one continuous chronological line across all years. */
export interface NetByMonthSeries {
  /** Every drawn month of every drawn year, oldest first. */
  points: readonly NetPoint[]
  excluded: readonly ExcludedYear[]
  /**
   * Types some year holds that this chart does not draw. Non-empty means the
   * chart is showing part of the record and has to say so.
   */
  otherValueTypes: readonly ValueType[]
}

export function netByMonthSeries(years: readonly OverviewYear[]): NetByMonthSeries {
  const { drawn, excluded, otherValueTypes } = walkYears(years)

  const points: NetPoint[] = []
  for (const line of drawn) {
    for (const month of line.months) points.push({ year: line.year, ...month })
  }

  return { points, excluded, otherValueTypes }
}

/** §10's year-over-year comparison: one line per year, twelve points each. */
export interface YoySeries {
  years: readonly YearLine[]
  excluded: readonly ExcludedYear[]
  otherValueTypes: readonly ValueType[]
}

export function yoySeries(years: readonly OverviewYear[]): YoySeries {
  const { drawn, excluded, otherValueTypes } = walkYears(years)
  return { years: drawn, excluded, otherValueTypes }
}

// --- The two debt tiles -----------------------------------------------------

/**
 * Current debt (§10) — the Payments grid's GRAND TOTAL DEBT.
 *
 * There is no year to choose any more. Section 2 held a grid per year until
 * point revision v0.8b, and this file used to carry a `selectDebtYear` whose
 * whole job was deciding which of them a grand tile spoke for — the latest year
 * that had begun, failing that the earliest on record — with every tile state
 * labelled by its year so it never claimed to be about today when it was not.
 * §7.1 as amended leaves one standing grid of the twelve months the owner is
 * living in, so the tile is about now by construction and the choice is gone.
 *
 * `no-columns` is a state and not a zero. A grid holding no columns at all
 * totals 0, and a tile reading `0,00 ₺` there tells the owner they owe nothing,
 * which is a claim about their finances made out of an empty table.
 *
 * On the reading itself: `computeGrid` sums `grandTotalDebt` over all twelve
 * months regardless of `monthState`, so "current debt" is the grid's grand total
 * — the figure at §7.1's own DEBT × TOTAL DEBT intersection. That is the only
 * reading with a section source. `s2_cells` carries no paid flag
 * (`section2/types.ts`), and inventing one to net off the settled months would be
 * the second record §7.1 refuses, maintained by hand, disagreeing with the grid
 * by the end of the first month.
 */
export type DebtTile =
  | { kind: 'unreadable' }
  | { kind: 'no-columns' }
  | { kind: 'figure'; debt: number }

export function debtTile(payments: PaymentsGrid | null, currentMonth: number): DebtTile {
  if (payments === null) return { kind: 'unreadable' }

  const computed = computeGrid(payments, currentMonth)
  if (computed.columns.length === 0) return { kind: 'no-columns' }

  return { kind: 'figure', debt: computed.grandTotalDebt }
}

/**
 * Remaining limit (§10) — `TOTAL REMAINING LIMIT`, read and never recomputed.
 *
 * `section2/engine.ts` fixes what this figure is: the total of the Remaining
 * Limit *row*, over the columns that have a limit. It is emphatically not
 * `totalCreditLimit − grandTotalDebt`, because a counter column carries debt and
 * no limit, so the subtraction credits headroom to a card that was never
 * charged. This selector therefore reads `totalRemainingLimit` and touches
 * nothing else; the unit suite asserts the subtraction would give a different
 * answer, so a future simplification fails there rather than on screen.
 *
 * **`no-limits` is the state the whole rung turns on.** A grid with counter
 * columns and no bank columns totals 0 across an empty Remaining Limit row, and
 * `0,00 ₺` under "remaining limit" reads as *no headroom left* — the precise
 * misreading a counter column's `remaining: null` exists to avoid
 * (`section2/engine.ts`). It carries the counter count so the tile can say what
 * the grid does hold rather than merely refusing to answer.
 */
export type RemainingTile =
  | { kind: 'unreadable' }
  | { kind: 'no-limits'; counters: number }
  | { kind: 'figure'; remaining: number; creditLimit: number }

export function remainingTile(
  payments: PaymentsGrid | null,
  currentMonth: number
): RemainingTile {
  if (payments === null) return { kind: 'unreadable' }

  const computed = computeGrid(payments, currentMonth)
  if (computed.banks.length === 0) {
    return { kind: 'no-limits', counters: computed.counters.length }
  }

  return {
    kind: 'figure',
    remaining: computed.totalRemainingLimit,
    creditLimit: computed.totalCreditLimit
  }
}

// --- The two valuables tiles ------------------------------------------------

/**
 * Holdings from a ledger that may not have read.
 *
 * One home for the null guard and the engine call, so the two tiles and the
 * `ov-partial` banner all see the same `HoldingsView` — computing it twice would
 * be two answers to §8.6 from one ledger.
 */
export function holdingsOf(ledger: LedgerData | null): HoldingsView | null {
  return ledger === null ? null : computeHoldings(ledger)
}


/**
 * How many current holdings carry a price.
 *
 * Counted off `marketValue !== null` — the same nullability the engine uses
 * (`section3/engine.ts:302-305`) — rather than off the money being zero. A tile
 * that inferred "nothing is priced" from `marketValue === 0` would be reading
 * the symptom of the state it is trying to name.
 */
function pricedCount(view: HoldingsView): number {
  let priced = 0
  for (const person of view.byPerson) {
    for (const holding of person.holdings) {
      if (holding.marketValue !== null) priced += 1
    }
  }
  return priced
}

/**
 * Valuables market value (§8.6, §10) — and the two ways it is absent.
 *
 * `nothing-held` and `none-priced` are different facts and must not share a
 * tile. `byPerson` omits a person with no current position at all
 * (`section3/engine.ts:512`), so an empty `byPerson` means the drawer is empty;
 * a full drawer with no typed price is a holding whose market value the engine
 * reports as `null`, and the tile's job is to say *no price yet*, not `0,00 ₺`.
 *
 * `unpricedTypes` rides on both the figure and the `none-priced` state, because
 * partial pricing is the normal condition: gold priced, silver not, and the
 * figure below is true of the gold alone.
 */
export type MarketTile =
  | { kind: 'no-ledger' }
  | { kind: 'nothing-held' }
  | { kind: 'none-priced'; unpricedTypes: readonly TypeCode[] }
  | { kind: 'figure'; marketValue: number; unpricedTypes: readonly TypeCode[] }

export function marketTile(holdings: HoldingsView | null): MarketTile {
  if (holdings === null) return { kind: 'no-ledger' }
  if (holdings.byPerson.length === 0) return { kind: 'nothing-held' }

  const unpricedTypes = sortedTypeCodes(holdings.missingPrices)
  if (pricedCount(holdings) === 0) return { kind: 'none-priced', unpricedTypes }

  return { kind: 'figure', marketValue: holdings.marketValue, unpricedTypes }
}

/**
 * Unrealised gain/loss (§8.6) — `marketValue − pricedCostBasis`.
 *
 * **Not `− costBasis`.** The engine keeps the two apart on purpose
 * (`section3/engine.ts:324-327`): cost basis is the cost of everything still
 * held, `pricedCostBasis` the cost of the priced part alone, and comparing a
 * market value that covers only the gold against a cost that also covers the
 * unpriced silver reports a loss the owner has not made. Both are carried on the
 * figure state so the tile can show the comparison and the suite can assert the
 * subtraction.
 *
 * With nothing priced this quantity is arithmetically 0 — `0 − 0` — and
 * semantically absent, which is why `none-priced` is decided by the same count
 * as the market tile rather than by the number that falls out.
 */
export type UnrealisedTile =
  | { kind: 'no-ledger' }
  | { kind: 'nothing-held' }
  | { kind: 'none-priced'; unpricedTypes: readonly TypeCode[] }
  | {
      kind: 'figure'
      unrealised: number
      marketValue: number
      pricedCostBasis: number
      unpricedTypes: readonly TypeCode[]
    }

export function unrealisedTile(holdings: HoldingsView | null): UnrealisedTile {
  if (holdings === null) return { kind: 'no-ledger' }
  if (holdings.byPerson.length === 0) return { kind: 'nothing-held' }

  const unpricedTypes = sortedTypeCodes(holdings.missingPrices)
  if (pricedCount(holdings) === 0) return { kind: 'none-priced', unpricedTypes }

  return {
    kind: 'figure',
    unrealised: holdings.unrealised,
    marketValue: holdings.marketValue,
    pricedCostBasis: holdings.pricedCostBasis,
    unpricedTypes
  }
}

// --- The valuables value line -----------------------------------------------

/**
 * §10's valuables value line — `buildSeries().marketValue`, unchanged.
 *
 * No new arithmetic: `altin/series.ts` already returns a dated market-value
 * series, and Altın Eğrisi draws the same points. Reproducing it here so the
 * Overview chart could have its own shape is how the deck and the workbook came
 * to disagree about a kilogram of gold.
 *
 * **This line does not end at the market tile's figure, and that is correct.**
 * They have different section sources. `buildSeries` values each event date at
 * the newest unit price *the ledger itself recorded* (`series.ts:109-116`),
 * because §8.5 keeps one current price and not a series — there is no price
 * history to consult. `computeHoldings` values today's position at the owner's
 * current manual price (`section3/engine.ts:375-376`). So the line's last point
 * is "what it was worth the day of the last transaction" and the tile is "what
 * it is worth now". Reconciling them would mean inventing a price history, which
 * is a second record for the owner to maintain; the interface labels them
 * instead.
 */
export type ValueLine =
  | { kind: 'no-ledger' }
  /** The ledger read and yielded no dated point — nothing bought, or no price. */
  | { kind: 'empty' }
  | { kind: 'line'; points: readonly ValuePoint[]; latest: ValuePoint }

export function valueLine(ledger: LedgerData | null): ValueLine {
  if (ledger === null) return { kind: 'no-ledger' }

  const points = buildSeries(ledger).marketValue
  const latest = points[points.length - 1]
  if (latest === undefined) return { kind: 'empty' }

  return { kind: 'line', points, latest }
}

// --- What did not load ------------------------------------------------------

/**
 * Everything the dashboard is drawing without — the `ov-partial` banner's data.
 *
 * Separate from the per-chart `excluded` lists, which mix a failed read together
 * with a year that legitimately holds no lira. This one names only failures, and
 * it names them per section: a year whose income grid did not read and a
 * payments grid that did not read are different holes in different tiles, and a
 * banner saying "2019 is incomplete" without saying in what is a banner the
 * owner cannot act on.
 *
 * `payments` is a boolean rather than a list of years, because there is one
 * Payments grid to fail (§7.1 as amended) rather than one per year.
 *
 * `any` is the banner's own condition, kept here so the component does not
 * re-derive it from three fields and get the empty case wrong.
 */
export interface IncompleteReads {
  workspaceYears: readonly number[]
  payments: boolean
  ledger: boolean
  any: boolean
}

export function incompleteReads(
  years: readonly OverviewYear[],
  payments: PaymentsGrid | null,
  ledger: LedgerData | null
): IncompleteReads {
  const workspaceYears: number[] = []

  for (const entry of byYear(years)) {
    if (entry.workspace === null) workspaceYears.push(entry.year)
  }

  return {
    workspaceYears,
    payments: payments === null,
    ledger: ledger === null,
    any: workspaceYears.length > 0 || payments === null || ledger === null
  }
}
