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
  monthNames,
  parseDate
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
  it('writes GG/AA/YYYY in both languages — the house shape, not ICU’s default', () => {
    // ICU would give Turkish `18.05.2026`. The app writes one shape in both
    // languages, and English already wrote this one.
    expect(formatDate('2026-05-18', 'tr')).toBe('18/05/2026')
    expect(formatDate('2026-05-18', 'en')).toBe('18/05/2026')
  })

  it('keeps ICU’s zero-padding and day-first order rather than rebuilding them', () => {
    expect(formatDate('2026-01-02', 'tr')).toBe('02/01/2026')
    expect(formatDate('2026-01-02', 'en')).toBe('02/01/2026')
  })

  it('does not shift the day across a timezone boundary', () => {
    expect(formatDate('2026-01-01', 'tr')).toBe('01/01/2026')
    expect(formatDate('2026-12-31', 'tr')).toBe('31/12/2026')
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

/** The typed half. Display is one direction; this is the one that stores. */
describe('reading a typed date back', () => {
  it('reads GG/AA/YYYY into the ISO-8601 the vault stores', () => {
    expect(parseDate('18/05/2026', 'tr')).toEqual({ kind: 'date', iso: '2026-05-18' })
    expect(parseDate('18/05/2026', 'en')).toEqual({ kind: 'date', iso: '2026-05-18' })
  })

  it('takes a single-digit day and month — 1/3/2026 is not a mistake', () => {
    expect(parseDate('1/3/2026', 'tr')).toEqual({ kind: 'date', iso: '2026-03-01' })
    expect(parseDate('01/3/2026', 'tr')).toEqual({ kind: 'date', iso: '2026-03-01' })
    expect(parseDate('1/03/2026', 'tr')).toEqual({ kind: 'date', iso: '2026-03-01' })
  })

  it('tolerates the dot and the dash, which is what the old shapes used', () => {
    // The dot is what ICU writes for Turkish and what the owner's spreadsheets
    // are full of; the dash is the separator the ledger asked for until now.
    expect(parseDate('18.05.2026', 'tr')).toEqual({ kind: 'date', iso: '2026-05-18' })
    expect(parseDate('18-05-2026', 'tr')).toEqual({ kind: 'date', iso: '2026-05-18' })
    expect(parseDate('1.3.2026', 'tr')).toEqual({ kind: 'date', iso: '2026-03-01' })
  })

  it('refuses a separator that changes halfway through', () => {
    expect(parseDate('18/05.2026', 'tr')).toEqual({ kind: 'error', reason: 'INVALID_DATE' })
    expect(parseDate('18.05-2026', 'tr')).toEqual({ kind: 'error', reason: 'INVALID_DATE' })
  })

  it('ignores surrounding whitespace, since a paste carries it', () => {
    expect(parseDate('  18/05/2026 ', 'tr')).toEqual({ kind: 'date', iso: '2026-05-18' })
  })

  it('refuses a day the calendar does not have', () => {
    // Date.UTC rolls this into 3 March without a word, which is why the check is
    // a round trip rather than a rule about February.
    expect(parseDate('31/02/2026', 'tr')).toEqual({ kind: 'error', reason: 'INVALID_DATE' })
    expect(parseDate('31/04/2026', 'tr')).toEqual({ kind: 'error', reason: 'INVALID_DATE' })
    expect(parseDate('00/05/2026', 'tr')).toEqual({ kind: 'error', reason: 'INVALID_DATE' })
    expect(parseDate('18/13/2026', 'tr')).toEqual({ kind: 'error', reason: 'INVALID_DATE' })
    expect(parseDate('18/00/2026', 'tr')).toEqual({ kind: 'error', reason: 'INVALID_DATE' })
  })

  it('accepts 29 February in a leap year and refuses it in the year after', () => {
    expect(parseDate('29/02/2024', 'tr')).toEqual({ kind: 'date', iso: '2024-02-29' })
    expect(parseDate('29/02/2025', 'tr')).toEqual({ kind: 'error', reason: 'INVALID_DATE' })
  })

  it('holds the same year bounds the main process refuses on', () => {
    expect(parseDate('01/01/1970', 'tr')).toEqual({ kind: 'date', iso: '1970-01-01' })
    expect(parseDate('31/12/2200', 'tr')).toEqual({ kind: 'date', iso: '2200-12-31' })
    expect(parseDate('31/12/1969', 'tr')).toEqual({ kind: 'error', reason: 'INVALID_DATE' })
    expect(parseDate('01/01/2201', 'tr')).toEqual({ kind: 'error', reason: 'INVALID_DATE' })
  })

  it('refuses ISO, rather than quietly understanding two grammars at once', () => {
    // Day-first and only day-first: 2026 is not a day. Storage is still ISO —
    // this is about what the *field* accepts.
    expect(parseDate('2026-05-18', 'tr')).toEqual({ kind: 'error', reason: 'INVALID_DATE' })
    expect(parseDate('2026/05/18', 'tr')).toEqual({ kind: 'error', reason: 'INVALID_DATE' })
  })

  it('refuses a two-digit year rather than guessing a century', () => {
    expect(parseDate('18/05/26', 'tr')).toEqual({ kind: 'error', reason: 'INVALID_DATE' })
  })

  it('refuses everything that is not a date at all', () => {
    expect(parseDate('', 'tr')).toEqual({ kind: 'error', reason: 'INVALID_DATE' })
    expect(parseDate('   ', 'tr')).toEqual({ kind: 'error', reason: 'INVALID_DATE' })
    expect(parseDate('dün', 'tr')).toEqual({ kind: 'error', reason: 'INVALID_DATE' })
    expect(parseDate('18/05', 'tr')).toEqual({ kind: 'error', reason: 'INVALID_DATE' })
    expect(parseDate('18/05/2026/01', 'tr')).toEqual({ kind: 'error', reason: 'INVALID_DATE' })
    expect(parseDate('180/5/2026', 'tr')).toEqual({ kind: 'error', reason: 'INVALID_DATE' })
    expect(parseDate('18 05 2026', 'tr')).toEqual({ kind: 'error', reason: 'INVALID_DATE' })
  })

  it('round-trips against formatDate, which is the property that matters', () => {
    // Every date the ledger can show must be a date the ledger can read back —
    // the append row carries a formatted date into a field this parses.
    const isoDates = [
      '1970-01-01',
      '2023-10-15',
      '2026-01-01',
      '2026-02-28',
      '2024-02-29',
      '2026-05-18',
      '2026-12-31',
      '2200-12-31'
    ]
    for (const iso of isoDates) {
      for (const language of ['tr', 'en'] as const) {
        expect(parseDate(formatDate(iso, language), language)).toEqual({ kind: 'date', iso })
      }
    }
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
