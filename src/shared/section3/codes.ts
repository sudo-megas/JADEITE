/**
 * Naming a set of valuable types the same way twice.
 *
 * `HoldingsView.missingPrices` arrives in Set-insertion order, which depends on
 * which person the engine walked first — so two screens rendering the same
 * complaint from the same data can emit two different strings. Section 3's
 * holdings marker and Overview's market tile are exactly that pair, and
 * Realisation VIII's first acceptance line asks that they be compared:
 *
 * > Every Overview number equals its section source (automated cross-check).
 *
 * Comparing the two *counts* would degrade to "both complained". Comparing the
 * types named is the real check, and it needs a total order neither side
 * invents. Lexicographic on the code: arbitrary, and identical everywhere.
 *
 * This lives in `shared` because the alternative is one renderer section
 * importing from another — Section 3 reaching into Overview, or the reverse —
 * which is how two features that merely agree today become coupled tomorrow.
 */

import type { TypeCode } from './types.js'

export function sortedTypeCodes(codes: readonly TypeCode[]): readonly TypeCode[] {
  return [...codes].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/**
 * The `data-unpriced-types` attribute body: sorted codes, space-joined.
 *
 * Raw `TypeCode`s and never the localised names the owner reads. A test that
 * compared the rendered names would be asserting the catalogue as much as the
 * data, and would break the day someone improves a translation.
 */
export function typeCodesAttribute(codes: readonly TypeCode[]): string {
  return sortedTypeCodes(codes).join(' ')
}
