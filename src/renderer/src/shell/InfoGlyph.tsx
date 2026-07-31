/**
 * The information mark, for the rail's Hakkında entry.
 *
 * `docs/conficon.md` asks for an icon on this one entry, and it is the only
 * rail item that carries one. That is deliberate rather than half-finished: the
 * six numbered destinations and the two foot entries beside this one are places
 * the owner works, distinguished by their labels and their accelerators, and
 * giving all of them icons would add a column of decoration to a rail whose
 * whole argument is restraint. This entry is the odd one out — it is the only
 * page that is *about* the application rather than about the money — and the
 * mark says so.
 *
 * Drawn rather than imported, for the reason the retired jade glyph gave and
 * which still holds here: `audit-colours.mjs` fails the build on any hex literal
 * in a `.tsx`, and an SVG presentation attribute is parsed as paint rather than
 * as a CSS value, so `stroke="var(--text-muted)"` would resolve to nothing at
 * all. `currentColor` is the one paint that works as an attribute, and it means
 * the mark simply inherits whatever `.rail-item` is currently coloured —
 * including the hover and active states, without a rule of its own.
 *
 * No `<defs>` and no ids: the rail is one document and a second copy of an id
 * would have the last silently repaint the first.
 */

import type { ReactElement } from 'react'

export function InfoGlyph({ size = 14 }: { size?: number }): ReactElement {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
    >
      <circle cx="8" cy="8" r="6.4" />
      <path d="M8 7.1 L8 11.2" />
      <path d="M8 4.7 L8 4.9" />
    </svg>
  )
}
