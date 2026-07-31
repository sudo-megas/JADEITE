/**
 * The application mark — the jade shield, beside the wordmark.
 *
 * This replaces the drawn `JadeGlyph` of v0.8b, and the replacement is a ruling
 * rather than a refinement. That glyph took its colour from the palette so it
 * would be native in all ten themes of §12.3, and it was: a flat cabochon in
 * whatever accent was in force. The owner's judgement is that a token-tinted
 * diagram reads as a placeholder beside the rest of the application, and that
 * the app should wear the mark it was drawn for. The artwork is fixed jade and
 * gold, and it is fixed in all ten palettes.
 *
 * What that costs, stated rather than discovered later: the mark no longer moves
 * with the palette, so it is the one element on screen that looks the same in
 * Nord as in Rose Pine Dawn. §12.2 is not violated — it governs colour written
 * in code, and `audit-colours.mjs` reads `.ts`, `.tsx`, `.css` and `.html`, none
 * of which a raster is — but the reasoning behind the old glyph is superseded
 * here rather than quietly left standing.
 *
 * **Decorative, always.** Every placement already names the brand in text beside
 * it — the rail's `nav` carries it as its accessible name, and each ceremony
 * panel prints it as a wordmark. So the image is hidden from the accessibility
 * tree and carries an empty `alt`: a screen reader that announced it would say
 * "JADEITE" twice.
 *
 * **Twenty-two pixels**, against thirteen-pixel wordmarks. Eighteen was the
 * glyph's size and was chosen for a drawing; rendered at eighteen, the shield is
 * a green dot with the lock lost inside it. The lock only resolves near
 * twenty-eight, which overpowers the wordmark. Twenty-two is where the stone
 * reads as a stone without the mark becoming the headline.
 *
 * The file is 128 px so the same asset stays sharp if the size is ever raised or
 * the app meets a scaled display; at twenty-two that is nearly six times over.
 * It is derived from `build/innerAPP.png`, whose alpha is genuine — see
 * `electron-builder.yml` for how the square assets are cut from the masters.
 */

import type { ReactElement } from 'react'

import markSrc from '../assets/mark.png'

export function BrandMark({ size = 22 }: { size?: number }): ReactElement {
  return (
    <img
      className="brand-mark"
      src={markSrc}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  )
}
