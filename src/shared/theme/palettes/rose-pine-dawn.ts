/**
 * Rosé Pine Dawn — canonical values from rose-pine/palette
 * (dist/css/rose-pine-class.css).
 *
 * Dawn is the light variant: `surface` is lighter than `base`, so a panel on
 * surface reads as lifted off the page.
 */

import type { Palette } from '../types.js'

const base = '#faf4ed'
const surface = '#fffaf3'
const overlay = '#f2e9e1'
const muted = '#9893a5'
const subtle = '#797593'
const text = '#575279'
const love = '#b4637a'
const gold = '#ea9d34'
const rose = '#d7827e'
const pine = '#286983'
const foam = '#56949f'
const iris = '#907aa9'
const highlightMed = '#dfdad9'
const highlightHigh = '#cecacd'

export const rosePineDawn: Palette = {
  id: 'rose-pine-dawn',
  name: 'Rosé Pine Dawn',
  mode: 'light',
  tokens: {
    surface: base,
    surfaceRaised: surface,
    surfaceSunken: overlay,
    surfaceOverlay: surface,
    border: highlightMed,
    borderStrong: highlightHigh,
    text,
    textMuted: subtle,
    textSubtle: muted,
    textOnAccent: surface,
    accent: pine,
    accentHover: foam,
    danger: love,
    warning: gold,
    success: '#568259',
    info: foam,
    focusRing: iris,
    selection: highlightHigh
  },
  accentSequence: [pine, foam, iris, gold, love, rose, '#568259', subtle]
}
