/**
 * Year accents — XJADEITE §12.3.
 *
 * Each year takes the next accent from the active palette's sequence. The
 * elegance constraint is the whole point: JADEITE is not a kid's-play app, so
 * an accent never lands at full strength on a large area. It arrives as a
 * wash for banding, a line for borders, and only reaches its true saturation
 * on small marks like a switcher chip.
 *
 * The muting is done with `color-mix` in OKLCH against the palette's own
 * surface, so every palette mutes toward its own character rather than toward
 * an assumed grey.
 */

import type { Palette } from '@shared/theme/types.js'

/** How far each role is pulled toward the surface. Lower means quieter. */
export const ACCENT_STRENGTH = {
  /** Row banding and large fills. */
  wash: 12,
  /** Header tint. */
  tint: 24,
  /** Rules and borders. */
  line: 45,
  /** Chips and small marks — nearly the accent itself. */
  mark: 88
} as const

export type AccentRole = keyof typeof ACCENT_STRENGTH

/**
 * The accent a given year is assigned, before muting.
 *
 * Years cycle through the sequence in order, so 2024 and 2025 never collide
 * and the assignment is stable for the life of the vault.
 */
export function accentForYear(palette: Palette, year: number, firstYear: number): string {
  const sequence = palette.accentSequence
  const offset = ((year - firstYear) % sequence.length + sequence.length) % sequence.length
  return sequence[offset]!
}

/** A `color-mix` expression muting `accent` toward the surface. */
export function mutedAccent(accent: string, role: AccentRole): string {
  return `color-mix(in oklch, ${accent} ${ACCENT_STRENGTH[role]}%, var(--surface))`
}

/**
 * The custom properties a year workspace sets on its own subtree.
 *
 * A manual per-year override replaces the sequence value; everything
 * downstream is derived from whichever accent wins, so an override is muted by
 * exactly the same rules.
 */
export function yearAccentVariables(
  palette: Palette,
  year: number,
  firstYear: number,
  override?: string | null
): Record<string, string> {
  const accent = override && override.length > 0 ? override : accentForYear(palette, year, firstYear)
  return {
    '--year-accent': accent,
    '--year-accent-wash': mutedAccent(accent, 'wash'),
    '--year-accent-tint': mutedAccent(accent, 'tint'),
    '--year-accent-line': mutedAccent(accent, 'line'),
    '--year-accent-mark': mutedAccent(accent, 'mark')
  }
}
