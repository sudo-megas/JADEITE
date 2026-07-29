/**
 * Section 2 is lira, and says so in one place.
 *
 * Section 1 needs `formatByType` because a column there may honestly be
 * dollars. A credit limit and the debt against it are one card's currency by
 * definition, and `s2_banks` has no `value_type` to say otherwise — so there is
 * one function here rather than a type to thread through every cell.
 */

import type { AppLanguage } from '../../i18n/format.js'
import { formatMoney } from '../../i18n/format.js'

export function formatTry(minorUnits: number, language: AppLanguage): string {
  return formatMoney(minorUnits, 'TRY', language)
}
