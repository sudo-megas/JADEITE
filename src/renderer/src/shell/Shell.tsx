/**
 * The application shell — navigation rail, content area, keyboard map.
 *
 * Realisation II builds the frame; the sections that fill it arrive from III
 * onward.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { DESTINATIONS, SETTINGS_DESTINATION_ID } from './destinations.js'
import { SectionStub } from './SectionStub.js'
import { SettingsPanel } from './SettingsPanel.js'
import { Section1 } from '../sections/section1/Section1.js'
import { Section2 } from '../sections/section2/Section2.js'

interface Props {
  onLock: () => void
}

export function Shell({ onLock }: Props): ReactElement {
  const { t } = useTranslation()
  const [active, setActive] = useState<string>(DESTINATIONS[0]!.id)

  const lock = useCallback(async () => {
    await window.jadeite.vault.lock()
    onLock()
  }, [onLock])

  // The keyboard map skeleton: Ctrl+1..6 for destinations, Ctrl+, for
  // settings, Ctrl+L to lock. Sections extend this from Realisation III.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (!event.ctrlKey && !event.metaKey) return

      if (event.key === 'l' || event.key === 'L') {
        event.preventDefault()
        void lock()
        return
      }
      if (event.key === ',') {
        event.preventDefault()
        setActive(SETTINGS_DESTINATION_ID)
        return
      }
      const digit = Number.parseInt(event.key, 10)
      if (Number.isInteger(digit)) {
        const target = DESTINATIONS.find((d) => d.accelerator === digit)
        if (target) {
          event.preventDefault()
          setActive(target.id)
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [lock])

  const destination = DESTINATIONS.find((d) => d.id === active)

  return (
    <div className="shell-frame" data-testid="shell">
      <nav className="rail" aria-label={t('common.brand')}>
        <p className="rail-brand">{t('common.brand')}</p>

        <ul className="rail-list">
          {DESTINATIONS.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                className="rail-item"
                aria-current={active === d.id ? 'page' : undefined}
                data-active={active === d.id ? 'true' : undefined}
                data-testid={`nav-${d.id}`}
                onClick={() => setActive(d.id)}
              >
                <span>{t(d.labelKey)}</span>
                <kbd className="rail-key">{d.accelerator}</kbd>
              </button>
            </li>
          ))}
        </ul>

        <div className="rail-foot">
          <button
            type="button"
            className="rail-item"
            aria-current={active === SETTINGS_DESTINATION_ID ? 'page' : undefined}
            data-active={active === SETTINGS_DESTINATION_ID ? 'true' : undefined}
            data-testid="nav-settings"
            onClick={() => setActive(SETTINGS_DESTINATION_ID)}
          >
            <span>{t('nav.settings')}</span>
            <kbd className="rail-key">,</kbd>
          </button>
          <button type="button" className="rail-item" data-testid="nav-lock" onClick={() => void lock()}>
            <span>{t('nav.lock')}</span>
            <kbd className="rail-key">L</kbd>
          </button>
        </div>
      </nav>

      <main className="content" data-testid="content">
        {!destination ? (
          <SettingsPanel />
        ) : destination.id === 'section1' ? (
          <Section1 />
        ) : destination.id === 'section2' ? (
          <Section2 />
        ) : (
          <SectionStub destination={destination} />
        )}
      </main>
    </div>
  )
}
