/**
 * Rendering a Section 1 value according to its column's type.
 *
 * A column declares what its numbers are; this is the one place that decides
 * what that means on screen. `plain` is not money and never acquires a currency
 * glyph — the type is the owner's own statement that these are just numbers.
 */

import type { ValueType } from '@shared/section1/types'
import { formatMoney, formatNumber, type AppLanguage } from '../../i18n/format.js'

const MINOR_UNITS_PER_MAJOR = 100

export function formatByType(
  minorUnits: number,
  valueType: ValueType,
  language: AppLanguage
): string {
  if (valueType === 'plain') {
    return formatNumber(minorUnits / MINOR_UNITS_PER_MAJOR, language)
  }
  return formatMoney(minorUnits, valueType, language)
}

/** The glyph a TOTAL column carries so two buckets are never confused. */
export function glyphFor(valueType: ValueType): string {
  switch (valueType) {
    case 'TRY':
      return '₺'
    case 'USD':
      return '$'
    case 'EUR':
      return '€'
    case 'plain':
      return '#'
  }
}
