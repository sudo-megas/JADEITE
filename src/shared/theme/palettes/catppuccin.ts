/**
 * Catppuccin — canonical values from catppuccin/palette (palette.json).
 *
 * All four flavours share one mapping from Catppuccin's own names to JADEITE's
 * tokens, so they stay consistent with each other by construction.
 */

import type { Palette } from '../types.js'

interface Flavour {
  base: string
  mantle: string
  crust: string
  surface0: string
  surface1: string
  surface2: string
  overlay0: string
  overlay1: string
  subtext0: string
  subtext1: string
  text: string
  blue: string
  sapphire: string
  teal: string
  green: string
  yellow: string
  peach: string
  red: string
  mauve: string
  pink: string
  lavender: string
}

function fromFlavour(
  id: string,
  name: string,
  mode: 'light' | 'dark',
  c: Flavour
): Palette {
  // Catppuccin orders crust < mantle < base < surface0 < surface1 from dark to
  // light. In a dark flavour that means raised surfaces climb toward surface0;
  // in Latte the page itself sits on mantle so a card on base reads as lifted
  // rather than sunken.
  const elevation =
    mode === 'dark'
      ? { surface: c.base, raised: c.surface0, sunken: c.mantle, overlay: c.surface1 }
      : { surface: c.mantle, raised: c.base, sunken: c.crust, overlay: c.base }

  return {
    id,
    name,
    mode,
    tokens: {
      surface: elevation.surface,
      surfaceRaised: elevation.raised,
      surfaceSunken: elevation.sunken,
      surfaceOverlay: elevation.overlay,
      border: c.surface1,
      borderStrong: c.surface2,
      text: c.text,
      textMuted: c.subtext1,
      textSubtle: c.overlay1,
      // Accents are light in the dark flavours and saturated in Latte, so the
      // foreground painted on them flips with the mode.
      textOnAccent: mode === 'dark' ? c.crust : c.base,
      accent: c.blue,
      accentHover: c.sapphire,
      danger: c.red,
      warning: c.yellow,
      success: c.green,
      info: c.teal,
      focusRing: c.lavender,
      selection: c.surface2
    },
    accentSequence: [c.blue, c.green, c.mauve, c.peach, c.teal, c.pink, c.yellow, c.sapphire]
  }
}

export const catppuccinLatte = fromFlavour('catppuccin-latte', 'Catppuccin Latte', 'light', {
  base: '#eff1f5',
  mantle: '#e6e9ef',
  crust: '#dce0e8',
  surface0: '#ccd0da',
  surface1: '#bcc0cc',
  surface2: '#acb0be',
  overlay0: '#9ca0b0',
  overlay1: '#8c8fa1',
  subtext0: '#6c6f85',
  subtext1: '#5c5f77',
  text: '#4c4f69',
  blue: '#1e66f5',
  sapphire: '#209fb5',
  teal: '#179299',
  green: '#40a02b',
  yellow: '#df8e1d',
  peach: '#fe640b',
  red: '#d20f39',
  mauve: '#8839ef',
  pink: '#ea76cb',
  lavender: '#7287fd'
})

export const catppuccinFrappe = fromFlavour('catppuccin-frappe', 'Catppuccin Frappé', 'dark', {
  base: '#303446',
  mantle: '#292c3c',
  crust: '#232634',
  surface0: '#414559',
  surface1: '#51576d',
  surface2: '#626880',
  overlay0: '#737994',
  overlay1: '#838ba7',
  subtext0: '#a5adce',
  subtext1: '#b5bfe2',
  text: '#c6d0f5',
  blue: '#8caaee',
  sapphire: '#85c1dc',
  teal: '#81c8be',
  green: '#a6d189',
  yellow: '#e5c890',
  peach: '#ef9f76',
  red: '#e78284',
  mauve: '#ca9ee6',
  pink: '#f4b8e4',
  lavender: '#babbf1'
})

export const catppuccinMacchiato = fromFlavour(
  'catppuccin-macchiato',
  'Catppuccin Macchiato',
  'dark',
  {
    base: '#24273a',
    mantle: '#1e2030',
    crust: '#181926',
    surface0: '#363a4f',
    surface1: '#494d64',
    surface2: '#5b6078',
    overlay0: '#6e738d',
    overlay1: '#8087a2',
    subtext0: '#a5adcb',
    subtext1: '#b8c0e0',
    text: '#cad3f5',
    blue: '#8aadf4',
    sapphire: '#7dc4e4',
    teal: '#8bd5ca',
    green: '#a6da95',
    yellow: '#eed49f',
    peach: '#f5a97f',
    red: '#ed8796',
    mauve: '#c6a0f6',
    pink: '#f5bde6',
    lavender: '#b7bdf8'
  }
)

export const catppuccinMocha = fromFlavour('catppuccin-mocha', 'Catppuccin Mocha', 'dark', {
  base: '#1e1e2e',
  mantle: '#181825',
  crust: '#11111b',
  surface0: '#313244',
  surface1: '#45475a',
  surface2: '#585b70',
  overlay0: '#6c7086',
  overlay1: '#7f849c',
  subtext0: '#a6adc8',
  subtext1: '#bac2de',
  text: '#cdd6f4',
  blue: '#89b4fa',
  sapphire: '#74c7ec',
  teal: '#94e2d5',
  green: '#a6e3a1',
  yellow: '#f9e2af',
  peach: '#fab387',
  red: '#f38ba8',
  mauve: '#cba6f7',
  pink: '#f5c2e7',
  lavender: '#b4befe'
})
