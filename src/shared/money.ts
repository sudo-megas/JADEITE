/**
 * Reading a typed amount back into integer minor units — XJADEITE §5.2.
 *
 * Display is one direction (i18n/format.ts turns 123456 into "1.234,56 ₺");
 * this is the other. It is deliberately the stricter half, because a formatter
 * that guesses wrong shows a wrong number for a second and a parser that
 * guesses wrong stores a wrong number forever.
 *
 * The rules, all of them:
 *
 *   - The app language decides the separators. Turkish reads "1.234,56";
 *     English reads "1,234.56". Neither is inferred from the string, because
 *     "1.234" is a thousand in one language and one-and-a-bit in the other, and
 *     there is no honest way to tell which the owner meant.
 *   - Grouping separators must sit in real group positions. "1.5" typed under
 *     Turkish is refused rather than read as either 15 or 1.5.
 *   - At most two decimal places. Money is kuruş; a third digit is a question,
 *     not a rounding opportunity.
 *   - A leading minus is refused outright. Amounts are entered positive and the
 *     column's group carries the sign (§5.2, §6.3); silently taking the absolute
 *     value would resurrect exactly the June-2025 elektrik sign slip this
 *     convention exists to retire.
 *   - Empty is empty (§6.3). It parses to `empty`, never to zero.
 *
 * No float participates. The digits are assembled as strings and the integer is
 * built once, so 0.1 + 0.2 never gets the chance to become 0.30000000000000004.
 */

export type MoneyLanguage = 'tr' | 'en'

export type ParseFailure =
  | 'NOT_A_NUMBER'
  | 'NEGATIVE'
  | 'TOO_MANY_DECIMALS'
  | 'BAD_GROUPING'
  | 'TOO_LARGE'

export type ParsedAmount =
  | { kind: 'empty' }
  | { kind: 'amount'; minorUnits: number }
  | { kind: 'error'; reason: ParseFailure }

/**
 * The same result, before it is called money.
 *
 * Section 3 parses quantities as well as prices — milligrams to three decimal
 * places of a gram, coins to none at all — and every rule above applies to those
 * unchanged. So the rules live once, in `parseFixedPoint`, and both callers name
 * the result in their own terms (`shared/section3/units.ts`).
 */
export type ParsedFixedPoint =
  | { kind: 'empty' }
  | { kind: 'value'; scaled: number }
  | { kind: 'error'; reason: ParseFailure }

/** Separators per language: the decimal mark, and the grouping mark. */
const SEPARATORS: Record<MoneyLanguage, { decimal: string; group: string }> = {
  tr: { decimal: ',', group: '.' },
  en: { decimal: '.', group: ',' }
}

/** Two decimal places, per §5.2. */
const MINOR_DIGITS = 2
const MINOR_UNITS_PER_MAJOR = 100

/**
 * Symbols and spacing a person reasonably pastes in with an amount.
 *
 * The non-breaking space is here because i18n/format.ts emits one between the
 * number and its symbol, so a value copied out of a JADEITE cell and pasted
 * back into another must survive the round trip.
 */
const NOISE = /[₺$€\s  ]/g

export function separatorsFor(language: MoneyLanguage): { decimal: string; group: string } {
  return SEPARATORS[language]
}

/**
 * Are the grouping separators where grouping separators go?
 *
 * `1.234.567` yes; `1.23` no; `.123` no. Anything with no grouping mark at all
 * is trivially fine — this only judges strings that used one.
 */
function groupingIsWellFormed(integerPart: string, group: string): boolean {
  if (!integerPart.includes(group)) return true
  const groups = integerPart.split(group)
  const [first, ...rest] = groups
  if (first === undefined || first.length === 0 || first.length > 3) return false
  return rest.every((g) => g.length === 3)
}

/**
 * Parse a typed amount into integer minor units.
 *
 * `plain`-typed columns (§6.2) share this path: they are not money, but they
 * are stored in the same hundredths so that one column type never needs a
 * second storage convention. Only their presentation differs.
 */
export function parseAmount(input: string, language: MoneyLanguage): ParsedAmount {
  const parsed = parseFixedPoint(input, language, MINOR_DIGITS)
  if (parsed.kind === 'value') return { kind: 'amount', minorUnits: parsed.scaled }
  return parsed
}

/**
 * Read a typed decimal into an integer scaled by `fractionDigits` places.
 *
 * `fractionDigits` of 2 gives kuruş from lira; 3 gives milligrams from grams; 0
 * refuses a decimal point outright, which is what a count of coins wants. Every
 * rule in this module's opening note is enforced here and nowhere else, so money
 * and quantity cannot drift apart about what a comma means.
 */
export function parseFixedPoint(
  input: string,
  language: MoneyLanguage,
  fractionDigits: number
): ParsedFixedPoint {
  const cleaned = input.replace(NOISE, '')
  if (cleaned.length === 0) return { kind: 'empty' }

  // Refused, not absolute-valued: see the module note.
  if (cleaned.startsWith('-') || cleaned.startsWith('−')) {
    return { kind: 'error', reason: 'NEGATIVE' }
  }

  const body = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned
  if (body.length === 0) return { kind: 'error', reason: 'NOT_A_NUMBER' }

  const { decimal, group } = SEPARATORS[language]

  // Anything that is not a digit or one of this language's two separators is
  // not an amount. A separator borrowed from the other language lands here on
  // purpose — being told "that is not a number" beats being silently given a
  // value a thousand times too large.
  const permitted = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', decimal, group])
  for (const character of body) {
    if (!permitted.has(character)) return { kind: 'error', reason: 'NOT_A_NUMBER' }
  }

  const decimalCount = body.split(decimal).length - 1
  if (decimalCount > 1) return { kind: 'error', reason: 'NOT_A_NUMBER' }

  const splitAt = decimalCount === 1 ? body.indexOf(decimal) : body.length
  const integerPart = body.slice(0, splitAt)
  const fractionPart = decimalCount === 1 ? body.slice(splitAt + 1) : ''

  if (fractionPart.includes(group)) return { kind: 'error', reason: 'BAD_GROUPING' }
  if (fractionPart.length > fractionDigits) return { kind: 'error', reason: 'TOO_MANY_DECIMALS' }
  if (!groupingIsWellFormed(integerPart, group)) return { kind: 'error', reason: 'BAD_GROUPING' }

  const integerDigits = integerPart.split(group).join('')
  if (integerDigits.length === 0 && fractionPart.length === 0) {
    return { kind: 'error', reason: 'NOT_A_NUMBER' }
  }

  const whole = integerDigits.length === 0 ? '0' : integerDigits
  const minor = fractionPart.padEnd(fractionDigits, '0')

  // Assembled as digits, so the value never passes through a float.
  const scaled = Number(`${whole}${minor}`)
  if (!Number.isSafeInteger(scaled)) return { kind: 'error', reason: 'TOO_LARGE' }

  return { kind: 'value', scaled }
}

/**
 * The editable text for a stored amount.
 *
 * Deliberately ungrouped: an editor showing "1.234.567,89" invites a keystroke
 * that lands between the digits and the grouping mark. Grouping is for reading,
 * which is the formatter's job, not this one's.
 */
export function amountToInput(minorUnits: number | null, language: MoneyLanguage): string {
  if (minorUnits === null) return ''
  const { decimal } = SEPARATORS[language]
  const whole = Math.trunc(minorUnits / MINOR_UNITS_PER_MAJOR)
  const minor = Math.abs(minorUnits % MINOR_UNITS_PER_MAJOR)
  return `${whole}${decimal}${String(minor).padStart(MINOR_DIGITS, '0')}`
}
