/**
 * Painting a palette onto the document.
 *
 * Switching is a write of custom properties on the root element — no
 * stylesheet swap, no reload, no flash. Every component reads the same names
 * whichever palette is active.
 */

import { TOKEN_NAMES, cssVariableName, type Palette } from '@shared/theme/types.js'

export function applyPalette(palette: Palette, root: HTMLElement): void {
  const style = root.style
  for (const token of TOKEN_NAMES) {
    style.setProperty(cssVariableName(token), palette.tokens[token])
  }

  // Lets the UA style form controls, scrollbars and caret to match.
  style.setProperty('color-scheme', palette.mode)
  root.dataset['palette'] = palette.id
  root.dataset['mode'] = palette.mode
}
