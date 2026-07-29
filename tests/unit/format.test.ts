/**
 * The formatting engine of §13 — and the proof that it follows the app
 * language rather than the machine.
 */

import { describe, expect, it } from 'vitest'

import {
  formatCount,
  formatDate,
  formatGrams,
  formatMoney,
  formatMonthName,
  formatNumber,
  localeFor,
  monthNames
} from '../../src/renderer/src/i18n/format.js'

describe('Turkish money — the form §6.2 asks for', () => {
  it('renders lira as 1.234,56 ₺, symbol last', () => {
    expect(formatMoney(123_456, 'TRY', 'tr')).toBe('1.234,56\u00A0₺')
  })

  it('groups with dots and separates decimals with a comma', () => {
    expect(formatMoney(100_000_000, 'TRY', 'tr')).toBe('1.000.000,00\u00A0₺')
    expect(formatMoney(5, 'TRY', 'tr')).toBe('0,05\u00A0₺')
  })

  it('puts dollars and euros last too, for consistency within the language', () => {
    expect(formatMoney(123_456, 'USD', 'tr')).toBe('1.234,56\u00A0$')
    expect(formatMoney(123_456, 'EUR', 'tr')).toBe('1.234,56\u00A0€')
  })

  it('reproduces the figures the migration must land on', () => {
    // XJADEITE §18.3, the Section 2 acceptance fixtures.
    expect(formatMoney(4_827_163, 'TRY', 'tr')).toBe('48.271,63\u00A0₺')
    expect(formatMoney(124_059_608, 'TRY', 'tr')).toBe('1.240.596,08\u00A0₺')
    // Section 3: cost basis, market value, unrealised gain.
    expect(formatMoney(18_800_000, 'TRY', 'tr')).toBe('188.000,00\u00A0₺')
    expect(formatMoney(19_515_000, 'TRY', 'tr')).toBe('195.150,00\u00A0₺')
    expect(formatMoney(715_000, 'TRY', 'tr')).toBe('7.150,00\u00A0₺')
  })

  it('never lets a float into the arithmetic', () => {
    // 0.1 + 0.2 territory: the input is integer kuruş, so it cannot arise.
    expect(formatMoney(10 + 20, 'TRY', 'tr')).toBe('0,30\u00A0₺')
  })
})

describe('English money', () => {
  it('follows the English locale rather than the Turkish one', () => {
    expect(formatMoney(123_456, 'USD', 'en')).toContain('1,234.56')
    expect(formatMoney(123_456, 'TRY', 'en')).toContain('1,234.56')
  })
})

describe('numbers, counts and quantities', () => {
  it('formats plain numbers per language', () => {
    expect(formatNumber(1234.5, 'tr')).toBe('1.234,50')
    expect(formatNumber(1234.5, 'en')).toBe('1,234.50')
  })

  it('formats counts without decimals', () => {
    expect(formatCount(1234, 'tr')).toBe('1.234')
    expect(formatCount(1234, 'en')).toBe('1,234')
  })

  it('renders milligrams as the grams the owner thinks in', () => {
    // The 30 g of current holdings, and the 1,200 g lifetime figure.
    expect(formatGrams(30_000, 'tr')).toBe('30\u00A0g')
    expect(formatGrams(1_200_000, 'tr')).toBe('1.200\u00A0g')
    expect(formatGrams(1_200_000, 'en')).toBe('1,200\u00A0g')
    expect(formatGrams(2_500, 'tr')).toBe('2,5\u00A0g')
  })

  it('keeps 300 as 300 — the falsification incentive is dead', () => {
    // The source deck stored 300 g as 0.300 to survive a linear axis.
    expect(formatGrams(300_000, 'tr')).toBe('300\u00A0g')
    expect(formatGrams(400_000, 'tr')).toBe('400\u00A0g')
  })
})

describe('dates', () => {
  it('renders Turkish as dd.MM.yyyy and English as dd/MM/yyyy', () => {
    expect(formatDate('2026-05-18', 'tr')).toBe('18.05.2026')
    expect(formatDate('2026-05-18', 'en')).toBe('18/05/2026')
  })

  it('does not shift the day across a timezone boundary', () => {
    expect(formatDate('2026-01-01', 'tr')).toBe('01.01.2026')
    expect(formatDate('2026-12-31', 'tr')).toBe('31.12.2026')
  })

  it('returns the input unchanged rather than inventing a date', () => {
    expect(formatDate('not-a-date', 'tr')).toBe('not-a-date')
  })

  it('names the twelve months a year workspace shows', () => {
    expect(monthNames('tr')).toEqual([
      'Ocak',
      'Şubat',
      'Mart',
      'Nisan',
      'Mayıs',
      'Haziran',
      'Temmuz',
      'Ağustos',
      'Eylül',
      'Ekim',
      'Kasım',
      'Aralık'
    ])
    expect(formatMonthName(1, 'en')).toBe('January')
    expect(formatMonthName(12, 'en')).toBe('December')
  })
})

describe('the OS is never consulted — §13', () => {
  it('maps app language to locale without asking the machine', () => {
    expect(localeFor('tr')).toBe('tr-TR')
    expect(localeFor('en')).toBe('en-GB')
  })

  it('formats identically whatever LANG, LC_ALL and TZ claim', () => {
    const before = {
      LANG: process.env['LANG'],
      LC_ALL: process.env['LC_ALL'],
      TZ: process.env['TZ']
    }
    const baseline = {
      money: formatMoney(123_456, 'TRY', 'tr'),
      date: formatDate('2026-05-18', 'tr'),
      month: formatMonthName(1, 'tr')
    }

    try {
      for (const locale of ['en_US.UTF-8', 'de_DE.UTF-8', 'ja_JP.UTF-8', 'C']) {
        process.env['LANG'] = locale
        process.env['LC_ALL'] = locale
        expect(formatMoney(123_456, 'TRY', 'tr')).toBe(baseline.money)
        expect(formatDate('2026-05-18', 'tr')).toBe(baseline.date)
        expect(formatMonthName(1, 'tr')).toBe(baseline.month)
      }
    } finally {
      process.env['LANG'] = before.LANG
      process.env['LC_ALL'] = before.LC_ALL
      process.env['TZ'] = before.TZ
    }
  })
})
