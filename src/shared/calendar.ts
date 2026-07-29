/**
 * The twelve months and the bounds on a year — the things every section that
 * draws a year needs and none of them owns.
 *
 * These lived in shared/section1/types.ts until Realisation IV, which was
 * accurate only while one section existed. A calendar is not Section 1's
 * property: Section 2 draws the same twelve lines, and Section 1 importing
 * Section 2's constants (or the reverse) would make two peers depend on each
 * other for a fact that predates both.
 *
 * Types and frozen constants only, so the sandboxed renderer, the main process
 * and the tests can all import it without dragging behaviour along.
 */

/** Ocak … Aralık. Twelve rows, always, in this order (§6.1, §7.1). */
export const MONTHS: readonly number[] = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])

export function isMonth(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 12
}

/**
 * Bounds on a year number.
 *
 * Wide enough to be nobody's problem and narrow enough that a typo cannot
 * create a workspace at year 202600 and leave it in the switcher forever.
 */
export const MIN_YEAR = 1970
export const MAX_YEAR = 2200

export function isValidYear(year: unknown): year is number {
  return typeof year === 'number' && Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR
}
