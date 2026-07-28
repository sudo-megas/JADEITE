/**
 * Recovery-key codec — XJADEITE §4.3.
 *
 * Format (owner's ruling, this session):
 *
 *     XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
 *     └──────── 20 data ───────┘ └ck┘
 *
 * Six groups of four Crockford Base32 symbols: twenty carry entropy, the last
 * four are a checksum over them. Crockford's alphabet omits I, L, O and U, and
 * decoding folds the look-alikes, so a key copied off paper in a hurry either
 * decodes to what was written or fails loudly — it never silently becomes a
 * different key.
 *
 * Entropy: 20 symbols x 5 bits = 100 bits.
 */

import { createHash, randomBytes } from 'node:crypto'

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const DATA_SYMBOLS = 20
const CHECK_SYMBOLS = 4
const TOTAL_SYMBOLS = DATA_SYMBOLS + CHECK_SYMBOLS
const GROUP_SIZE = 4

/** Domain separator, so this checksum can never be confused with another hash. */
const CHECKSUM_DOMAIN = 'jadeite:recovery-key:v1'

/**
 * Fold the ambiguous glyphs a human might write or read back, then reject
 * anything still outside the alphabet.
 *
 * Crockford's rules: I, i, L and l all mean 1; O and o mean 0. U is excluded
 * from the alphabet entirely and is not accepted as a substitute for V.
 */
function normaliseSymbol(ch: string): string | null {
  const c = ch.toUpperCase()
  if (c === 'I' || c === 'L') return '1'
  if (c === 'O') return '0'
  return ALPHABET.includes(c) ? c : null
}

/** Twenty checksum bits, rendered as four Crockford symbols. */
function checksumFor(dataSymbols: string): string {
  const digest = createHash('sha256').update(`${CHECKSUM_DOMAIN}:${dataSymbols}`, 'utf8').digest()
  let out = ''
  // Four symbols x 5 bits = 20 bits, taken from the first 20 bits of the digest.
  const bits = ((digest[0]! << 16) | (digest[1]! << 8) | digest[2]!) >>> 4
  for (let i = CHECK_SYMBOLS - 1; i >= 0; i--) {
    out += ALPHABET[(bits >>> (i * 5)) & 0x1f]
  }
  return out
}

/** Insert the group separators for display. */
export function formatRecoveryKey(symbols: string): string {
  const groups: string[] = []
  for (let i = 0; i < symbols.length; i += GROUP_SIZE) {
    groups.push(symbols.slice(i, i + GROUP_SIZE))
  }
  return groups.join('-')
}

/**
 * Generate a fresh recovery key.
 *
 * 256 is an exact multiple of 32, so reducing a uniform random byte modulo the
 * alphabet size stays uniform — there is no modulo bias to reject around.
 */
export function generateRecoveryKey(): { formatted: string; canonical: string; data: string } {
  const bytes = randomBytes(DATA_SYMBOLS)
  let data = ''
  for (let i = 0; i < DATA_SYMBOLS; i++) {
    data += ALPHABET[bytes[i]! % ALPHABET.length]
  }
  const canonical = data + checksumFor(data)
  return { formatted: formatRecoveryKey(canonical), canonical, data }
}

export type RecoveryKeyParse =
  | { ok: true; canonical: string; data: string }
  | { ok: false; reason: 'length' | 'charset' | 'checksum' }

/**
 * Parse a key as typed by a human: any case, any separators, look-alikes folded.
 *
 * The returned `data` is what the key derivation consumes — never the formatted
 * string — so hyphens, spacing and case can vary without changing the key.
 */
export function parseRecoveryKey(input: string): RecoveryKeyParse {
  let symbols = ''
  for (const ch of input) {
    if (ch === '-' || ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') continue
    const s = normaliseSymbol(ch)
    if (s === null) return { ok: false, reason: 'charset' }
    symbols += s
  }

  if (symbols.length !== TOTAL_SYMBOLS) return { ok: false, reason: 'length' }

  const data = symbols.slice(0, DATA_SYMBOLS)
  const check = symbols.slice(DATA_SYMBOLS)
  if (check !== checksumFor(data)) return { ok: false, reason: 'checksum' }

  return { ok: true, canonical: symbols, data }
}

export const RECOVERY_KEY_SHAPE = {
  alphabet: ALPHABET,
  dataSymbols: DATA_SYMBOLS,
  checkSymbols: CHECK_SYMBOLS,
  totalSymbols: TOTAL_SYMBOLS,
  groupSize: GROUP_SIZE,
  entropyBits: DATA_SYMBOLS * 5
} as const
