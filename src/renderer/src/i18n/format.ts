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

/** An ISO-8601 date string rendered in the app language. */
export function formatDate(isoDate: string, language: AppLanguage): string {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return isoDate
  return new Intl.DateTimeFormat(localeFor(language), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
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
