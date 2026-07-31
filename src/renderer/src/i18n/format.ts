/**
 * Number, currency and date formatting — XJADEITE §13.
 *
 * Formatting follows the *selected app language*, never the operating system.
 * Every Intl constructor here is given an explicit locale; a bare
 * `toLocaleString()` anywhere in the renderer would silently reintroduce the
 * OS locale, and scripts/audit-locale.mjs fails the build when one appears.
 *
 * Money arrives as integer minor units and is divided only at the moment of
 * display, so no float ever participates in arithmetic.
 */

import { MAX_YEAR, MIN_YEAR } from '@shared/calendar.js'

export type AppLanguage = 'tr' | 'en'
export type Currency = 'TRY' | 'USD' | 'EUR'

/** The app language chooses the locale; the OS never does. */
const LOCALES: Record<AppLanguage, string> = {
  tr: 'tr-TR',
  en: 'en-GB'
}

export function localeFor(language: AppLanguage): string {
  return LOCALES[language]
}

const MINOR_UNITS_PER_MAJOR = 100

/**
 * A non-breaking space joins a number to its unit.
 *
 * Written as an escape rather than typed, because the difference between this
 * and an ordinary space is invisible in source and decides whether "6.505,00"
 * and "₺" can be split across two lines in a narrow grid cell.
 */
const NBSP = '\u00A0'

/**
 * ICU renders Turkish currency with the symbol leading ("₺1.234,56"), but the
 * specification asks for "1.234,56 ₺" — the form the owner's own workbook
 * used. Rebuilding from parts keeps ICU's grouping and decimal separators
 * while putting the symbol where Turkish convention puts it.
 */
function withTrailingSymbol(parts: Intl.NumberFormatPart[]): string {
  const symbol = parts.find((p) => p.type === 'currency')?.value ?? ''
  const number = parts
    .filter((p) => p.type !== 'currency' && p.type !== 'literal')
    .map((p) => p.value)
    .join('')
  return symbol ? `${number}${NBSP}${symbol}` : number
}

export function formatMoney(
  minorUnits: number,
  currency: Currency,
  language: AppLanguage
): string {
  const formatter = new Intl.NumberFormat(localeFor(language), {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
  const value = minorUnits / MINOR_UNITS_PER_MAJOR

  if (language === 'tr') return withTrailingSymbol(formatter.formatToParts(value))
  return formatter.format(value)
}

/** A plain number, for the 'plain' column type of §6.2. */
export function formatNumber(
  value: number,
  language: AppLanguage,
  fractionDigits = 2
): string {
  return new Intl.NumberFormat(localeFor(language), {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  }).format(value)
}

/** Integer count, no decimals — pieces of gold, row numbers. */
export function formatCount(value: number, language: AppLanguage): string {
  return new Intl.NumberFormat(localeFor(language), { maximumFractionDigits: 0 }).format(value)
}

/**
 * Weighable valuables are stored as integer milligrams (§5.2); grams are the
 * unit the owner thinks in.
 */
export function formatGrams(milligrams: number, language: AppLanguage): string {
  const grams = milligrams / 1000
  const formatted = new Intl.NumberFormat(localeFor(language), {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  }).format(grams)
  return `${formatted}${NBSP}g`
}

/**
 * The one separator a JADEITE date is written with, in either language.
 *
 * ICU's Turkish default is `18.05.2026`, with dots — so "GG/AA/YYYY is the
 * Turkish format" is not quite a fact, and the honest way to have it is to make
 * it a *house* format instead. §13 forbids reading the machine's locale; it says
 * nothing about which of several correct Turkish forms the app writes, and that
 * is a design choice the app is entitled to make. Slashes are also what `en-GB`
 * already produces, so choosing them for Turkish makes the two languages agree
 * on the shape of a date rather than disagree — the owner reads one field one
 * way whichever language is on, and a date copied out of the ledger under
 * Turkish types straight back in under English.
 */
const DATE_SEPARATOR = '/'

/**
 * An ISO-8601 date string rendered in the app language, as GG/AA/YYYY.
 *
 * ICU still supplies every digit. Rebuilding from `formatToParts()` — the same
 * technique `withTrailingSymbol` uses above to move the ₺ — leaves the field
 * order and the zero-padding in ICU's hands and replaces only the literals
 * between them. A hand-rolled `${day}/${month}/${year}` would have produced the
 * identical string today and taken the calendar away from ICU forever; it would
 * also be invisible to scripts/audit-locale.mjs, which can catch an `Intl`
 * constructor used wrongly and cannot catch a formatter that never asks ICU
 * anything at all.
 *
 * Storage is untouched by any of this. §5.2 pins ISO-8601 on disk, and this
 * function is the boundary where that turns into something a person reads.
 */
export function formatDate(isoDate: string, language: AppLanguage): string {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return isoDate
  return new Intl.DateTimeFormat(localeFor(language), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
    .formatToParts(date)
    .filter((part) => part.type !== 'literal')
    .map((part) => part.value)
    .join(DATE_SEPARATOR)
}

export type ParsedDate =
  | { kind: 'date'; iso: string }
  | { kind: 'error'; reason: 'INVALID_DATE' }

/**
 * Day, separator, month, the same separator, year. The backreference is the
 * point of writing it this way: `18/05.2026` is a typo rather than a date, and
 * a character class on each separator would have accepted it silently.
 *
 * One or two digits for the day and the month, because `1/3/2026` is how a date
 * gets typed in a hurry and refusing it would be pedantry rather than safety —
 * nothing is ambiguous about it. Four for the year, always: a two-digit year is
 * a guess about a century, and this ledger holds dates the owner will read back
 * in twenty years.
 */
const DATE_INPUT = /^(\d{1,2})([./-])(\d{1,2})\2(\d{4})$/

/**
 * A typed date, read back into the ISO-8601 the vault stores — the other half of
 * `formatDate`, and the app's first date parser.
 *
 * Day-first, and *only* day-first. `2026-05-18` is refused rather than quietly
 * understood as ISO: accepting both would mean the field has two grammars, and
 * the day a four-digit-looking leading field turns out to be ambiguous is the
 * day a wrong date is stored silently. (It is not ambiguous today — no day is
 * 2026 — which is exactly why the refusal costs nothing and the tolerance would
 * have bought nothing.)
 *
 * Dots and dashes are tolerated as separators even though slashes are what the
 * app writes. That is not indecision: `.` is what ICU produces for Turkish and
 * what nine years of the owner's spreadsheets contain, and refusing a shape the
 * app itself displayed until this revision would be a trap rather than a rule.
 * Reading is generous; writing is one shape.
 *
 * The calendar is checked by round trip rather than by table, mirroring
 * `cleanDate` in `main/vault/db/section3.ts`: `Date.UTC` rolls 31 February into
 * 3 March without complaint, so the only way to know a date exists is to build
 * it and ask it what it became. `MIN_YEAR`/`MAX_YEAR` come from
 * `@shared/calendar.js` — the same constants the main process refuses on — so
 * the two ends agree by construction and not by coincidence. UTC throughout,
 * because the question here is which square of a calendar was meant, and a
 * timezone would only be able to make that answer wrong.
 *
 * Empty is `INVALID_DATE` rather than a kind of its own. Every other parser in
 * the app distinguishes empty from wrong because empty is sometimes *allowed*
 * there — a price may be absent (§6.3). A transaction with no date is not a
 * transaction, so the distinction would have no consequence to carry.
 *
 * `_language` is unread, and stays. Every parse and format function in the app
 * takes the language as its last argument, so a call site that suddenly did not
 * would read as an oversight; and the parameter is what a future divergence
 * between the two languages would need, at no cost while they agree.
 */
export function parseDate(input: string, _language: AppLanguage): ParsedDate {
  const match = DATE_INPUT.exec(input.trim())
  if (!match) return { kind: 'error', reason: 'INVALID_DATE' }

  const [, dayText, , monthText, yearText] = match
  const day = Number(dayText)
  const month = Number(monthText)
  const year = Number(yearText)
  if (year < MIN_YEAR || year > MAX_YEAR) return { kind: 'error', reason: 'INVALID_DATE' }

  const candidate = new Date(Date.UTC(year, month - 1, day))
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return { kind: 'error', reason: 'INVALID_DATE' }
  }

  const pad = (value: number): string => String(value).padStart(2, '0')
  return { kind: 'date', iso: `${year}-${pad(month)}-${pad(day)}` }
}

/** Month 1-12 as its name — Ocak … Aralık in Turkish. */
export function formatMonthName(month: number, language: AppLanguage): string {
  const date = new Date(Date.UTC(2000, month - 1, 1))
  return new Intl.DateTimeFormat(localeFor(language), { month: 'long', timeZone: 'UTC' }).format(
    date
  )
}

/** The twelve month rows every year workspace shows (§6.1). */
export function monthNames(language: AppLanguage): string[] {
  return Array.from({ length: 12 }, (_, i) => formatMonthName(i + 1, language))
}
