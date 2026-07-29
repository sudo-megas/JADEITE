/**
 * Kanagawa Lotus — canonical values from rebelot/kanagawa.nvim
 * (lua/kanagawa/colors.lua, the lotus* entries).
 *
 * Lotus is the light variant of Kanagawa: warm paper whites with ink-dark text.
 */

import type { Palette } from '../types.js'

const lotusWhite3 = '#f2ecbc'
const lotusWhite2 = '#e5ddb0'
const lotusWhite1 = '#dcd5ac'
const lotusWhite0 = '#d5cea3'
const lotusInk1 = '#545464'
const lotusInk2 = '#43436c'
const lotusGray2 = '#716e61'
const lotusGray3 = '#8a8980'
const lotusViolet4 = '#624c83'
const lotusBlue4 = '#4d699b'
const lotusBlue5 = '#5d57a3'
const lotusGreen = '#6f894e'
const lotusPink = '#b35b79'
const lotusOrange = '#cc6d00'
const lotusRed = '#c84053'
const lotusYellow = '#77713f'
const lotusAqua = '#597b75'
const lotusTeal1 = '#4e8ca2'

export const kanagawaLotus: Palette = {
  id: 'kanagawa-lotus',
  name: 'Kanagawa Lotus',
  mode: 'light',
  tokens: {
    surface: lotusWhite2,
    surfaceRaised: lotusWhite3,
    surfaceSunken: lotusWhite1,
    surfaceOverlay: lotusWhite3,
    border: lotusWhite0,
    borderStrong: lotusGray3,
    text: lotusInk1,
    textMuted: lotusGray2,
    textSubtle: lotusGray3,
    textOnAccent: lotusWhite3,
    accent: lotusBlue4,
    accentHover: lotusTeal1,
    danger: lotusRed,
    warning: lotusOrange,
    success: lotusGreen,
    info: lotusAqua,
    focusRing: lotusBlue5,
    selection: lotusWhite0
  },
  accentSequence: [
    lotusBlue4,
    lotusGreen,
    lotusViolet4,
    lotusOrange,
    lotusAqua,
    lotusPink,
    lotusYellow,
    lotusInk2
  ]
}
