/**
 * The Section 4 arithmetic — three statistics, computed once and tested.
 *
 * §9 wants TOTAL, AVERAGE and MEDIAN always visible over an indefinite list of
 * lines. All three are trivial and all three have an edge that is worth writing
 * down rather than discovering later.
 *
 * **Empty lines do not participate.** A line with a label and no figure is a
 * heading, and a heading that counted as a zero would drag every average toward
 * it. `count` is therefore the number of lines carrying a figure, not the number
 * of lines — and it is returned, so the interface can say which it means.
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

import type { Line } from './types.js'

export interface Statistics {
  /** Lines carrying a figure. Lines with only a label are not counted. */
  count: number
  /** Exact sum of the figures, in hundredths. Zero for an empty list. */
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
 * Total, average and median over the lines that carry a figure.
 *
 * The list is not required to be sorted, and sorting it here would be wrong: the
 * median needs the *values* in order, which has nothing to do with the order the
 * owner arranged the lines in. So the figures are copied out and sorted
 * separately, and the caller's list is never touched.
 */
export function computeStatistics(lines: readonly Line[]): Statistics {
  const values: number[] = []
  for (const line of lines) {
    if (line.value !== null) values.push(line.value)
  }

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
