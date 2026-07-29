/**
 * Nord — canonical values from nordtheme/nord (src/nord.css).
 *
 * nord0-3 are the Polar Night greys, nord4-6 Snow Storm, nord7-10 Frost,
 * nord11-15 Aurora.
 */

import type { Palette } from '../types.js'

const nord0 = '#2e3440'
const nord1 = '#3b4252'
const nord2 = '#434c5e'
const nord3 = '#4c566a'
const nord4 = '#d8dee9'
const nord6 = '#eceff4'
const nord7 = '#8fbcbb'
const nord8 = '#88c0d0'
const nord9 = '#81a1c1'
const nord10 = '#5e81ac'
const nord11 = '#bf616a'
const nord12 = '#d08770'
const nord13 = '#ebcb8b'
const nord14 = '#a3be8c'
const nord15 = '#b48ead'

export const nord: Palette = {
  id: 'nord',
  name: 'Nord',
  mode: 'dark',
  tokens: {
    surface: nord0,
    surfaceRaised: nord1,
    surfaceSunken: '#272c36',
    surfaceOverlay: nord2,
    border: nord2,
    borderStrong: nord3,
    text: nord6,
    textMuted: nord4,
    textSubtle: '#8a93a5',
    textOnAccent: nord0,
    accent: nord8,
    accentHover: nord7,
    danger: nord11,
    warning: nord13,
    success: nord14,
    info: nord9,
    focusRing: nord8,
    selection: nord3
  },
  accentSequence: [nord8, nord14, nord15, nord13, nord7, nord9, nord12, nord10]
}
