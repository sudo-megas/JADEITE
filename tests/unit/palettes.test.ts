/**
 * The ten palettes of XJADEITE §12.1, and the elegance constraint of §12.3.
 */

import { describe, expect, it } from 'vitest'

import { PALETTES, FALLBACK_PALETTE_ID, isKnownPaletteId, paletteById } from '../../src/shared/theme/palettes/index.js'
import { TOKEN_NAMES, cssVariableName } from '../../src/shared/theme/types.js'
import { ACCENT_STRENGTH, accentForYear, mutedAccent, yearAccentVariables } from '../../src/renderer/src/theme/accents.js'

const HEX = /^#[0-9a-fA-F]{6}$/

/** Relative luminance per WCAG 2.x. */
function luminance(hex: string): number {
  const channel = (c: number): number => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const r = Number.parseInt(hex.slice(1, 3), 16)
  const g = Number.parseInt(hex.slice(3, 5), 16)
  const b = Number.parseInt(hex.slice(5, 7), 16)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

describe('the roster', () => {
  it('is exactly the ten palettes the specification names', () => {
    expect(PALETTES.map((p) => p.name)).toEqual([
      'Default Light',
      'Default Dark',
      'Noctalia',
      'Catppuccin Latte',
      'Catppuccin Frappé',
      'Catppuccin Macchiato',
      'Catppuccin Mocha',
      'Rosé Pine Dawn',
      'Nord',
      'Kanagawa Lotus'
    ])
  })

  it('is six dark and four light, as §12.1 records', () => {
    const dark = PALETTES.filter((p) => p.mode === 'dark')
    const light = PALETTES.filter((p) => p.mode === 'light')
    expect(dark).toHaveLength(6)
    expect(light).toHaveLength(4)
  })

  it('has unique ids', () => {
    const ids = PALETTES.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('falls back to Default Dark for anything unrecognised', () => {
    expect(paletteById('no-such-palette').id).toBe(FALLBACK_PALETTE_ID)
    expect(paletteById(null).id).toBe(FALLBACK_PALETTE_ID)
    expect(paletteById(undefined).id).toBe(FALLBACK_PALETTE_ID)
    expect(isKnownPaletteId('no-such-palette')).toBe(false)
    expect(isKnownPaletteId('nord')).toBe(true)
  })
})

describe('every palette is complete', () => {
  for (const palette of PALETTES) {
    describe(palette.name, () => {
      it('defines every token as a six-digit hex', () => {
        for (const token of TOKEN_NAMES) {
          const value = palette.tokens[token]
          expect(value, `${palette.id}.${token}`).toMatch(HEX)
        }
      })

      it('offers a full accent sequence for year workspaces', () => {
        expect(palette.accentSequence.length).toBe(8)
        for (const accent of palette.accentSequence) expect(accent).toMatch(HEX)
        expect(new Set(palette.accentSequence).size).toBe(palette.accentSequence.length)
      })

      it('keeps body text legible against the surface', () => {
        // WCAG AA for body text. Clarity is a hard requirement in §12.3, not a
        // style preference.
        expect(contrast(palette.tokens.text, palette.tokens.surface)).toBeGreaterThanOrEqual(4.5)
      })

      it('keeps muted text legible too', () => {
        // AA for large text; muted text is secondary but must never be a
        // guessing game.
        expect(contrast(palette.tokens.textMuted, palette.tokens.surface)).toBeGreaterThanOrEqual(3)
      })

      it('keeps text on the accent legible', () => {
        expect(contrast(palette.tokens.textOnAccent, palette.tokens.accent)).toBeGreaterThanOrEqual(
          3
        )
      })

      it('orders its surfaces so raised and sunken differ from the page', () => {
        expect(palette.tokens.surfaceRaised).not.toBe(palette.tokens.surface)
        expect(palette.tokens.surfaceSunken).not.toBe(palette.tokens.surface)
      })

      it('points its declared mode the right way', () => {
        const light = luminance(palette.tokens.surface) > 0.5
        expect(light ? 'light' : 'dark').toBe(palette.mode)
      })
    })
  }
})

describe('token naming', () => {
  it('maps camelCase tokens to kebab-case custom properties', () => {
    expect(cssVariableName('surface')).toBe('--surface')
    expect(cssVariableName('surfaceRaised')).toBe('--surface-raised')
    expect(cssVariableName('textOnAccent')).toBe('--text-on-accent')
  })
})

describe('year accents — §12.3', () => {
  const palette = PALETTES.find((p) => p.id === 'nord')!

  it('gives consecutive years different accents', () => {
    const a = accentForYear(palette, 2024, 2024)
    const b = accentForYear(palette, 2025, 2024)
    const c = accentForYear(palette, 2026, 2024)
    expect(new Set([a, b, c]).size).toBe(3)
  })

  it('cycles once the sequence is exhausted, and is stable', () => {
    const first = accentForYear(palette, 2024, 2024)
    const wrapped = accentForYear(palette, 2024 + palette.accentSequence.length, 2024)
    expect(wrapped).toBe(first)
    expect(accentForYear(palette, 2024, 2024)).toBe(first)
  })

  it('handles years before the first one without falling off the sequence', () => {
    const earlier = accentForYear(palette, 2020, 2024)
    expect(palette.accentSequence).toContain(earlier)
  })

  it('mutes toward the surface rather than toward an assumed grey', () => {
    const wash = mutedAccent('#88c0d0', 'wash')
    expect(wash).toContain('color-mix(in oklch')
    expect(wash).toContain('var(--surface)')
  })

  it('keeps large fills quieter than small marks — the elegance constraint', () => {
    expect(ACCENT_STRENGTH.wash).toBeLessThan(ACCENT_STRENGTH.tint)
    expect(ACCENT_STRENGTH.tint).toBeLessThan(ACCENT_STRENGTH.line)
    expect(ACCENT_STRENGTH.line).toBeLessThan(ACCENT_STRENGTH.mark)
    // Nothing lands at full strength on a large area.
    expect(ACCENT_STRENGTH.wash).toBeLessThanOrEqual(15)
  })

  it('publishes the whole set of variables a workspace needs', () => {
    const vars = yearAccentVariables(palette, 2025, 2024)
    expect(Object.keys(vars).sort()).toEqual([
      '--year-accent',
      '--year-accent-line',
      '--year-accent-mark',
      '--year-accent-tint',
      '--year-accent-wash'
    ])
  })

  it('lets a manual override replace the sequence value, muted the same way', () => {
    const overridden = yearAccentVariables(palette, 2025, 2024, '#aa3366')
    expect(overridden['--year-accent']).toBe('#aa3366')
    expect(overridden['--year-accent-wash']).toContain('#aa3366')
    expect(overridden['--year-accent-wash']).toContain('var(--surface)')
  })

  it('ignores an empty override', () => {
    const vars = yearAccentVariables(palette, 2025, 2024, '')
    expect(vars['--year-accent']).toBe(accentForYear(palette, 2025, 2024))
  })
})
