/**
 * The §14.3 table as code — which instrument of the source is which §8.2 type.
 *
 * Ten rows, established against 24 of the owner's own dated purchase prices
 * rather than against instrument labels, because the labels mislead. Every
 * choice below is evidence, and the evidence is recorded here as well as in the
 * specification so that nobody re-derives it from a name that looks obvious:
 *
 *   - **Gram is `KULCEALTIN`, not `ALTIN`.** 16 of 24 owner prices fall inside
 *     `KULCEALTIN`'s quoted band on their own day, against 7 for `ALTIN`
 *     (HAS ALTIN) and 0 for `AYAR22`. The label match and the tighter spread
 *     both pointed at HAS ALTIN on two anchor points; twenty-four points settled
 *     it the other way.
 *   - **The coins take their ESKİ quote** (§8.5, the owner's ruling). All six
 *     ESKİ codes were called and all six returned real series — being listed in
 *     the source's catalogue is not evidence of that, since the widely-circulated
 *     `/tmp/altin.json` is catalogued too and 404s (§14.1).
 *   - **Gümüş is `GUMUSTRY`, which is quoted per gram.** `GUMUSUSD` is quoted
 *     per **kilogram**, so taking it would be wrong by a factor of a thousand
 *     *and* in the wrong currency — a mistake that would look like a plausible
 *     silver price for exactly as long as nobody multiplied it by a holding.
 *
 * **`AYAR22` has no row here any more.** Ziynet was struck from the closed list
 * in this rung — it is the Turkish parent name of the 22-ayar coin family rather
 * than a product beside them — so the ten types are the whole list. §14.3 still
 * names `AYAR22`, but only as the negative control in the Gram row's evidence,
 * and `mock/recorded.ts` keeps it in its frame for the same reason: an
 * instrument this application must be seen to ignore.
 *
 * This module imports nothing but a type. It is the one place either direction
 * of the mapping is written down, and `parse.ts` is its only application caller.
 */

import type { TypeCode } from '../../../shared/section3/types.js'

/**
 * One row of §14.3, in the shape a caller iterating the table wants.
 *
 * The transport enumerates instruments to pick out of a 55-instrument frame and
 * the tests enumerate them to prove the table total; both want pairs, and
 * neither should be re-deriving them from `Object.entries` on its own.
 */
export interface TypeMapping {
  typeCode: TypeCode
  sourceCode: string
}

/**
 * §14.3, forward.
 *
 * `Record<TypeCode, string>` rather than a plain object or an array of pairs,
 * because it makes a missing row a **compile-time** failure: adding an eleventh
 * member to `TypeCode` without deciding what the source calls it will not build.
 * The rejected alternative — a lookup returning `string | undefined` and a
 * runtime guard at each call site — moves the same question to whichever
 * afternoon the eleventh type is first refreshed.
 *
 * The order is §8.2's closed-list order, which is also `valuable_types.position`,
 * so a snapshot's quotes arrive in the order the interface lists its rows and no
 * consumer has to sort them.
 */
export const SOURCE_CODE_BY_TYPE: Record<TypeCode, string> = Object.freeze({
  gram: 'KULCEALTIN',
  ceyrek: 'CEYREK_ESKI',
  yarim: 'YARIM_ESKI',
  tam: 'TEK_ESKI',
  /** Cumhuriyet — a different coin from `tam`, and quoted separately (§8.2). */
  ata: 'ATA_ESKI',
  /** The source's name for 2.5 is *Gremse*, with the spelling it uses. */
  iki_bucuk: 'GREMESE_ESKI',
  besli: 'ATA5_ESKI',
  usd: 'USDTRY',
  eur: 'EURTRY',
  /** Per gram. `GUMUSUSD` is per kilogram — see the module note. */
  gumus: 'GUMUSTRY'
})

/**
 * The same ten rows as an ordered list, derived rather than written a second
 * time.
 *
 * `Object.entries` widens the key back to `string`, so the pairs are re-narrowed
 * once — here, where the declaration above has just proved the key set exhaustive
 * — instead of at every reader. A second literal table would be two homes for one
 * fact (§4.1) and would drift the first time the source renamed an instrument.
 */
export const MAPPINGS: readonly TypeMapping[] = Object.freeze(
  Object.entries(SOURCE_CODE_BY_TYPE).map(([typeCode, sourceCode]) =>
    Object.freeze({ typeCode: typeCode as TypeCode, sourceCode })
  )
)

/**
 * §14.3, backward.
 *
 * A `Map` rather than a second record: an object index would carry `| undefined`
 * under `noUncheckedIndexedAccess` anyway, and a `Map` says plainly that the key
 * is arbitrary text from a third party rather than a member of a known set.
 */
const TYPE_BY_SOURCE_CODE: ReadonlyMap<string, TypeCode> = new Map(
  MAPPINGS.map((row) => [row.sourceCode, row.typeCode] as const)
)

/** What the source calls this type. Total over the ten by construction. */
export function sourceCodeFor(typeCode: TypeCode): string {
  return SOURCE_CODE_BY_TYPE[typeCode]
}

/**
 * Which type this instrument is, or `null` for the forty-five this application
 * does not price.
 *
 * **Matched exactly, never case-folded.** The source's codes are upper-case
 * ASCII, so folding buys nothing — and it would cost something: case conversion
 * is the one text operation where Turkish changes a letter's identity, `i`
 * mapping to `İ` rather than `I` under a Turkish locale. `CEYREK_ESKI` contains
 * an `I`. A locale-sensitive fold here would work on the developer's machine and
 * silently stop matching four of the ten coins on the owner's, which is both a
 * §13 violation and the hardest kind of bug to see.
 */
export function typeCodeFor(sourceCode: string): TypeCode | null {
  return TYPE_BY_SOURCE_CODE.get(sourceCode) ?? null
}
