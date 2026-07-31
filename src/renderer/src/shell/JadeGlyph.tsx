/**
 * The jade mark — a faceted cabochon, drawn rather than photographed.
 *
 * The stone the app is named for, cut into eight facets around a table. Geometry
 * and not shading, because a mark has to survive being eighteen pixels wide next
 * to a thirteen-pixel wordmark, and a photograph of a gem at that size is a
 * smudge with a highlight on it.
 *
 * **It takes its colour from the palette, never from jade.** A fixed green would
 * be right in one of the ten palettes of §12.3 and a foreign body in the other
 * nine — and §4.1 puts the palette on screen from the lock ceremony onward, so
 * the mark has to be part of that promise rather than the one exception to it.
 * The body is the active accent mixed toward the surface, the facets are
 * `currentColor`. That is also why this takes no props: palette switching writes
 * custom properties onto the document element (`theme/apply.ts`), so the glyph
 * is already the right colour wherever it is placed and follows a change of
 * palette without a subscription, a re-render or a prop threaded through four
 * screens.
 *
 * The colours are written as `style` rather than as `fill=` / `stroke=`. An SVG
 * presentation attribute is parsed as paint and not as a CSS value, so
 * `fill="var(--accent)"` resolves to nothing at all; going through the style
 * property puts the custom property in front of the CSS parser, where `var()`
 * means something. `currentColor` is the one paint that works either way, and is
 * left as an attribute where it stands alone.
 *
 * No `<defs>`, no gradient, and therefore no ids. The mark is rendered several
 * times in one document — the navigation rail, and the ceremony panel behind it
 * during a re-lock — and duplicate ids would have the last copy silently repaint
 * the first. The facets do the work a gradient would have done, and they do it
 * in a palette the gradient could not have known.
 */

import type { ReactElement } from 'react'

/** The body, mixed toward the surface so it sits in the palette rather than on it. */
const BODY = { fill: 'color-mix(in oklch, var(--accent) 34%, var(--surface))' }

/** The table facet — the flat top of the stone, and the one saturated note. */
const TABLE = { fill: 'var(--accent)' }

export function JadeGlyph({ size = 18 }: { size?: number }): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className="jade-glyph"
    >
      <path
        d="M12 2.6 L18.6 5.4 L21.4 12 L18.6 18.6 L12 21.4 L5.4 18.6 L2.6 12 L5.4 5.4 Z"
        style={BODY}
        stroke="currentColor"
        strokeWidth={1}
        strokeLinejoin="round"
        opacity={0.9}
      />
      <path
        d="M12 7.7 L15.05 9 L16.3 12 L15.05 15 L12 16.3 L8.95 15 L7.7 12 L8.95 9 Z"
        style={TABLE}
        opacity={0.5}
      />
      {/* The four crown facets. The axial four are left out on purpose: eight
          lines inside eighteen pixels is a hatch, not a cut stone. */}
      <g stroke="currentColor" strokeWidth={0.9} strokeLinecap="round" opacity={0.3}>
        <path d="M18.6 5.4 L15.05 9" />
        <path d="M18.6 18.6 L15.05 15" />
        <path d="M5.4 18.6 L8.95 15" />
        <path d="M5.4 5.4 L8.95 9" />
      </g>
    </svg>
  )
}
