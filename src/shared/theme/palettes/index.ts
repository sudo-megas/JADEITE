/**
 * The ten palettes of XJADEITE §12.1 — six dark, four light.
 *
 * This directory is the only place in the renderer permitted to name a colour
 * literally; scripts/audit-colours.mjs fails the build if one appears anywhere
 * else.
 */

import type { Palette } from '../types.js'
import { defaultDark, defaultLight } from './default.js'
import { noctalia } from './noctalia.js'
import {
  catppuccinFrappe,
  catppuccinLatte,
  catppuccinMacchiato,
  catppuccinMocha
} from './catppuccin.js'
import { rosePineDawn } from './rose-pine-dawn.js'
import { nord } from './nord.js'
import { kanagawaLotus } from './kanagawa-lotus.js'

/** Presentation order in the palette picker. */
export const PALETTES: readonly Palette[] = Object.freeze([
  defaultLight,
  defaultDark,
  noctalia,
  catppuccinLatte,
  catppuccinFrappe,
  catppuccinMacchiato,
  catppuccinMocha,
  rosePineDawn,
  nord,
  kanagawaLotus
])

/** Shown before the vault opens, and whenever a stored id is unrecognised. */
export const FALLBACK_PALETTE_ID = defaultDark.id

const byId = new Map(PALETTES.map((p) => [p.id, p]))

export function paletteById(id: string | null | undefined): Palette {
  return (id ? byId.get(id) : undefined) ?? byId.get(FALLBACK_PALETTE_ID)!
}

export function isKnownPaletteId(id: string): boolean {
  return byId.has(id)
}
