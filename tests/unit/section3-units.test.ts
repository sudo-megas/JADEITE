/**
 * The one division in Section 3, and the parser that feeds it.
 *
 * A quantity is stored in the smallest whole unit that admits no fraction and a
 * price is quoted per major unit, so every value in this section is a
 * multiplication and a divide. Both halves are tested against figures chosen to
 * land exactly on the boundary the other might get wrong: a half-kuruş, a
 * three-decimal gram, a coin someone tried to split.
 */

import { describe, expect, it } from 'vitest'

import {
  MAX_QUANTITY,
  parseQuantity,
  quantityFractionDigits,
  quantityToInput,
  transactionValue,
  unitScale
} from '@shared/section3/units'
import type { QuantityUnit } from '@shared/section3/types'

/** ₺6.505,00 per gram — the price the acceptance figures are quoted at. */
const GOLD = 650_500

describe('the scale between a stored quantity and its quoted price', () => {
  it('is a thousand for weighables, a hundred for currency, and one for coins', () => {
    expect(unitScale('mg')).toBe(1000)
    expect(unitScale('minor')).toBe(100)
    expect(unitScale('piece')).toBe(1)
  })

  it('permits three decimals of a gram, two of a currency, and none of a coin', () => {
    expect(quantityFractionDigits('mg')).toBe(3)
    expect(quantityFractionDigits('minor')).toBe(2)
    expect(quantityFractionDigits('piece')).toBe(0)
  })
})

describe('what a row is worth', () => {
  it('values weighable gold against a price per gram', () => {
    // 30 g at ₺6.505,00 = ₺195.150,00 — the acceptance market value.
    expect(transactionValue(30_000, GOLD, 'mg')).toBe(19_515_000)
    expect(transactionValue(20_000, 590_000, 'mg')).toBe(11_800_000)
    expect(transactionValue(10_000, 700_000, 'mg')).toBe(7_000_000)
  })

  it('values coins against a price per coin, with no scaling at all', () => {
    expect(transactionValue(4, 420_000, 'piece')).toBe(1_680_000)
    expect(transactionValue(1, 420_000, 'piece')).toBe(420_000)
  })

  it('values foreign currency against a price per major unit', () => {
    // $1.500,00 at ₺41,30 = ₺61.950,00.
    expect(transactionValue(150_000, 4_130, 'minor')).toBe(6_195_000)
  })

  it('is zero for nothing at all, and for a price of nothing', () => {
    expect(transactionValue(0, GOLD, 'mg')).toBe(0)
    expect(transactionValue(30_000, 0, 'mg')).toBe(0)
  })

  /**
   * One milligram of gold is worth ₺6,505 — six kuruş and a bit more than half.
   * Half away from zero is the direction a person doing it on paper would go,
   * and the direction the owner's own workbook went.
   */
  it('rounds the halfway case up, and rounds nothing else', () => {
    expect(transactionValue(1, 650_500, 'mg')).toBe(651)
    expect(transactionValue(1, 650_499, 'mg')).toBe(650)
    expect(transactionValue(1, 650_501, 'mg')).toBe(651)
    expect(transactionValue(1, 650_000, 'mg')).toBe(650)
  })

  it('rounds a currency remainder the same way', () => {
    // 1 cent at ₺41,30 per dollar is 41,3 kuruş.
    expect(transactionValue(1, 4_130, 'minor')).toBe(41)
    expect(transactionValue(1, 4_150, 'minor')).toBe(42)
  })

  /**
   * The multiplication is decomposed so the whole-unit part never forms the full
   * `quantity × unitPrice` product. At the bounds `units.ts` permits, the answer
   * must still be exact rather than a float that has lost its last digits.
   */
  it('stays exact at the bounds it permits', () => {
    const value = transactionValue(MAX_QUANTITY, 10_000_000, 'mg')
    expect(Number.isSafeInteger(value)).toBe(true)
    expect(value).toBe(1_000_000_000_000)
  })

  it('never drifts across a run of remainders', () => {
    let total = 0
    for (let i = 0; i < 1000; i += 1) total += transactionValue(1, 100_100, 'mg')
    // 1 mg at ₺1.001,00/g is 100,1 kuruş, rounded to 100 a thousand times over.
    expect(total).toBe(100_000)
    expect(Number.isInteger(total)).toBe(true)
  })
})

describe('reading a typed quantity', () => {
  it('reads grams into milligrams, in the app language', () => {
    expect(parseQuantity('2,5', 'mg', 'tr')).toEqual({ kind: 'quantity', scaled: 2500 })
    expect(parseQuantity('2.5', 'mg', 'en')).toEqual({ kind: 'quantity', scaled: 2500 })
    expect(parseQuantity('30', 'mg', 'tr')).toEqual({ kind: 'quantity', scaled: 30_000 })
    expect(parseQuantity('0,001', 'mg', 'tr')).toEqual({ kind: 'quantity', scaled: 1 })
  })

  it('survives a value copied out of a cell and pasted back in', () => {
    // formatGrams writes "30 g" with a non-breaking space.
    expect(parseQuantity('30 g', 'mg', 'tr')).toEqual({ kind: 'quantity', scaled: 30_000 })
    expect(parseQuantity('2,5 g', 'mg', 'tr')).toEqual({ kind: 'quantity', scaled: 2500 })
  })

  it('refuses a fraction of a coin rather than rounding one away', () => {
    expect(parseQuantity('4', 'piece', 'tr')).toEqual({ kind: 'quantity', scaled: 4 })
    expect(parseQuantity('4,5', 'piece', 'tr')).toEqual({
      kind: 'error',
      reason: 'TOO_MANY_DECIMALS'
    })
  })

  it('refuses a fourth decimal of a gram', () => {
    expect(parseQuantity('0,0001', 'mg', 'tr')).toEqual({
      kind: 'error',
      reason: 'TOO_MANY_DECIMALS'
    })
  })

  it('refuses a negative quantity outright', () => {
    // The direction carries the sign (§5.2); taking the absolute value here
    // would resurrect exactly the slip that convention exists to retire.
    expect(parseQuantity('-5', 'mg', 'tr')).toEqual({ kind: 'error', reason: 'NEGATIVE' })
  })

  it('refuses zero, because a row where nothing moved is not a transaction', () => {
    expect(parseQuantity('0', 'mg', 'tr')).toEqual({ kind: 'error', reason: 'ZERO' })
    expect(parseQuantity('0,000', 'mg', 'tr')).toEqual({ kind: 'error', reason: 'ZERO' })
    expect(parseQuantity('0', 'piece', 'tr')).toEqual({ kind: 'error', reason: 'ZERO' })
  })

  it('reads empty as empty, never as zero', () => {
    expect(parseQuantity('', 'mg', 'tr')).toEqual({ kind: 'empty' })
    expect(parseQuantity('   ', 'mg', 'tr')).toEqual({ kind: 'empty' })
  })

  it('refuses a quantity past the bound, so a stray digit is caught at the cell', () => {
    expect(parseQuantity('200.000.000', 'mg', 'tr')).toEqual({
      kind: 'error',
      reason: 'TOO_LARGE'
    })
  })

  it('holds grouping to real group positions, as money does', () => {
    expect(parseQuantity('1.500', 'minor', 'tr')).toEqual({ kind: 'quantity', scaled: 150_000 })
    expect(parseQuantity('1.5', 'minor', 'tr')).toEqual({ kind: 'error', reason: 'BAD_GROUPING' })
  })
})

describe('the editable text for a stored quantity', () => {
  it('drops trailing zeros but never a significant one', () => {
    expect(quantityToInput(2500, 'mg', 'tr')).toBe('2,5')
    expect(quantityToInput(2050, 'mg', 'tr')).toBe('2,05')
    expect(quantityToInput(2005, 'mg', 'tr')).toBe('2,005')
    expect(quantityToInput(30_000, 'mg', 'tr')).toBe('30')
  })

  it('writes the app language’s decimal mark, never the machine’s', () => {
    expect(quantityToInput(2500, 'mg', 'en')).toBe('2.5')
  })

  it('writes a coin count as a whole number', () => {
    expect(quantityToInput(4, 'piece', 'tr')).toBe('4')
  })

  it('reads back as empty for an absent quantity', () => {
    expect(quantityToInput(null, 'mg', 'tr')).toBe('')
  })

  /**
   * The round trip is the property that matters: whatever the cell shows when
   * focused must parse back to the number it came from, or an edit that touches
   * nothing still changes the stored value.
   */
  it('round-trips every unit', () => {
    const cases: Array<[number, QuantityUnit]> = [
      [1, 'mg'],
      [999, 'mg'],
      [1000, 'mg'],
      [2500, 'mg'],
      [2005, 'mg'],
      [1_200_000, 'mg'],
      [1, 'piece'],
      [37, 'piece'],
      [1, 'minor'],
      [150_000, 'minor'],
      [150_050, 'minor']
    ]

    for (const [quantity, unit] of cases) {
      for (const language of ['tr', 'en'] as const) {
        const text = quantityToInput(quantity, unit, language)
        expect(parseQuantity(text, unit, language), `${quantity} ${unit} ${language}`).toEqual({
          kind: 'quantity',
          scaled: quantity
        })
      }
    }
  })
})
