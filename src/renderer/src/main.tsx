import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { initI18n } from './i18n/index.js'
import { applyPalette } from './theme/apply.js'
import { FALLBACK_PALETTE_ID, paletteById } from '@shared/theme/palettes/index.js'
import './theme/tokens.css'
import './app.css'

// Paint before the first frame so the lock screen never flashes unstyled. The
// owner's chosen palette lives inside the vault and cannot be read until it
// unlocks, so this is Default Dark by necessity, not by preference.
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
