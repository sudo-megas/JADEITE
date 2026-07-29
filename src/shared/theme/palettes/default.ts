/**
 * JADEITE's own restrained neutrals — XJADEITE §12.1.
 *
 * These are the house palettes, and the ones the app falls back to. They are
 * deliberately quiet: near-neutral greys carrying a faint green cast, with a
 * single jade accent doing all the work. Nothing competes with the numbers.
 *
 * Default Dark is the palette shown before the vault is open, because the
 * chosen palette lives inside the vault and cannot be read until it unlocks.
 */

import type { Palette } from '../types.js'

export const defaultDark: Palette = {
  id: 'default-dark',
  name: 'Default Dark',
  mode: 'dark',
  tokens: {
    surface: '#101215',
    surfaceRaised: '#171a1f',
    surfaceSunken: '#0c0e11',
    surfaceOverlay: '#1e222a',
    border: '#262b33',
    borderStrong: '#39414d',
    text: '#e6e9ee',
    textMuted: '#98a1af',
    textSubtle: '#6c7684',
    textOnAccent: '#08201c',
    accent: '#4a9d8e',
    accentHover: '#5cb3a3',
    danger: '#c96a5f',
    warning: '#c9a25f',
    success: '#6fa86a',
    info: '#5f92c9',
    focusRing: '#5cb3a3',
    selection: '#2b3540'
  },
  accentSequence: [
    '#4a9d8e',
    '#5f92c9',
    '#a08bc4',
    '#c9a25f',
    '#6fa86a',
    '#c98fa8',
    '#7fa8b8',
    '#b08968'
  ]
}

export const defaultLight: Palette = {
  id: 'default-light',
  name: 'Default Light',
  mode: 'light',
  tokens: {
    surface: '#eceef0',
    surfaceRaised: '#f7f8f9',
    surfaceSunken: '#e2e5e8',
    surfaceOverlay: '#ffffff',
    border: '#d3d8dd',
    borderStrong: '#b3bbc4',
    text: '#1b1f24',
    textMuted: '#59616b',
    textSubtle: '#7d858f',
    textOnAccent: '#f7f8f9',
    accent: '#2f7d6f',
    accentHover: '#27695d',
    danger: '#a8433a',
    warning: '#8a6416',
    success: '#3f7a3a',
    info: '#2f5f96',
    focusRing: '#2f7d6f',
    selection: '#cfd6dd'
  },
  accentSequence: [
    '#2f7d6f',
    '#2f5f96',
    '#6a4f96',
    '#8a6416',
    '#3f7a3a',
    '#96406a',
    '#3f7a8a',
    '#8a5a3a'
  ]
}
