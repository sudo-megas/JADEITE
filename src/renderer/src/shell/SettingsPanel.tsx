/**
 * Appearance and language, both stored inside the vault.
 *
 * Language changes only when the owner changes it here (§13). The formatting
 * sample is live so the effect of the choice is visible before it matters to
 * real money.
 */

import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { useAppStore } from '../store/app-store.js'
import { PALETTES } from '@shared/theme/palettes/index.js'
import { LANGUAGES } from '../i18n/index.js'
import { formatDate, formatGrams, formatMoney } from '../i18n/format.js'

export function SettingsPanel(): ReactElement {
  const { t } = useTranslation()
  const paletteId = useAppStore((s) => s.paletteId)
  const language = useAppStore((s) => s.language)
  const autoLockMinutes = useAppStore((s) => s.autoLockMinutes)
  const setPalette = useAppStore((s) => s.setPalette)
  const setLanguage = useAppStore((s) => s.setLanguage)

  return (
    <section className="settings" data-testid="settings-panel">
      <h1>{t('settings.title')}</h1>

      <h2 className="settings-heading">{t('settings.appearance')}</h2>
      <p className="lede">{t('settings.palette')}</p>
      <ul className="palette-grid" data-testid="palette-grid">
        {PALETTES.map((palette) => (
          <li key={palette.id}>
            <button
              type="button"
              className="palette-card"
              data-selected={palette.id === paletteId ? 'true' : undefined}
              data-testid={`palette-${palette.id}`}
              aria-pressed={palette.id === paletteId}
              onClick={() => void setPalette(palette.id)}
            >
              <span
                className="palette-swatches"
                // The only inline colours in the app: a palette previewing
                // itself cannot use the active palette's tokens to do it.
                style={{
                  background: palette.tokens.surface,
                  borderColor: palette.tokens.border
                }}
              >
                <i style={{ background: palette.tokens.accent }} />
                <i style={{ background: palette.tokens.text }} />
                <i style={{ background: palette.tokens.surfaceRaised }} />
                <i style={{ background: palette.tokens.success }} />
                <i style={{ background: palette.tokens.danger }} />
              </span>
              <span className="palette-name">{palette.name}</span>
              <span className="palette-mode">
                {palette.mode === 'dark'
                  ? t('settings.paletteModeDark')
                  : t('settings.paletteModeLight')}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <h2 className="settings-heading">{t('settings.language')}</h2>
      <div className="segmented" data-testid="language-switch">
        {LANGUAGES.map((code) => (
          <button
            key={code}
            type="button"
            className="segmented-item"
            data-selected={code === language ? 'true' : undefined}
            aria-pressed={code === language}
            data-testid={`language-${code}`}
            onClick={() => void setLanguage(code)}
          >
            {code === 'tr' ? t('settings.languageTurkish') : t('settings.languageEnglish')}
          </button>
        ))}
      </div>

      <h2 className="settings-heading">{t('settings.formattingPreview')}</h2>
      <div className="status-row">
        <span>₺</span>
        <span data-testid="sample-try">{formatMoney(123456, 'TRY', language)}</span>
      </div>
      <div className="status-row">
        <span>$</span>
        <span data-testid="sample-usd">{formatMoney(123456, 'USD', language)}</span>
      </div>
      <div className="status-row">
        <span>g</span>
        <span data-testid="sample-grams">{formatGrams(30_000, language)}</span>
      </div>
      <div className="status-row">
        <span>·</span>
        <span data-testid="sample-date">{formatDate('2026-05-18', language)}</span>
      </div>

      <h2 className="settings-heading">{t('settings.security')}</h2>
      <div className="status-row">
        <span>{t('settings.autoLock')}</span>
        <span data-testid="auto-lock">
          {autoLockMinutes} {t('settings.autoLockUnit')}
        </span>
      </div>
    </section>
  )
}
