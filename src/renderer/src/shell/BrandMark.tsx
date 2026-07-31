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
 * **Sixty-six pixels** — three times the twenty-two this shipped at in v0.9b,
 * at the owner's judgement that the mark read as an afterthought. Four times was
 * asked for first and is not available: the rail has 187px of usable width, and
 * an 88px mark with a wordmark scaled to match needs 382–486px. Three times fits
 * both placements, though only because the rail head stops being a row — see
 * `.rail-brand` in `app.css` for that arithmetic.
 *
 * The size is passed explicitly at both call sites rather than left to this
 * default, because the two placements each pair the mark with a differently
 * sized wordmark and a silent divergence between them is exactly the bug this
 * component exists to prevent. The default matches them; it is not relied upon.
 *
 * The file is 256px, raised from 128 when the render size tripled. 128 is sharp
 * to 64 CSS px on a 2× display and this asks for 66 — and the recovery-key sheet
 * is printable, where a 128px source at 66 CSS px would be upscaled on paper.
 * It is derived from `build/innerAPP.png`, whose alpha is genuine — see
 * `electron-builder.yml` for how the square assets are cut from the masters.
 */

import type { ReactElement } from 'react'

import markSrc from '../assets/mark.png'

export function BrandMark({ size = 66 }: { size?: number }): ReactElement {
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
