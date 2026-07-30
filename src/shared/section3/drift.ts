/**
 * When the live figure and the owner's own figure disagree *notably* — §14, §8.5.
 *
 * The specification asks for a drift indicator and leaves "notably" to the
 * implementation. Left there it would be settled again at every render and by
 * whoever wrote that render, so it is settled once, here, as a number with an
 * argument behind it.
 *
 * **Two per cent.** §8.5 measures the ESKİ/YENİ spread at about half a per cent,
 * and §14.3 records that the owner's own purchase prices sit at or slightly
 * above satış — an ordinary retail premium of a few per cent. So two per cent
 * sits above the noise of which quote was taken and below the premium that every
 * honestly-typed price already carries. Below it the two figures are the same
 * figure seen from two counters; above it something has actually moved.
 *
 * **A proportion, not an amount.** An absolute threshold was rejected outright:
 * a hundred lira is nothing against a tam coin and a scandal against a dollar,
 * and the closed list of §8.2 spans prices three orders of magnitude apart. One
 * kuruş figure cannot serve gram gold and USD at the same time.
 *
 * **The denominator is the owner's price.** Dividing by the live figure was
 * rejected because it makes the provider the yardstick, and §8.5's ruling is the
 * other way round: the typed price is the authority and drift is measured *away
 * from* it. The two divisions also rank the same pair of numbers differently
 * depending on which of them is larger, which would make a drift marker appear
 * and vanish for reasons the owner could not see.
 *
 * **Nothing missing is ever drift.** An absent live value is a silence, not a
 * divergence. §8.5 exists precisely so that a provider that has not answered
 * reads as "no figure" rather than as ₺0 or as an alarm, and this function is
 * the last place that could get it wrong.
 *
 * No float participates in the decision, in the spirit of `units.ts`: the
 * comparison is cross-multiplied into basis points, so a pair of figures exactly
 * on the threshold falls on the documented side of it every time rather than
 * wherever the last bit of a division happened to land.
 */

/**
 * What the drift cell has to say about one type.
 *
 * Four states rather than a boolean, because "no marker" has three quite
 * different causes and the interface says a different thing for each: nothing to
 * compare, nothing typed to compare *against*, and two figures that agree.
 */
export type DriftState =
  /** No live figure for this type — the provider does not quote it, or has never been asked. */
  | 'none'
  /** A live figure exists and the owner has typed no price to measure it against. */
  | 'unpriced'
  /** Both present and within the threshold. */
  | 'aligned'
  /** Both present and further apart than the threshold. */
  | 'drifting'

/**
 * The fraction of the owner's own price beyond which the two figures are said to
 * have parted company. Exported so the interface can state the rule in the
 * tooltip rather than describing a threshold it does not know.
 */
export const DRIFT_THRESHOLD = 0.02

/**
 * The same threshold as an exact integer, which is what the comparison actually
 * uses. `Math.round` rather than a second literal, so the constant above stays
 * the single statement of the rule and the two cannot drift apart themselves.
 */
const THRESHOLD_BASIS_POINTS = Math.round(DRIFT_THRESHOLD * 10_000)

const BASIS_POINTS = 10_000

/**
 * Both figures are integer kuruş per major unit (§5.2), or null where there is
 * none. `null` and a non-positive figure are treated alike: a price of zero is
 * not a price, it is the absence of one wearing a number, and it is also the one
 * value this arithmetic cannot divide by.
 *
 * A zero or missing manual price resolves to `unpriced` **only when a live
 * figure exists** — that state is an invitation to type one in, and there is
 * nothing to invite when the provider is silent too. With both sides missing the
 * answer is `none`. Decided here so that no caller has to decide it again.
 *
 * The scaled comparison stays exact well past anything the vault can hold:
 * `MAX_UNIT_PRICE` caps a typed price at ₺100.000 and a gap of that size scaled
 * by ten thousand is four orders of magnitude inside safe-integer range, so even
 * a provider figure far outside the owner's world cannot make this lie.
 */
export function driftState(manual: number | null, live: number | null): DriftState {
  if (live === null || live <= 0) return 'none'
  if (manual === null || manual <= 0) return 'unpriced'

  const gap = Math.abs(live - manual)

  // Strictly greater: exactly two per cent is the last figure that still counts
  // as agreement, which is the boundary the tests pin from both sides.
  return gap * BASIS_POINTS > manual * THRESHOLD_BASIS_POINTS ? 'drifting' : 'aligned'
}

/**
 * How far apart they are, as a fraction of the owner's price — 0.024 for a live
 * figure 2,4% above a typed one.
 *
 * For display only, which is why it is the one place a float appears: a tooltip
 * saying "%2,4" has to divide eventually, and doing it here keeps the choice of
 * denominator in the same file as the argument for it. Null whenever
 * `driftState` would answer `none` or `unpriced`, so a caller cannot format a
 * ratio that does not exist.
 */
export function driftRatio(manual: number | null, live: number | null): number | null {
  if (live === null || live <= 0) return null
  if (manual === null || manual <= 0) return null

  return Math.abs(live - manual) / manual
}
