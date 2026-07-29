/**
 * Noctalia — canonical values from noctalia-dev/noctalia
 * (src/theme/builtin_palettes.cpp, the "Noctalia" entry, dark variant).
 *
 * Noctalia describes colours in Material roles rather than a ramp, so the
 * intermediate greys JADEITE needs between `surface` and `surfaceVariant` are
 * interpolated from the two the palette actually publishes.
 */

import type { Palette } from '../types.js'

const surface = '#070722'
const onSurface = '#f3edf7'
const surfaceVariant = '#11112d'
const onSurfaceVariant = '#7c80b4'
const outline = '#21215f'
const primary = '#fff59b'
const onPrimary = '#0e0e43'
const secondary = '#a9aefe'
const tertiary = '#9bfece'
const error = '#fd4663'

export const noctalia: Palette = {
  id: 'noctalia',
  name: 'Noctalia',
  mode: 'dark',
  tokens: {
    surface,
    surfaceRaised: surfaceVariant,
    surfaceSunken: '#04041a',
    surfaceOverlay: '#181840',
    border: outline,
    borderStrong: '#2e2e7a',
    text: onSurface,
    textMuted: '#b9bce0',
    textSubtle: onSurfaceVariant,
    textOnAccent: onPrimary,
    accent: primary,
    accentHover: tertiary,
    danger: error,
    warning: '#ffc46b',
    success: tertiary,
    info: secondary,
    focusRing: secondary,
    selection: '#2e2e7a'
  },
  accentSequence: [primary, secondary, tertiary, '#ffc46b', error, '#c9a6ff', '#6fd3f5', '#8288fc']
}
