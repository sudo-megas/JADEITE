/**
 * The parser is the only door through which a typed amount enters the vault,
 * so its refusals matter as much as its successes.
 */

import { describe, expect, it } from 'vitest'

import { amountToInput, parseAmount } from '@shared/money'

/** Shorthand: the minor units a successful parse produced. */
function minor(input: string, language: 'tr' | 'en' = 'tr'): number | string {
  const result = parseAmount(input, language)
  if (result.kind === 'amount') return result.minorUnits
  return result.kind === 'empty' ? 'empty' : result.reason
}

describe('parseAmount — Turkish', () => {
  it('reads the format the owner actually types', () => {
    expect(minor('1.234,56')).toBe(123456)
    expect(minor('987.654,32')).toBe(98765432)
    expect(minor('1234,56')).toBe(123456)
    expect(minor('42000')).toBe(4200000)
    expect(minor('63,45')).toBe(6345)
    expect(minor('0,01')).toBe(1)
  })

  it('survives a round trip through the display formatter', () => {
    // format.ts joins the number to its symbol with a non-breaking space.
    expect(minor('987.654,32 ₺')).toBe(98765432)
    expect(minor('1.234,56 ₺')).toBe(123456)
  })

  it('fills in the missing kuruş', () => {
    expect(minor('5,')).toBe(500)
    expect(minor('5,5')).toBe(550)
    expect(minor(',5')).toBe(50)
  })

  it('treats blank as empty, never as zero', () => {
    // §6.3: empty means empty. A cleared cell is not a nil amount.
    expect(minor('')).toBe('empty')
    expect(minor('   ')).toBe('empty')
    expect(minor('₺')).toBe('empty')
  })

  it('refuses a negative rather than taking its absolute value', () => {
    // The June-2025 elektrik sign slip is the reason this is a refusal.
    expect(minor('-600,5')).toBe('NEGATIVE')
    expect(minor('−600,5')).toBe('NEGATIVE')
  })

  it('refuses a third decimal place instead of rounding it away', () => {
    expect(minor('1,234')).toBe('TOO_MANY_DECIMALS')
  })

  it('refuses grouping that is not grouping', () => {
    // "1.5" is a thousand-and-a-half to a Turkish reader and one-and-a-half to
    // an English one. Refusing is the only answer that cannot be wrong.
    expect(minor('1.5')).toBe('BAD_GROUPING')
    expect(minor('1.23')).toBe('BAD_GROUPING')
    expect(minor('.123')).toBe('BAD_GROUPING')
    expect(minor('1.2345')).toBe('BAD_GROUPING')
  })

  it('accepts well-formed grouping at any magnitude', () => {
    expect(minor('1.234.567,89')).toBe(123456789)
    expect(minor('12.345')).toBe(1234500)
  })

  it('refuses the other language’s decimal mark rather than guessing', () => {
    // Both land on BAD_GROUPING: under Turkish rules the "." is a grouping
    // mark, and a grouping mark cannot appear among the kuruş.
    expect(minor('1234.56')).toBe('BAD_GROUPING')
    expect(minor('1,234.56')).toBe('BAD_GROUPING')
  })

  it('refuses text that is not a number at all', () => {
    expect(minor('-')).toBe('NEGATIVE')
    expect(minor('abc')).toBe('NOT_A_NUMBER')
    expect(minor('1,2,3')).toBe('NOT_A_NUMBER')
    expect(minor('+')).toBe('NOT_A_NUMBER')
  })

  it('refuses a value too large to stay an exact integer', () => {
    expect(minor('999.999.999.999.999.999,99')).toBe('TOO_LARGE')
  })
})

describe('parseAmount — English', () => {
  it('swaps the separators with the language, not with the string', () => {
    expect(minor('1,234.56', 'en')).toBe(123456)
    expect(minor('1234.56', 'en')).toBe(123456)
    expect(minor('1.234,56', 'en')).toBe('BAD_GROUPING')
    expect(minor('1,5', 'en')).toBe('BAD_GROUPING')
  })
})

describe('amountToInput', () => {
  it('gives the editor an ungrouped value in the app language', () => {
    expect(amountToInput(98765432, 'tr')).toBe('987654,32')
    expect(amountToInput(98765432, 'en')).toBe('987654.32')
    expect(amountToInput(1, 'tr')).toBe('0,01')
    expect(amountToInput(4200000, 'tr')).toBe('42000,00')
  })

  it('renders an absent amount as nothing at all', () => {
    expect(amountToInput(null, 'tr')).toBe('')
  })

  it('round-trips every stored amount back to itself', () => {
    for (const stored of [0, 1, 99, 100, 6345, 123456, 98765432, 50250075]) {
      const typed = amountToInput(stored, 'tr')
      expect(parseAmount(typed, 'tr')).toEqual({ kind: 'amount', minorUnits: stored })
    }
  })
})
