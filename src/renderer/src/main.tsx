import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { initI18n } from './i18n/index.js'
import { applyPalette } from './theme/apply.js'
import { FALLBACK_PALETTE_ID, paletteById } from '@shared/theme/palettes/index.js'
import './theme/tokens.css'
import './app.css'

// Paint before the first frame so the lock screen never flashes unstyled.
// Reading config.json is a round trip through the bridge, so the owner's chosen
// palette lands a moment later (App → loadAppearance); this is the colour of
// that moment, not a preference.
applyPalette(paletteById(FALLBACK_PALETTE_ID), document.documentElement)
initI18n()
document.documentElement.lang = 'tr'

const container = document.getElementById('root')
if (!container) throw new Error('root element missing')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)

// Cold-start instrumentation (§3.4). The budget is enforced from Realisation II
// onward; the main process logs its own half of the journey.
requestAnimationFrame(() => {
  const paintedAt = performance.now()
  queueMicrotask(() => {
    performance.mark('jadeite:first-paint')
    if (import.meta.env.DEV) {
      console.info(`[cold-start] renderer first paint: ${Math.round(paintedAt)} ms`)
    }
  })
})
