/**
 * The Section 4 arithmetic — three statistics, computed once and tested.
 *
 * §9 wants TOTAL, AVERAGE and MEDIAN always visible over the grid of boxes. All
 * three are trivial and all three have an edge that is worth writing down rather
 * than discovering later.
 *
 * **An untouched box does not participate; a box holding zero does.** That
 * distinction used to be a nullable column and a paragraph about headings. Since
 * the grid replaced the list it is the shape of the table instead: a box nobody
 * has typed in has no row, so it never reaches this function at all, while a
 * typed zero arrives as an ordinary figure and pulls the average toward it
 * exactly as it should. `count` is therefore the number of boxes carrying a
 * figure rather than the number of boxes on screen — and it is returned, so the
 * interface can say which it means.
 *
 * **No float participates.** Values are integer hundredths, so the total is an
 * exact sum. The average and the median divide, and division is the one place a
 * decision exists:
 *
 * Both are **rounded half away from zero to the same hundredths the values
 * carry**. The alternative — carrying the exact quotient to more decimal places
 * than any input has — would print precision that is not there. Three values of
 * 1, 1 and 2 average to 1,33 in a scratchpad, not to 1,3333333333333333.
 *
 * That rounding is visible in one place only, and the unit suite pins both
 * parities and the exact halfway case.
 */

import type { Cell } from './types.js'
import { COLUMNS, MAX_ROWS, MIN_ROWS } from './types.js'

export interface Statistics {
  /** Boxes carrying a figure. Untouched boxes are not counted; zeros are. */
  count: number
  /** Exact sum of the figures, in hundredths. Zero for an empty grid. */
  total: number
  /** Rounded to hundredths, or null when there is nothing to average. */
  average: number | null
  /** Rounded to hundredths for an even count, exact for an odd one. */
  median: number | null
}

/**
 * Divide and round half up, staying in integers throughout.
 *
 * The numerator is never negative: figures reach this section through the same
 * parser as every other figure in the app, and that parser refuses a leading minus
 * (§5.2, `shared/money.ts`). So half *up* and half *away from zero* are the same
 * rule here, and there is no unreachable branch pretending otherwise. Should §9
 * ever want netting, this is the one function that has to learn about signs.
 */
function divideRounded(numerator: number, denominator: number): number {
  const whole = Math.trunc(numerator / denominator)
  const remainder = numerator % denominator
  return whole + (2 * remainder >= denominator ? 1 : 0)
}

/**
 * Total, average and median over the boxes that carry a figure.
 *
 * The cells are not required to arrive in slot order, and sorting them here
 * would be wrong: the median needs the *values* in order, which has nothing to
 * do with where in the grid the owner put them. So the figures are copied out
 * and sorted separately, and the caller's array is never touched.
 */
export function computeStatistics(cells: readonly Cell[]): Statistics {
  const values: number[] = []
  for (const cell of cells) values.push(cell.value)

  if (values.length === 0) return { count: 0, total: 0, average: null, median: null }

  let total = 0
  for (const value of values) total += value

  const sorted = [...values].sort((a, b) => a - b)
  const middle = sorted.length >> 1

  const median =
    sorted.length % 2 === 1
      ? sorted[middle]!
      : divideRounded(sorted[middle - 1]! + sorted[middle]!, 2)

  return {
    count: values.length,
    total,
    average: divideRounded(total, values.length),
    median
  }
}

/**
 * How many rows of boxes these cells ask for.
 *
 * One empty row always trails the last row carrying a figure, so there is
 * somewhere to type without asking for it. That is the old append row kept as a
 * property of the grid rather than as a widget at the foot of it: nothing to
 * aim at, nothing to explain, and the tenth figure of a row is followed by an
 * eleventh box in the same way the ninth was.
 *
 * Never fewer than `MIN_ROWS`, so an untouched section is a hundred boxes rather
 * than one. Never more than `MAX_ROWS`, which is where the slots stop
 * (`main/vault/db/section4.ts` refuses anything at or past that).
 *
 * This is the floor and not the whole answer. Clearing the only figure in the
 * last row lowers what this returns, and a row must not disappear from under the
 * caret because a box was emptied, so the store holds a high-water mark over the
 * top of it (`renderer/src/store/section4-store.ts`).
 */
export function visibleRows(cells: readonly Cell[]): number {
  let highest = -1
  for (const cell of cells) if (cell.slot > highest) highest = cell.slot
  if (highest < 0) return MIN_ROWS

  // The row the last figure sits in, counted from one, plus an empty one after it.
  const rows = Math.floor(highest / COLUMNS) + 2
  return Math.min(Math.max(rows, MIN_ROWS), MAX_ROWS)
}
