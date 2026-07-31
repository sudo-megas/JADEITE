/**
 * The two catalogues of §13, held in step with each other.
 *
 * JADEITE ships in Turkish and English, and until this file existed nothing —
 * not the compiler, not the build — made the two catalogues agree. Three ways
 * that goes wrong, all of them silent at runtime:
 *
 *   1. a key added to `en.ts` and forgotten in `tr.ts` falls back to English.
 *      Turkish is the primary language, so the fallback is the defect: one
 *      English sentence in a Turkish window, and no error anywhere;
 *   2. a key missing from both renders as the raw dotted string — `settings.
 *      autoLock` printed where a label belongs;
 *   3. a placeholder lost in translation. If `en` says `{{minutes}}` and `tr`
 *      does not, the Turkish sentence simply omits the number, and i18next
 *      reports nothing: an unsupplied variable is printed literally, but an
 *      absent one is not missed by anybody.
 *
 * None of the three shows up in a screenshot of whichever language happened to
 * be on screen. So the whole key space is compared here, where the modules can
 * be imported as real objects and a failure can name every key on the wrong
 * side rather than diffing two five-hundred-line files.
 *
 * `scripts/audit-locale.mjs` carries a deliberately coarse textual twin of the
 * first check, because `npm run audit` gates `npm run build` and this file does
 * not. The structural comparison — paths, shapes, placeholders — is here.
 */

import { describe, expect, it } from 'vitest'

import { en } from '../../src/renderer/src/i18n/locales/en.js'
import { tr } from '../../src/renderer/src/i18n/locales/tr.js'

type Catalogue = Record<string, unknown>

/**
 * Every leaf of a catalogue, as its fully-qualified key.
 *
 * The nesting is not uniform: most namespaces are one level deep
 * (`common.brand`) but several carry groups (`section1.sortState.none`), so
 * this recurses rather than assuming a depth. Anything that is not a plain
 * object is treated as a leaf — including an array or a stray number — so that
 * the "every value is a non-empty string" check names it instead of silently
 * flattening it into `foo.0`.
 */
function flatten(node: Catalogue, prefix = '', out = new Map<string, unknown>()): Map<string, unknown> {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value as Catalogue, path, out)
    } else {
      out.set(path, value)
    }
  }
  return out
}

/**
 * The interpolation variables a string asks for.
 *
 * i18next allows a format specifier after a comma — `{{value, number}}` — and
 * only the name has to match across languages; how a language chooses to format
 * it is its own business.
 */
function placeholders(value: string): Set<string> {
  const names = new Set<string>()
  for (const match of value.matchAll(/\{\{([^}]+)\}\}/g)) {
    const inner = match[1]
    if (inner === undefined) continue
    const name = (inner.split(',')[0] ?? '').trim()
    if (name !== '') names.add(name)
  }
  return names
}

const english = flatten(en)
const turkish = flatten(tr)

/** Keys present in `present` and absent from `absent`, sorted for readability. */
function missingFrom(absent: Map<string, unknown>, present: Map<string, unknown>): string[] {
  return [...present.keys()].filter((key) => !absent.has(key)).sort()
}

describe('the Turkish and English catalogues carry the same keys', () => {
  it('leaves nothing in one file that the other lacks', () => {
    // Sorted lists of the *differences*, not a toEqual on two four-hundred-item
    // arrays: the point of failing is to be told which keys, not to be handed
    // two walls of text to diff by eye.
    expect(missingFrom(turkish, english), 'in en.ts, missing from tr.ts').toEqual([])
    expect(missingFrom(english, turkish), 'in tr.ts, missing from en.ts').toEqual([])
  })

  it('opens the same top-level namespaces', () => {
    // Strictly weaker than the check above — a missing namespace is also a
    // batch of missing keys — but it fails first and reads plainly when a whole
    // section has been forgotten. Sorted, because the order the namespaces are
    // written in is a matter of taste and not a defect.
    expect(Object.keys(tr).sort()).toEqual(Object.keys(en).sort())
  })

  it('gives every key a non-empty string in both languages', () => {
    for (const [name, catalogue] of [
      ['en.ts', english],
      ['tr.ts', turkish]
    ] as const) {
      for (const [key, value] of catalogue) {
        expect(typeof value, `${name} → ${key} is not a string`).toBe('string')
        expect((value as string).trim(), `${name} → ${key} is empty`).not.toBe('')
      }
    }
  })

  it('asks for the same interpolation variables on both sides', () => {
    // A translation that drops `{{minutes}}` still reads as a sentence, which
    // is exactly why nobody notices. Sets, not order: a language may put the
    // count before the noun or after it.
    const mismatched: string[] = []
    for (const [key, value] of english) {
      const counterpart = turkish.get(key)
      if (typeof value !== 'string' || typeof counterpart !== 'string') continue
      const inEnglish = placeholders(value)
      const inTurkish = placeholders(counterpart)
      const onlyEnglish = [...inEnglish].filter((n) => !inTurkish.has(n)).sort()
      const onlyTurkish = [...inTurkish].filter((n) => !inEnglish.has(n)).sort()
      if (onlyEnglish.length > 0 || onlyTurkish.length > 0) {
        mismatched.push(
          `${key} — only in en: [${onlyEnglish.join(', ')}], only in tr: [${onlyTurkish.join(', ')}]`
        )
      }
    }
    expect(mismatched).toEqual([])
  })

  it('is frozen at the count Realisation X shipped', () => {
    // **The string freeze (Realisation X).** This was a floor from Realisation
    // IX until v1.0, and the floor was right for the whole of that time: keys
    // arrived with every rung, and an equality would have turned each new
    // string into a failing test. 430 when it was written, 443 from v0.9b —
    // raising it was the whole point, because a floor left at the previous
    // count lets the newest namespace be deleted from *both* files with every
    // other check here still green. Parity holds when both sides lose the same
    // keys, and 430 ≥ 430.
    //
    // It is an equality now because the ladder has stopped adding strings, and
    // an equality is the assertion a floor could never make: it fails when the
    // catalogues *grow*. That is the freeze. A new key is no longer a thing
    // that happens on the way to something else — it is a decision, and this
    // line is where the decision has to be written down.
    //
    // 442, and the two that went are worth naming so the number is not taken on
    // trust. `overview.yearNet` was a label for a figure the Overview year card
    // renders bare, and `section3.liveSkipped` was superseded by
    // `section3.refreshTooSoon` and left behind — both dead in src/, both
    // frozen in forever had this stayed a floor of 443 against a tree of 444.
    // Which is the case for measuring before pinning rather than pinning what
    // happened to be there.
    expect(english.size).toBe(442)
    expect(turkish.size).toBe(442)
  })
})
