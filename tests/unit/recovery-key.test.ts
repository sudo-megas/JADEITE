import { describe, expect, it } from 'vitest'

import {
  RECOVERY_KEY_SHAPE,
  formatRecoveryKey,
  generateRecoveryKey,
  parseRecoveryKey
} from '../../src/main/vault/recovery-key.js'

describe('recovery key format', () => {
  it('prints as six groups of four, exactly as §4.3 shows it', () => {
    const { formatted } = generateRecoveryKey()
    expect(formatted).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){5}$/)
    expect(formatted.split('-')).toHaveLength(6)
    expect(formatted.replace(/-/g, '')).toHaveLength(24)
  })

  it('carries 100 bits across 20 data symbols', () => {
    expect(RECOVERY_KEY_SHAPE.dataSymbols).toBe(20)
    expect(RECOVERY_KEY_SHAPE.checkSymbols).toBe(4)
    expect(RECOVERY_KEY_SHAPE.entropyBits).toBe(100)
  })

  it('never emits the ambiguous letters Crockford excludes', () => {
    for (let i = 0; i < 200; i++) {
      const { canonical } = generateRecoveryKey()
      expect(canonical).not.toMatch(/[ILOU]/)
    }
  })

  it('does not repeat itself', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 500; i++) seen.add(generateRecoveryKey().canonical)
    expect(seen.size).toBe(500)
  })
})

describe('parsing a key as a human typed it', () => {
  it('round-trips its own output', () => {
    const { formatted, data } = generateRecoveryKey()
    const parsed = parseRecoveryKey(formatted)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.data).toBe(data)
  })

  it('accepts lower case, stray spaces and missing hyphens', () => {
    const { formatted, data } = generateRecoveryKey()
    const mangled = formatted.toLowerCase().replace(/-/g, ' ')
    const parsed = parseRecoveryKey(mangled)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.data).toBe(data)
  })

  it('folds the look-alikes: I and L mean 1, O means 0', () => {
    const withOnesAndZeros = parseRecoveryKey(formatRecoveryKey('10'.repeat(12)))
    const withLettersInstead = parseRecoveryKey(formatRecoveryKey('LO'.repeat(12)))
    // Both decode to the same symbols; whether the checksum passes is a
    // separate question, so compare the failure reason rather than the value.
    expect(withOnesAndZeros.ok).toBe(withLettersInstead.ok)
    if (!withOnesAndZeros.ok && !withLettersInstead.ok) {
      expect(withOnesAndZeros.reason).toBe(withLettersInstead.reason)
    }
  })

  it('accepts a valid key written with look-alike letters', () => {
    const { formatted, data } = generateRecoveryKey()
    const asHandwritten = formatted.replace(/1/g, 'I').replace(/0/g, 'O')
    const parsed = parseRecoveryKey(asHandwritten)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.data).toBe(data)
  })
})

describe('a key copied down wrong is refused, not silently accepted', () => {
  it('catches every single-symbol substitution', () => {
    const alphabet = RECOVERY_KEY_SHAPE.alphabet
    const { canonical } = generateRecoveryKey()

    let tested = 0
    for (let i = 0; i < canonical.length; i++) {
      for (const replacement of alphabet) {
        if (replacement === canonical[i]) continue
        const corrupted = canonical.slice(0, i) + replacement + canonical.slice(i + 1)
        const parsed = parseRecoveryKey(formatRecoveryKey(corrupted))
        expect(parsed.ok, `substitution at ${i} -> ${replacement} slipped through`).toBe(false)
        tested++
      }
    }
    expect(tested).toBe(24 * 31)
  })

  it('catches adjacent transpositions', () => {
    for (let attempt = 0; attempt < 50; attempt++) {
      const { canonical } = generateRecoveryKey()
      for (let i = 0; i < canonical.length - 1; i++) {
        if (canonical[i] === canonical[i + 1]) continue
        const swapped =
          canonical.slice(0, i) + canonical[i + 1] + canonical[i] + canonical.slice(i + 2)
        expect(parseRecoveryKey(formatRecoveryKey(swapped)).ok).toBe(false)
      }
    }
  })

  it('rejects the wrong length', () => {
    const { canonical } = generateRecoveryKey()
    expect(parseRecoveryKey(canonical.slice(0, 23))).toEqual({ ok: false, reason: 'length' })
    expect(parseRecoveryKey(canonical + 'A')).toEqual({ ok: false, reason: 'length' })
    expect(parseRecoveryKey('')).toEqual({ ok: false, reason: 'length' })
  })

  it('rejects characters outside the alphabet, including U', () => {
    const { canonical } = generateRecoveryKey()
    expect(parseRecoveryKey('U' + canonical.slice(1))).toEqual({ ok: false, reason: 'charset' })
    expect(parseRecoveryKey('!' + canonical.slice(1))).toEqual({ ok: false, reason: 'charset' })
  })

  it('reports a checksum failure distinctly from a malformed one', () => {
    const bad = 'ABCD'.repeat(6)
    const parsed = parseRecoveryKey(bad)
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.reason).toBe('checksum')
  })
})
