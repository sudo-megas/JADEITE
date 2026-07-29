/**
 * How Section 3 renders a quantity, a price, and a person's dot.
 *
 * Money in this section is always lira: a price is quoted in lira per gram, per
 * coin or per dollar, and every value derived from one is lira too. What varies
 * is the *quantity*, which is grams for a weighable, a count for a coin, and a
 * foreign currency for USD or EUR — so a quantity needs the type to know how to
 * read it, while money never does.
 */

import type { QuantityUnit, TypeCode } from '@shared/section3/types'
import type { Palette } from '@shared/theme/types'
import type { AppLanguage, Currency } from '../../i18n/format.js'
import { formatCount, formatGrams, formatMoney } from '../../i18n/format.js'
import { accentAt, mutedAccent, type AccentRole } from '../../theme/accents.js'

/** Every figure Section 3 computes is lira, and says so in one place. */
export function formatTry(minorUnits: number, language: AppLanguage): string {
  return formatMoney(minorUnits, 'TRY', language)
}

/**
 * The two types whose quantity *is* money.
 *
 * A holding of dollars is read in dollars and valued in lira, so the quantity and
 * the value use different currencies in the same row. That is why the map exists
 * rather than a branch: adding a third currency to the closed list would be one
 * line here and nothing anywhere else.
 */
const QUANTITY_CURRENCY: Partial<Record<TypeCode, Currency>> = {
  usd: 'USD',
  eur: 'EUR'
}

/** A quantity, in the unit the owner thinks in. */
export function formatQuantity(
  quantity: number,
  typeCode: TypeCode,
  unit: QuantityUnit,
  language: AppLanguage
): string {
  if (unit === 'mg') return formatGrams(quantity, language)
  if (unit === 'piece') return formatCount(quantity, language)
  return formatMoney(quantity, QUANTITY_CURRENCY[typeCode] ?? 'TRY', language)
}

/**
 * The colour of a person's dot (§8.1).
 *
 * A stored slot, or the person's own position when they have not chosen one, run
 * through the active palette's accent sequence. Nothing here is a colour literal:
 * the same person is a different hue in Nord and in Kanagawa Lotus, and both are
 * hues that palette chose for itself.
 */
export function personAccent(
  palette: Palette,
  colour: string | null,
  position: number,
  role: AccentRole = 'mark'
): string {
  const slot = colour !== null && /^\d+$/.test(colour) ? Number(colour) : position
  return mutedAccent(accentAt(palette, slot), role)
}

/** How many accent slots a person may choose between, for the picker. */
export function accentSlotCount(palette: Palette): number {
  return palette.accentSequence.length
}
