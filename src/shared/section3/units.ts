/**
 * Quantity, price, and the one multiplication between them — XJADEITE §5.2.
 *
 * Sections 1 and 2 needed only money, and `shared/money.ts` was enough. Section 3
 * counts three different things and quotes a price against each:
 *
 *   30 g of gold          at ₺6.505,00 **per gram**
 *   4 çeyrek coins        at ₺4.200,00 **per coin**
 *   $1.500,00             at ₺41,30    **per dollar**
 *
 * The quantity is stored in the smallest whole unit that admits no fraction —
 * milligrams, coins, cents — while the price is quoted per *major* unit, because
 * that is the number the owner is told at the counter and types in. So every
 * value is a quantity times a price divided by a scale, and the scale is the only
 * thing that differs. That division is the one place a rounding decision exists
 * in Section 3, and it is made here rather than at nine call sites.
 *
 * No float participates, in either direction. The multiplication is decomposed
 * so no intermediate product is larger than it has to be, and the halfway case
 * rounds away from zero — the direction a person doing it by hand would.
 */

import { parseFixedPoint, separatorsFor, type MoneyLanguage, type ParseFailure } from '../money.js'
import type { QuantityUnit } from './types.js'

/**
 * How many stored units make one unit the price is quoted against.
 *
 * A coin is its own major unit, which is why `piece` is 1 rather than absent:
 * the same formula then covers all three, and a countable type is not a special
 * case anywhere else in the application.
 */
export function unitScale(unit: QuantityUnit): number {
  switch (unit) {
    case 'mg':
      return 1000
    case 'minor':
      return 100
    case 'piece':
      return 1
  }
}

/** Decimal places the owner may type for a quantity of this unit. */
export function quantityFractionDigits(unit: QuantityUnit): number {
  switch (unit) {
    case 'mg':
      return 3
    case 'minor':
      return 2
    case 'piece':
      // A third of a çeyrek does not exist. Refusing the decimal point is more
      // honest than accepting it and rounding a coin away.
      return 0
  }
}

/**
 * Bounds on one row's quantity and price.
 *
 * Not a guess at the owner's wealth — a guard so that quantity × price stays a
 * safe integer and a mistyped extra digit is refused at the cell rather than
 * stored as a figure that arithmetic can no longer represent exactly.
 *
 * **The price ceiling was wrong, and Realisation VII is how it was found.**
 * It read ₺100.000 and was reasoned about per *gram*, where gold at ₺6.505
 * leaves it generous. But a coin is priced per *piece*: §8.2 records the 2.5 at
 * 9.444× a çeyrek and the 5 at 18.996×, which at the same gram figure is roughly
 * ₺110.000 and ₺221.000. Both were already over the bound, and `cleanPrice`
 * gates the manual price setter as well as the ledger — so the owner could not
 * type a beşli price at all, in a released application, and nobody noticed
 * because nobody had typed one yet. Pointing a live provider at the closed list
 * is what made it fatal rather than latent: one over-ceiling quote in a frame of
 * ten would refuse the whole transaction and record a working fetch as failed.
 *
 * ₺500.000 per unit now, chosen against the multiplication rather than against
 * the market: `MAX_QUANTITY × MAX_UNIT_PRICE` is 5 × 10^15, comfortably inside
 * `Number.MAX_SAFE_INTEGER` (~9 × 10^15), where a round ₺1.000.000 would not be.
 * That leaves roughly a doubling of headroom over the largest real coin.
 *
 * The rejected alternative was a second ceiling for live prices. A live figure
 * sits in the same column, in the same scale, as the owner's own — two bounds on
 * one quantity is how the two drift apart.
 *
 * Per row, these permit 100 kg of gold, a hundred million coins, a million
 * dollars, and ₺500.000 per gram. Totals are sums of these and are not bounded
 * here.
 */
export const MAX_QUANTITY = 100_000_000
export const MAX_UNIT_PRICE = 50_000_000

/**
 * What one ledger row is worth, in integer kuruş.
 *
 * `quantity × unitPrice ÷ unitScale`, rounded half away from zero. Both inputs
 * are non-negative by §5.2 — the direction carries the sign, never the figure —
 * so this returns a magnitude and the caller decides what it means.
 *
 * The decomposition is not premature cleverness. Multiplying first would form
 * `quantity × unitPrice` in full, which for a weighable type is a thousand times
 * larger than the answer and the first thing to exceed exact integer range. So
 * the whole-unit part is multiplied out exactly and only the remainder — always
 * smaller than the scale — is ever divided.
 */
export function transactionValue(
  quantity: number,
  unitPrice: number,
  unit: QuantityUnit
): number {
  const scale = unitScale(unit)

  const wholeUnits = Math.trunc(quantity / scale)
  const remainder = quantity % scale

  const exact = wholeUnits * unitPrice
  const fraction = remainder * unitPrice

  // Half away from zero. Both operands are non-negative, so this is half-up.
  const rounded = Math.trunc(fraction / scale) + (2 * (fraction % scale) >= scale ? 1 : 0)

  return exact + rounded
}

// --- Reading a typed quantity ----------------------------------------------

/**
 * Quantities fail the five ways amounts do, plus one of their own.
 *
 * `s3_transactions` requires `quantity > 0`: a row recording that nothing
 * changed hands is not a transaction, and storing it would put a zero into the
 * running total column where an absence belongs.
 */
export type QuantityFailure = ParseFailure | 'ZERO'

export type ParsedQuantity =
  | { kind: 'empty' }
  | { kind: 'quantity'; scaled: number }
  | { kind: 'error'; reason: QuantityFailure }

/**
 * The unit suffix the formatter emits, so a value copied out of a cell and
 * pasted back into another survives the round trip.
 *
 * `formatGrams` writes "30 g" with a non-breaking space; `money.ts` already
 * strips the space and every currency symbol, which leaves the letter.
 */
const GRAM_SUFFIX = /g$/i

export function parseQuantity(
  input: string,
  unit: QuantityUnit,
  language: MoneyLanguage
): ParsedQuantity {
  const body = unit === 'mg' ? input.replace(GRAM_SUFFIX, '') : input

  const parsed = parseFixedPoint(body, language, quantityFractionDigits(unit))
  if (parsed.kind !== 'value') return parsed

  if (parsed.scaled === 0) return { kind: 'error', reason: 'ZERO' }
  if (parsed.scaled > MAX_QUANTITY) return { kind: 'error', reason: 'TOO_LARGE' }

  return { kind: 'quantity', scaled: parsed.scaled }
}

/**
 * The editable text for a stored quantity.
 *
 * Ungrouped and trailing-zero-free, for the reason `amountToInput` is ungrouped:
 * an editor showing "1.234,500" invites a keystroke that lands between a digit
 * and a separator. 2500 mg reads "2,5", not "2,500".
 */
export function quantityToInput(
  quantity: number | null,
  unit: QuantityUnit,
  language: MoneyLanguage
): string {
  if (quantity === null) return ''

  const digits = quantityFractionDigits(unit)
  if (digits === 0) return String(quantity)

  const scale = unitScale(unit)
  const whole = Math.trunc(quantity / scale)
  const fraction = String(quantity % scale)
    .padStart(digits, '0')
    .replace(/0+$/, '')

  if (fraction.length === 0) return String(whole)

  // The app language decides the decimal mark, never the machine (§13), and it
  // decides it in one place — money.ts holds the separator table for both.
  const { decimal } = separatorsFor(language)
  return `${whole}${decimal}${fraction}`
}
