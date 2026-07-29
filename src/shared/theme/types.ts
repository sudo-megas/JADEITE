/**
 * The token contract — XJADEITE §12.2.
 *
 * Every colour in the app resolves through these names. A palette is a map
 * from them to values; no component ever names a colour itself. The audit in
 * scripts/audit-colours.mjs enforces that, and fails the build when it slips.
 */

export type PaletteMode = 'light' | 'dark'

export interface PaletteTokens {
  /** The application background. */
  surface: string
  /** Panels, cards, the navigation rail. */
  surfaceRaised: string
  /** Inputs and wells — anything that reads as cut into the surface. */
  surfaceSunken: string
  /** Menus and dialogs floating above everything. */
  surfaceOverlay: string

  /** Quiet dividers. */
  border: string
  /** Input outlines and anything that must be found by eye. */
  borderStrong: string

  text: string
  textMuted: string
  textSubtle: string
  /** Foreground for anything painted on `accent`. */
  textOnAccent: string

  accent: string
  accentHover: string

  danger: string
  warning: string
  success: string
  info: string

  focusRing: string
  selection: string
}

export interface Palette {
  id: string
  /** Shown in the palette picker, never translated — these are proper names. */
  name: string
  mode: PaletteMode
  tokens: PaletteTokens
  /**
   * Ordered accent sequence for year workspaces (§12.3).
   *
   * Years take the next entry in turn. Chosen to stay distinguishable at a
   * glance while remaining inside the palette's own character — this is not a
   * kid's-play app, and the sequence is muted toward the surface before it
   * ever reaches a pixel.
   */
  accentSequence: readonly string[]
}

export const TOKEN_NAMES = [
  'surface',
  'surfaceRaised',
  'surfaceSunken',
  'surfaceOverlay',
  'border',
  'borderStrong',
  'text',
  'textMuted',
  'textSubtle',
  'textOnAccent',
  'accent',
  'accentHover',
  'danger',
  'warning',
  'success',
  'info',
  'focusRing',
  'selection'
] as const satisfies readonly (keyof PaletteTokens)[]

/** `surfaceRaised` becomes `--surface-raised`. */
export function cssVariableName(token: keyof PaletteTokens): string {
  return `--${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`
}
